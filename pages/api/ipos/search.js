import { connectToDatabase } from '../../../config/database';
import IpoModel from '../../../models/IpoModel';

// Cache response for a shorter duration (searches change more frequently)
const withCache = (handler) => async (req, res) => {
  // Set cache control headers
  const cacheSeconds = parseInt(process.env.API_CACHE_TIME || '60', 10) / 2; // Half the default time
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60`);
  
  return handler(req, res);
};

// Main handler for IPO search
const handler = async (req, res) => {
  switch (req.method) {
    case 'GET':
      return searchIpos(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Search IPOs by query
const searchIpos = async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const query = req.query.q;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query is required and must be at least 2 characters' });
    }
    
    // Parse pagination parameters
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const skip = (page - 1) * limit;
    
    // Use text search with score sorting if available
    const searchQuery = { $text: { $search: query } };
    const scoreField = { score: { $meta: 'textScore' } };
    
    // Create array of promises for parallel execution
    const [ipos, total] = await Promise.all([
      IpoModel.find(searchQuery, scoreField)
        .sort(scoreField)
        .skip(skip)
        .limit(limit)
        .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status score')
        .lean(), // Use lean for better performance
      
      IpoModel.countDocuments(searchQuery)
    ]);
    
    // Return paginated results
    return res.status(200).json({
      data: ipos,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      query
    });
  } catch (error) {
    console.error('Error searching IPOs:', error);
    return res.status(500).json({ error: 'Failed to search IPOs' });
  }
};

// Export the handler with cache middleware
export default withCache(handler); 