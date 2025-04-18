import { connectToDatabase } from '../../../config/database';
import IpoModel from '../../../models/IpoModel';
import { withCache } from '../utils/cache';

// Main handler for IPO listing
const handler = async (req, res) => {
  switch (req.method) {
    case 'GET':
      return getIpos(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get all IPOs with pagination, sorting, and filtering
const getIpos = async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Parse query parameters
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const sort = req.query.sort || '-opening_date'; // Default sort by opening date desc
    const skip = (page - 1) * limit;
    
    // Build filter based on query parameters
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
    
    // Create array of promises for parallel execution
    const [ipos, total] = await Promise.all([
      IpoModel.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status logo_url')
        .lean(), // Use lean for better performance
      
      IpoModel.countDocuments(filter)
    ]);
    
    // Check if we have results
    if (total === 0) {
      return res.status(200).json({
        data: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
        message: 'No IPOs found matching the criteria'
      });
    }
    
    // Return paginated results
    return res.status(200).json({
      data: ipos || [],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching IPOs:', error);
    return res.status(500).json({ error: 'Failed to fetch IPOs' });
  }
};

// Export the handler with cache middleware (1 minute cache)
export default withCache(handler, 60); 