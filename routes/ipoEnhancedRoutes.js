const express = require('express');
const router = express.Router();
const IpoModel = require('../models/IpoModel');
const { extractIpoId } = require('../utils/helpers');

// Get all IPO IDs
router.get('/ids', async (req, res) => {
  try {
    const ipoIds = await IpoModel.find({})
      .select('ipo_id')
      .sort({ opening_date: -1 });
    
    res.json({
      data: ipoIds.map(ipo => ipo.ipo_id)
    });
  } catch (error) {
    console.error('Error fetching IPO IDs:', error);
    res.status(500).json({ error: 'Failed to fetch IPO IDs' });
  }
});

// Get available sections for an IPO
router.get('/:id/sections', async (req, res) => {
  try {
    const ipo = await IpoModel.findOne({ ipo_id: req.params.id });
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    // Extract available sections
    const sections = [];
    const ipoData = ipo.toObject();
    
    // Basic information is always available
    sections.push('basic');
    
    // Check data sections
    if (ipoData.data) {
      Object.keys(ipoData.data).forEach(key => {
        if (typeof ipoData.data[key] === 'object' && ipoData.data[key] !== null) {
          sections.push(key);
        }
      });
    }
    
    res.json({
      ipo_id: ipo.ipo_id,
      available_sections: sections
    });
  } catch (error) {
    console.error(`Error fetching IPO sections for ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch IPO sections' });
  }
});

// Get IPO with specific sections
router.get('/:id', async (req, res) => {
  try {
    const sections = req.query.sections ? req.query.sections.split(',') : null;
    let projection = {};
    
    // Always include essential fields
    const essentialFields = {
      ipo_id: 1, 
      ipo_name: 1, 
      company_name: 1, 
      year: 1, 
      opening_date: 1,
      closing_date: 1,
      listing_date: 1,
      issue_price: 1,
      status: 1
    };
    
    if (sections) {
      // Add requested sections
      projection = { ...essentialFields };
      
      // Handle special case for basic info
      if (sections.includes('basic')) {
        // Basic already included in essentialFields
      }
      
      // Add specific data sections
      sections.forEach(section => {
        if (section !== 'basic') {
          projection[`data.${section}`] = 1;
        }
      });
    }
    
    const ipo = await IpoModel.findOne(
      { ipo_id: req.params.id },
      projection.length === 0 ? null : projection
    );
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    res.json(ipo);
  } catch (error) {
    console.error(`Error fetching IPO ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch IPO' });
  }
});

// Filter IPOs by status
router.get('/status/:status', async (req, res) => {
  try {
    const validStatuses = ['upcoming', 'open', 'closed', 'listed', 'withdrawn'];
    const status = req.params.status.toLowerCase();
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status parameter',
        valid_statuses: validStatuses
      });
    }
    
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const skip = (page - 1) * limit;
    
    const ipos = await IpoModel.find({ status })
      .sort({ opening_date: -1 })
      .skip(skip)
      .limit(limit)
      .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status');
    
    const total = await IpoModel.countDocuments({ status });
    
    res.json({
      data: ipos,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error(`Error fetching IPOs with status ${req.params.status}:`, error);
    res.status(500).json({ error: 'Failed to fetch IPOs' });
  }
});

// Get top performing IPOs
router.get('/performance/best', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    
    // Get IPOs with listing gains
    const ipos = await IpoModel.find({
      status: 'listed',
      'listing_gains': { $exists: true, $ne: null }
    })
    .sort({ 'listing_gains_numeric': -1 })  // Sort by listing gains in descending order
    .limit(limit)
    .select('ipo_id ipo_name company_name year listing_date issue_price listing_gains');
    
    res.json({
      data: ipos
    });
  } catch (error) {
    console.error('Error fetching top performing IPOs:', error);
    res.status(500).json({ error: 'Failed to fetch top performing IPOs' });
  }
});

// Get worst performing IPOs
router.get('/performance/worst', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    
    // Get IPOs with listing gains
    const ipos = await IpoModel.find({
      status: 'listed',
      'listing_gains': { $exists: true, $ne: null }
    })
    .sort({ 'listing_gains_numeric': 1 })  // Sort by listing gains in ascending order
    .limit(limit)
    .select('ipo_id ipo_name company_name year listing_date issue_price listing_gains');
    
    res.json({
      data: ipos
    });
  } catch (error) {
    console.error('Error fetching worst performing IPOs:', error);
    res.status(500).json({ error: 'Failed to fetch worst performing IPOs' });
  }
});

module.exports = router; 