const express = require('express');
const next = require('next');
const db = require('./config/database');
const compression = require('compression');
const { addCronJob, toggleCronJob, startCronJobs, testCronJob, getNextExecutionTime } = require('./scripts/cronManager');
require('dotenv').config();

// Determine if we're in development mode
const dev = process.env.NODE_ENV !== 'production';

// Initialize Next.js
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

// Set port
const PORT = process.env.PORT || 3000;

// Setup default cron jobs
async function setupDefaultCronJobs() {
  try {
    console.log('---------------------------------------------');
    console.log('🕒 SETTING UP DEFAULT CRON JOBS');
    console.log('---------------------------------------------');
    
    // Daily at 2:00 AM IST (UTC+5:30) = 20:30 UTC
    const dailyJob = {
      id: 'daily-ipo-update',
      schedule: '30 20 * * *', // 20:30 UTC = 2:00 AM IST
      task: 'scrape-and-upload',
      enabled: true,
      options: {
        year: new Date().getFullYear(), // Current year
        concurrency: 2,
        saveToMongo: true,
        overwrite: false // Only update modified data
      }
    };
    
    // Add or update the job
    await addCronJob(dailyJob);
    
    // Make sure it's enabled
    await toggleCronJob(dailyJob.id, true);
    
    // Start all enabled cron jobs
    const cronResult = await startCronJobs();
    
    // Verify the cron job configuration
    const jobStatus = await testCronJob(dailyJob.id);
    
    if (jobStatus.success) {
      const nextRun = new Date(jobStatus.nextExecution);
      
      console.log('---------------------------------------------');
      console.log('✅ CRON SYSTEM VERIFICATION');
      console.log('---------------------------------------------');
      console.log(`Status: ${cronResult.count > 0 ? 'RUNNING' : 'NOT RUNNING'}`);
      console.log(`Active Jobs: ${cronResult.activeJobs.join(', ') || 'None'}`);
      console.log(`Daily IPO Update Job: ${jobStatus.enabled ? 'ENABLED' : 'DISABLED'}`); 
      console.log(`Schedule: ${jobStatus.schedule} (${timeDescriptionFromCron(jobStatus.schedule)})`);
      console.log(`Next Run: ${nextRun.toLocaleString()} (in ${getTimeUntil(nextRun)})`);
      console.log('---------------------------------------------');
      
      // If the job would run too far in the future (>12h), offer manual run option
      const hoursToNextRun = (nextRun - new Date()) / (1000 * 60 * 60);
      if (hoursToNextRun > 12) {
        console.log('ℹ️ Next scheduled run is more than 12 hours away.');
        console.log('   To run the job manually, use: npm run cron -- run-now daily-ipo-update');
        console.log('---------------------------------------------');
      }
    } else {
      console.log('---------------------------------------------');
      console.log('❌ CRON VERIFICATION FAILED');
      console.log(`Error: ${jobStatus.error}`);
      console.log('To fix: Check the cron schedule and job configuration');
      console.log('---------------------------------------------');
    }
  } catch (error) {
    console.error('Failed to set up default cron jobs:', error);
    console.log('---------------------------------------------');
    console.log('❌ CRON SETUP FAILED');
    console.log(`Error: ${error.message}`);
    console.log('To fix: Check the cron configuration and logs');
    console.log('---------------------------------------------');
  }
}

/**
 * Get a human-readable description of a cron schedule
 * @param {string} cronExpression - The cron expression
 * @returns {string} - Human readable description
 */
function timeDescriptionFromCron(cronExpression) {
  try {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.split(' ');
    
    if (minute === '30' && hour === '20' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Daily at 2:00 AM IST';
    }
    
    if (dayOfMonth === '*' && month === '*') {
      if (dayOfWeek === '*') {
        return `Daily at ${hour}:${minute}`;
      } else {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayNames = dayOfWeek.split(',').map(d => days[parseInt(d, 10) % 7]);
        return `Every ${dayNames.join(', ')} at ${hour}:${minute}`;
      }
    }
    
    return 'Custom schedule';
  } catch (error) {
    return 'Unknown schedule format';
  }
}

/**
 * Get a human-readable time until a future date
 * @param {Date} futureDate - The future date
 * @returns {string} - Human readable time
 */
function getTimeUntil(futureDate) {
  const now = new Date();
  const diffMs = futureDate - now;
  
  if (diffMs < 0) return 'already passed';
  
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} and ${diffHours % 24} hour${(diffHours % 24) !== 1 ? 's' : ''}`;
  }
  
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} and ${diffMins % 60} minute${(diffMins % 60) !== 1 ? 's' : ''}`;
  }
  
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''}`;
  }
  
  return `${diffSecs} second${diffSecs !== 1 ? 's' : ''}`;
}

// Start Next.js and then start Express
nextApp.prepare().then(() => {
  // Create Express app
  const app = express();
  
  // Apply compression
  app.use(compression());
  
  // Parse JSON body
  app.use(express.json());
  
  // Connect to database
  db.connectToDatabase().then(() => {
    console.log('MongoDB connected in server.js');
    
    // Set up default cron jobs after database connection
    setupDefaultCronJobs();
  }).catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    // Continue server startup even with DB error
  });
  
  // Add server health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: db.isConnected() ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  // Add API documentation route
  app.get('/api', (req, res) => {
    res.json({
      message: 'IPO API Server',
      version: '1.0.0',
      endpoints: [
        { path: '/api/ipos', description: 'Get all IPOs with pagination' },
        { path: '/api/ipos/:id', description: 'Get IPO by ID' },
        { path: '/api/ipos/ids', description: 'Get all IPO IDs' },
        { path: '/api/ipos/years', description: 'Get years with IPO data' },
        { path: '/api/ipos/status/:status', description: 'Get IPOs by status' },
        { path: '/api/ipos/performance', description: 'Get top/worst performing IPOs' }
      ]
    });
  });
  
  // Error handling middleware for API routes
  app.use('/api', (err, req, res, next) => {
    console.error('API error:', err);
    res.status(500).json({
      error: 'Server error',
      message: dev ? err.message : 'An unexpected error occurred'
    });
  });
  
  // Handle all other routes with Next.js
  app.all('*', (req, res) => {
    return handle(req, res);
  });
  
  // Start server
  app.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Error starting Next.js:', err);
  process.exit(1);
}); 