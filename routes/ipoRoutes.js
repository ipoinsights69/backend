const express = require('express');
const router = express.Router();
const IpoModel = require('../models/IpoModel');
const { fetchIpoListings } = require('../scraper/ipoListingScraper');
const { fetchStructuredData } = require('../scraper/ipoDetailScraper');
const { extractIpoId } = require('../utils/helpers');
const cacheMiddleware = require('../middleware/cacheMiddleware');

// Get all IPOs with pagination
router.get('/', cacheMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const skip = (page - 1) * limit;
    
    const ipos = await IpoModel.find({})
      .sort({ opening_date: -1 })
      .skip(skip)
      .limit(limit)
      .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price');
    
    const total = await IpoModel.countDocuments({});
    
    res.json({
      data: ipos,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching IPOs:', error);
    res.status(500).json({ error: 'Failed to fetch IPOs' });
  }
});

// Get IPO by ID
router.get('/:id', cacheMiddleware, async (req, res) => {
  try {
    const ipo = await IpoModel.findOne({ ipo_id: req.params.id });
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    res.json(ipo);
  } catch (error) {
    console.error(`Error fetching IPO ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch IPO' });
  }
});

// Get IPOs by year
router.get('/year/:year', cacheMiddleware, async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const skip = (page - 1) * limit;
    
    const ipos = await IpoModel.find({ year })
      .sort({ opening_date: -1 })
      .skip(skip)
      .limit(limit)
      .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price');
    
    const total = await IpoModel.countDocuments({ year });
    
    res.json({
      data: ipos,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error(`Error fetching IPOs for year ${req.params.year}:`, error);
    res.status(500).json({ error: 'Failed to fetch IPOs' });
  }
});

// Search IPOs
router.get('/search', cacheMiddleware, async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const skip = (page - 1) * limit;
    
    const ipos = await IpoModel.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(limit)
      .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price');
    
    const total = await IpoModel.countDocuments({ $text: { $search: query } });
    
    res.json({
      data: ipos,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error(`Error searching IPOs:`, error);
    res.status(500).json({ error: 'Failed to search IPOs' });
  }
});

// Refresh data for a specific IPO (admin only)
router.post('/refresh/:id', async (req, res) => {
  try {
    // Check for API key (simple authorization)
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Find IPO in database
    const ipo = await IpoModel.findOne({ ipo_id: req.params.id });
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    // Get the source URL
    const sourceUrl = ipo.source_url;
    
    if (!sourceUrl) {
      return res.status(400).json({ error: 'Source URL not found for this IPO' });
    }
    
    // Fetch fresh data
    const freshData = await fetchStructuredData(sourceUrl);
    
    if (freshData._error) {
      return res.status(500).json({ 
        error: 'Failed to fetch fresh data',
        details: freshData.message
      });
    }
    
    // Update the IPO with fresh data
    freshData.ipo_id = ipo.ipo_id;
    const updatedIpo = await IpoModel.upsertIpo(freshData);
    
    res.json({
      message: 'IPO data refreshed successfully',
      ipo: {
        ipo_id: updatedIpo.ipo_id,
        company_name: updatedIpo.company_name,
        updated_at: updatedIpo.updated_at
      }
    });
  } catch (error) {
    console.error(`Error refreshing IPO ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to refresh IPO data' });
  }
});

// Fetch and store new IPOs for a specific year (admin only)
router.post('/fetch-year/:year', async (req, res) => {
  try {
    // Check for API key (simple authorization)
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const year = parseInt(req.params.year, 10);
    
    // Start background job
    res.json({
      message: `Started fetching IPOs for year ${year}`,
      status: 'processing'
    });
    
    // Fetch IPO listings for the year
    const ipoListings = await fetchIpoListings(year);
    
    if (!ipoListings || ipoListings.length === 0) {
      console.log(`No IPO listings found for year ${year}`);
      return;
    }
    
    console.log(`Found ${ipoListings.length} IPO listings for year ${year}`);
    
    // Process each IPO
    for (const listing of ipoListings) {
      try {
        if (!listing.detail_url) {
          console.warn(`Missing detail URL for IPO: ${listing.company_name}`);
          continue;
        }
        
        // Full URL if it's a relative URL
        const fullUrl = listing.detail_url.startsWith('http') 
          ? listing.detail_url 
          : `https://www.chittorgarh.com${listing.detail_url}`;
        
        console.log(`Processing IPO: ${listing.company_name} (${fullUrl})`);
        
        // Fetch detailed IPO data
        const ipoData = await fetchStructuredData(fullUrl);
        
        if (ipoData._error) {
          console.error(`Error fetching data for ${listing.company_name}: ${ipoData.message}`);
          continue;
        }
        
        // Extract IPO ID for database
        const ipoId = extractIpoId(fullUrl) || `${year}_${listing.company_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        const enrichedData = { ...ipoData, ipo_id: ipoId };
        
        // Upsert to database
        const result = await IpoModel.upsertIpo(enrichedData);
        console.log(`Saved ${listing.company_name} to database with ID: ${result.ipo_id}`);
        
        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing IPO ${listing.company_name}:`, error);
      }
    }
    
    console.log(`Completed fetching IPOs for year ${year}`);
  } catch (error) {
    console.error(`Error in fetch-year endpoint for ${req.params.year}:`, error);
  }
});

module.exports = router; 