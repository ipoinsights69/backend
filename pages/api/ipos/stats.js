import { connectToDatabase } from '../../../config/database';
import IpoModel from '../../../models/IpoModel';

// Cache response for a longer duration (stats change less frequently)
const withCache = (handler) => async (req, res) => {
  // Set cache control headers
  const cacheSeconds = parseInt(process.env.API_CACHE_TIME || '60', 10) * 10; // 10x longer for stats
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`);
  
  return handler(req, res);
};

// Main handler for IPO statistics
const handler = async (req, res) => {
  switch (req.method) {
    case 'GET':
      return getIpoStats(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get IPO statistics
const getIpoStats = async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get overall stats
    const overallStats = await getOverallStats();
    
    // Get stats by year
    const yearlyStats = await getYearlyStats();
    
    // Get stats by status
    const statusStats = await getStatusStats();
    
    // Return combined stats
    return res.status(200).json({
      overall: overallStats,
      yearly: yearlyStats,
      status: statusStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching IPO stats:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO statistics' });
  }
};

// Get overall statistics
const getOverallStats = async () => {
  try {
    const pipeline = [
      {
        $group: {
          _id: null,
          totalIpos: { $sum: 1 },
          avgIssuePrice: { $avg: { $toDouble: '$issue_price_numeric' } },
          totalRaised: { $sum: { $toDouble: '$issue_size_numeric' } },
          maxIssuePrice: { $max: { $toDouble: '$issue_price_numeric' } },
          minIssuePrice: { $min: { $toDouble: '$issue_price_numeric' } },
          yearsCount: { $addToSet: '$year' }
        }
      }
    ];
    
    const result = await IpoModel.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalIpos: 0,
        avgIssuePrice: 0,
        totalRaised: 0,
        yearsCount: 0
      };
    }
    
    return {
      totalIpos: result[0].totalIpos,
      avgIssuePrice: Math.round(result[0].avgIssuePrice * 100) / 100,
      totalRaised: Math.round(result[0].totalRaised * 100) / 100,
      maxIssuePrice: Math.round(result[0].maxIssuePrice * 100) / 100,
      minIssuePrice: Math.round(result[0].minIssuePrice * 100) / 100,
      yearsCount: result[0].yearsCount.length
    };
  } catch (error) {
    console.error('Error getting overall stats:', error);
    return {
      totalIpos: 0,
      avgIssuePrice: 0,
      totalRaised: 0,
      yearsCount: 0
    };
  }
};

// Get yearly statistics
const getYearlyStats = async () => {
  try {
    const pipeline = [
      {
        $group: {
          _id: '$year',
          count: { $sum: 1 },
          avgIssuePrice: { $avg: { $toDouble: '$issue_price_numeric' } },
          totalRaised: { $sum: { $toDouble: '$issue_size_numeric' } }
        }
      },
      { $sort: { _id: -1 } } // Sort by year descending
    ];
    
    const results = await IpoModel.aggregate(pipeline);
    
    // Format results
    return results.map(year => ({
      year: year._id,
      count: year.count,
      avgIssuePrice: Math.round(year.avgIssuePrice * 100) / 100,
      totalRaised: Math.round(year.totalRaised * 100) / 100
    }));
  } catch (error) {
    console.error('Error getting yearly stats:', error);
    return [];
  }
};

// Get status statistics
const getStatusStats = async () => {
  try {
    const pipeline = [
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } } // Sort by count descending
    ];
    
    const results = await IpoModel.aggregate(pipeline);
    
    // Format results
    return results.map(status => ({
      status: status._id || 'unknown',
      count: status.count
    }));
  } catch (error) {
    console.error('Error getting status stats:', error);
    return [];
  }
};

// Export the handler with cache middleware
export default withCache(handler); 