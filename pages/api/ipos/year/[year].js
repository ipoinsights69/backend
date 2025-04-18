import { connectToDatabase } from '../../../../config/database';
import IpoModel from '../../../../models/IpoModel';

// Cache response for a specific duration
const withCache = (handler) => async (req, res) => {
  // Set cache control headers
  const cacheSeconds = parseInt(process.env.API_CACHE_TIME || '60', 10) * 2; // 2x longer for year data
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=300`);
  
  return handler(req, res);
};

// Main handler for IPOs by year
const handler = async (req, res) => {
  const { year } = req.query;
  
  if (!year || !/^\d{4}$/.test(year)) {
    return res.status(400).json({ error: 'Valid year (YYYY) is required' });
  }
  
  switch (req.method) {
    case 'GET':
      return getIposByYear(parseInt(year, 10), req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get IPOs by year
const getIposByYear = async (year, req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Parse pagination parameters
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10); // Higher default limit for year view
    const skip = (page - 1) * limit;
    const sort = req.query.sort || '-opening_date'; // Default sort by opening date desc
    
    // Build filter based on query parameters
    const filter = { year };
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
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
    
    // Add year stats
    const stats = await getYearStats(year);
    
    // Return paginated results
    return res.status(200).json({
      data: ipos,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      year,
      stats
    });
  } catch (error) {
    console.error(`Error fetching IPOs for year ${year}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPOs' });
  }
};

// Get statistics for the year
const getYearStats = async (year) => {
  try {
    const pipeline = [
      { $match: { year } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgIssuePrice: { $avg: { $toDouble: '$issue_price_numeric' } },
          totalRaised: { $sum: { $toDouble: '$issue_size_numeric' } },
          maxIssuePrice: { $max: { $toDouble: '$issue_price_numeric' } },
          minIssuePrice: { $min: { $toDouble: '$issue_price_numeric' } }
        }
      }
    ];
    
    const result = await IpoModel.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        count: 0,
        avgIssuePrice: 0,
        totalRaised: 0,
        maxIssuePrice: 0,
        minIssuePrice: 0
      };
    }
    
    return {
      count: result[0].count,
      avgIssuePrice: Math.round(result[0].avgIssuePrice * 100) / 100,
      totalRaised: Math.round(result[0].totalRaised * 100) / 100,
      maxIssuePrice: Math.round(result[0].maxIssuePrice * 100) / 100, 
      minIssuePrice: Math.round(result[0].minIssuePrice * 100) / 100
    };
  } catch (error) {
    console.error(`Error getting year stats for ${year}:`, error);
    return {
      count: 0,
      avgIssuePrice: 0,
      totalRaised: 0,
      maxIssuePrice: 0,
      minIssuePrice: 0
    };
  }
};

// Export the handler with cache middleware
export default withCache(handler); 