/**
 * Admin API Routes
 * Express routes for admin functionality including authentication and management
 */
const express = require('express');
const router = express.Router();
const { connectToDatabase } = require('../../config/database');
const IpoModel = require('../../models/IpoModel');
const cronManager = require('../../utils/cronManager');
const path = require('path');
const fs = require('fs');

// Middleware for admin authentication
const authenticateAdmin = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKey = process.env.ADMIN_API_KEY;
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Unauthorized. Invalid API key.' });
  }
  
  next();
};

// Apply admin authentication to all routes
router.use(authenticateAdmin);

/**
 * @route   GET /api/admin/status
 * @desc    Get system status for admin dashboard
 * @access  Admin
 */
router.get('/status', async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get MongoDB status
    const dbStats = {
      connected: true,
      ipoCount: await IpoModel.countDocuments()
    };
    
    // Get cron job status
    const cronStatus = cronManager.getStatus();
    
    // Get server info
    const serverInfo = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node: process.version,
      platform: process.platform,
      pid: process.pid
    };
    
    // Get log files info
    const logsDir = path.join(process.cwd(), 'logs');
    let logFiles = [];
    
    try {
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        logFiles = files
          .filter(file => file.endsWith('.log'))
          .map(file => {
            const stats = fs.statSync(path.join(logsDir, file));
            return {
              name: file,
              size: stats.size,
              modified: stats.mtime,
              path: `/api/admin/logs/${file}`
            };
          })
          .sort((a, b) => b.modified - a.modified); // Most recent first
      }
    } catch (logError) {
      console.error('Error reading log files:', logError);
      logFiles = [{ error: 'Failed to read log files' }];
    }
    
    return res.status(200).json({
      status: 'ok',
      database: dbStats,
      cron: cronStatus,
      server: serverInfo,
      logs: logFiles,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting admin status:', error);
    return res.status(500).json({ error: 'Failed to get system status' });
  }
});

/**
 * @route   GET /api/admin/logs/:filename
 * @desc    Get a specific log file
 * @access  Admin
 */
router.get('/logs/:filename', (req, res) => {
  try {
    const sanitizedFilename = path.basename(req.params.filename);
    const logFile = path.join(process.cwd(), 'logs', sanitizedFilename);
    
    if (!fs.existsSync(logFile)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    
    // Check if file has .log extension for security
    if (!logFile.endsWith('.log')) {
      return res.status(403).json({ error: 'Not a log file' });
    }
    
    // Set content type and return the file
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    
    const fileStream = fs.createReadStream(logFile);
    fileStream.pipe(res);
  } catch (error) {
    console.error(`Error getting log file ${req.params.filename}:`, error);
    return res.status(500).json({ error: 'Failed to get log file' });
  }
});

/**
 * @route   POST /api/admin/scrape
 * @desc    Trigger an IPO scraping job
 * @access  Admin
 */
router.post('/scrape', (req, res) => {
  try {
    const { year, saveToDb = true } = req.body;
    
    if (!year || isNaN(parseInt(year, 10))) {
      return res.status(400).json({ error: 'Valid year parameter is required' });
    }
    
    // Execute scraper as a background process
    const jobId = cronManager.scheduleSingleJob('manual_scrape', {
      command: 'scrape',
      args: [year, saveToDb ? 'true' : 'false']
    });
    
    return res.status(200).json({
      status: 'scheduled',
      job_id: jobId,
      message: `Scrape job for year ${year} has been scheduled`,
      check_status: `/api/admin/job/${jobId}`
    });
  } catch (error) {
    console.error('Error scheduling scrape job:', error);
    return res.status(500).json({ error: 'Failed to schedule scrape job' });
  }
});

/**
 * @route   GET /api/admin/job/:id
 * @desc    Get status of a specific job
 * @access  Admin
 */
router.get('/job/:id', (req, res) => {
  try {
    const jobId = req.params.id;
    const jobStatus = cronManager.getJobStatus(jobId);
    
    if (!jobStatus) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    return res.status(200).json(jobStatus);
  } catch (error) {
    console.error(`Error getting job status for ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to get job status' });
  }
});

/**
 * @route   GET /api/admin/cron
 * @desc    Get all cron jobs
 * @access  Admin
 */
router.get('/cron', (req, res) => {
  try {
    const cronJobs = cronManager.getAllJobs();
    
    return res.status(200).json({
      count: Object.keys(cronJobs).length,
      jobs: cronJobs
    });
  } catch (error) {
    console.error('Error getting cron jobs:', error);
    return res.status(500).json({ error: 'Failed to get cron jobs' });
  }
});

/**
 * @route   POST /api/admin/cron
 * @desc    Create or update a cron job
 * @access  Admin
 */
router.post('/cron', (req, res) => {
  try {
    const { name, schedule, command, args = [], active = true } = req.body;
    
    if (!name || !schedule || !command) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['name', 'schedule', 'command'] 
      });
    }
    
    // Add or update the job
    const result = cronManager.addOrUpdateJob(name, {
      schedule,
      command,
      args,
      active
    });
    
    return res.status(200).json({
      status: 'success',
      message: `Cron job '${name}' has been ${result.added ? 'added' : 'updated'}`,
      job: result.job
    });
  } catch (error) {
    console.error('Error managing cron job:', error);
    return res.status(500).json({ error: 'Failed to manage cron job' });
  }
});

/**
 * @route   DELETE /api/admin/cron/:name
 * @desc    Delete a cron job
 * @access  Admin
 */
router.delete('/cron/:name', (req, res) => {
  try {
    const jobName = req.params.name;
    
    if (!jobName) {
      return res.status(400).json({ error: 'Job name is required' });
    }
    
    const result = cronManager.removeJob(jobName);
    
    if (result) {
      return res.status(200).json({
        status: 'success',
        message: `Cron job '${jobName}' has been removed`
      });
    } else {
      return res.status(404).json({ error: `Cron job '${jobName}' not found` });
    }
  } catch (error) {
    console.error(`Error removing cron job ${req.params.name}:`, error);
    return res.status(500).json({ error: 'Failed to remove cron job' });
  }
});

/**
 * @route   POST /api/admin/ipo
 * @desc    Add or update an IPO
 * @access  Admin
 */
router.post('/ipo', async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const ipoData = req.body;
    
    if (!ipoData || !ipoData.ipo_id) {
      return res.status(400).json({ error: 'IPO data with ipo_id is required' });
    }
    
    // Upsert the IPO (update if exists, insert if not)
    const result = await IpoModel.findOneAndUpdate(
      { ipo_id: ipoData.ipo_id },
      ipoData,
      { upsert: true, new: true }
    );
    
    return res.status(200).json({
      status: 'success',
      message: `IPO '${ipoData.ipo_id}' has been saved`,
      ipo: result
    });
  } catch (error) {
    console.error('Error saving IPO:', error);
    return res.status(500).json({ error: 'Failed to save IPO' });
  }
});

/**
 * @route   DELETE /api/admin/ipo/:id
 * @desc    Delete an IPO
 * @access  Admin
 */
router.delete('/ipo/:id', async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const ipoId = req.params.id;
    
    if (!ipoId) {
      return res.status(400).json({ error: 'IPO ID is required' });
    }
    
    // Delete the IPO
    const result = await IpoModel.deleteOne({ ipo_id: ipoId });
    
    if (result.deletedCount > 0) {
      return res.status(200).json({
        status: 'success',
        message: `IPO '${ipoId}' has been deleted`
      });
    } else {
      return res.status(404).json({ error: `IPO '${ipoId}' not found` });
    }
  } catch (error) {
    console.error(`Error deleting IPO ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to delete IPO' });
  }
});

/**
 * @route   GET /api/admin/stats
 * @desc    Get database statistics
 * @access  Admin
 */
router.get('/stats', async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get total IPO count
    const totalIpos = await IpoModel.countDocuments();
    
    // Get count by status
    const statusCounts = await IpoModel.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get count by year
    const yearCounts = await IpoModel.aggregate([
      { $group: { _id: "$year", count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);
    
    // Get most recent IPOs
    const recentIpos = await IpoModel.find()
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('ipo_id ipo_name status updatedAt')
      .lean();
    
    return res.status(200).json({
      total_ipos: totalIpos,
      by_status: statusCounts.map(item => ({ status: item._id || 'unknown', count: item.count })),
      by_year: yearCounts.map(item => ({ year: item._id, count: item.count })),
      recent_updates: recentIpos,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting database stats:', error);
    return res.status(500).json({ error: 'Failed to get database statistics' });
  }
});

/**
 * @route   POST /api/admin/recalculate-performance/:id
 * @desc    Recalculate performance metrics for a specific IPO
 * @access  Admin
 */
router.post('/recalculate-performance/:id', async (req, res) => {
  try {
    const ipoId = req.params.id;
    
    // Find the IPO
    const ipo = await IpoModel.findOne({ ipo_id: ipoId });
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    // Force recalculation by touching the model (similar to updateIpoPerformance method)
    ipo.markModified('listingDayTrading');
    await ipo.save();
    
    return res.status(200).json({
      success: true,
      ipo_id: ipo.ipo_id,
      company_name: ipo.company_name,
      listing_gains: ipo.listing_gains,
      listing_gains_numeric: ipo.listing_gains_numeric,
      worst_listing_gains: ipo.worst_listing_gains,
      worst_listing_gains_numeric: ipo.worst_listing_gains_numeric,
      last_updated: ipo.last_performance_update
    });
  } catch (error) {
    console.error(`Error recalculating performance for IPO ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to recalculate performance metrics' });
  }
});

module.exports = router; 