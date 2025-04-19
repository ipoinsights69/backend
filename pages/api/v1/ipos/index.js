import { connectToDatabase } from '../../../../lib/mongodb';
import { withApiOptimizations } from '../../../../lib/middleware';
import { runTask } from '../../../../lib/worker';

// Define model dynamically
let IpoModel;

/**
 * Optimized handler for IPO listing endpoint
 * Supports high concurrency and implements deep caching
 */
async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return getIpos(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Get IPO listings with filtering, pagination, and advanced analytics
 */
async function getIpos(req, res) {
  try {
    // Connect to database
    const mongoose = await connectToDatabase();
    
    // Get model (only once)
    if (!IpoModel) {
      IpoModel = mongoose.models.Ipo || mongoose.model('Ipo', require('../../../../models/IpoModel').schema);
    }
    
    // Parse query parameters with defaults
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const sort = req.query.sort || '-opening_date';
    const skip = (page - 1) * limit;
    
    // Create filter object
    const filter = {};
    
    // Add year filter if provided
    if (req.query.year) {
      filter.year = parseInt(req.query.year, 10);
    }
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add price range filter if provided
    if (req.query.minPrice || req.query.maxPrice) {
      filter.issue_price_numeric = {};
      if (req.query.minPrice) {
        filter.issue_price_numeric.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        filter.issue_price_numeric.$lte = parseFloat(req.query.maxPrice);
      }
    }
    
    // Add search filter if provided
    if (req.query.search) {
      const search = req.query.search.trim();
      if (search) {
        filter.$or = [
          { company_name: { $regex: search, $options: 'i' } },
          { ipo_name: { $regex: search, $options: 'i' } }
        ];
      }
    }
    
    // Create projections for optimized query performance
    const projection = {
      ipo_id: 1,
      ipo_name: 1,
      company_name: 1,
      year: 1,
      opening_date: 1,
      closing_date: 1,
      listing_date: 1,
      issue_price: 1,
      issue_price_numeric: 1,
      status: 1,
      logo_url: 1
    };
    
    // Check if detailed data is requested
    if (req.query.detailed === 'true') {
      projection.industry = 1;
      projection.subscription_status = 1;
      projection.subscription_times = 1;
      projection.listing_gains = 1;
    }
    
    // Execute parallel database queries for performance
    const [ipos, total] = await Promise.all([
      IpoModel.find(filter)
        .select(projection)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(), // Use lean for better performance
      
      IpoModel.countDocuments(filter)
    ]);
    
    // Check if we should run analytics
    let analyticsResult = null;
    
    if (req.query.analytics === 'true') {
      try {
        // Offload CPU-intensive analytics to worker thread
        analyticsResult = await runTask('filterIpos', {
          ipos,
          calculations: true
        });
      } catch (error) {
        console.error('Analytics error:', error);
        // Continue without analytics on error
      }
    }
    
    // Build response object
    const response = {
      data: ipos || [],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
    
    // Add analytics if available
    if (analyticsResult && analyticsResult.stats) {
      response.analytics = analyticsResult.stats;
      response.performance = analyticsResult.timing;
    }
    
    // Return response
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching IPOs:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch IPOs',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Apply optimizations with 30-second cache for maximum performance
// This creates a deeply optimized API endpoint with:
// - Redis/memory caching
// - Rate limiting protection
// - HTTP performance headers
// - Error handling
export default withApiOptimizations(30, {
  // Custom cache key generator based on query parameters
  cacheKeyGenerator: (req) => {
    const { page, limit, sort, year, status, minPrice, maxPrice, search, detailed, analytics } = req.query;
    return `api:ipos:${page || 1}:${limit || 10}:${sort || '-opening_date'}:${year || ''}:${status || ''}:${minPrice || ''}:${maxPrice || ''}:${search || ''}:${detailed || ''}:${analytics || ''}`;
  },
  // Rate limiting configuration
  rateLimit: {
    limit: 100, // 100 requests
    window: 60 // per minute
  }
})(handler); 