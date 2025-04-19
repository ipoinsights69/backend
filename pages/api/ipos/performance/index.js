import { connectToDatabase } from '../../../../config/database';
import IpoModel from '../../../../models/IpoModel';
import { withCache } from '../../utils/cache';

// Main handler for performance endpoints
const handler = async (req, res) => {
  switch (req.method) {
    case 'GET':
      return getPerformingIpos(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get top or worst performing IPOs
const getPerformingIpos = async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Parse query parameters
    const type = req.query.type || 'best'; // 'best' or 'worst'
    const limit = parseInt(req.query.limit || '10', 10);
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    
    // Build filter
    const filter = {
      status: 'listed'
    };
    
    // Add year filter if provided
    if (year) {
      filter.year = year;
    }
    
    // Fetch IPOs with all necessary fields for analysis
    const ipos = await IpoModel.find(filter)
      .select('ipo_id ipo_name company_name year opening_date listing_date issue_price issue_price_numeric listing_gains listing_gains_numeric worst_listing_gains worst_listing_gains_numeric status logo_url listingDayTrading issue_size subscription')
      .lean();
    
    // Process IPOs to calculate listing gains if missing
    const processedIpos = ipos.map(ipo => {
      // If we're checking for "best" performance and listing gains already exists, use it
      if (type === 'best' && ipo.listing_gains_numeric) {
        return {
          ...ipo,
          performance_value: ipo.listing_gains_numeric
        };
      }
      
      // If we're checking for "worst" performance and worst listing gains exists, use it
      if (type === 'worst' && ipo.worst_listing_gains_numeric) {
        return {
          ...ipo,
          performance_value: ipo.worst_listing_gains_numeric
        };
      }
      
      // Try to calculate gains from listingDayTrading data
      if (ipo.listingDayTrading && ipo.listingDayTrading.data) {
        const data = ipo.listingDayTrading.data;
        // Find first available exchange data
        const exchange = Object.keys(data.final_issue_price || {})[0] || 
                        Object.keys(data.last_trade || {})[0];
        
        if (exchange) {
          let issuePrice = 0;
          let lastTradePrice = 0;
          let lowestPrice = 0;
          
          // Get issue price
          if (data.final_issue_price && data.final_issue_price[exchange]) {
            issuePrice = parseFloat(data.final_issue_price[exchange]);
          } else if (ipo.issue_price_numeric) {
            issuePrice = ipo.issue_price_numeric;
          } else if (ipo.issue_price) {
            const match = ipo.issue_price.match(/\d+(\.\d+)?/);
            if (match) {
              issuePrice = parseFloat(match[0]);
            }
          }
          
          // Get last trade price (not opening price)
          if (data.last_trade && data.last_trade[exchange]) {
            lastTradePrice = parseFloat(data.last_trade[exchange]);
          }
          
          // Get lowest price of the day
          if (data.day_low && data.day_low[exchange]) {
            lowestPrice = parseFloat(data.day_low[exchange]);
          } else {
            // If day_low isn't available, use last_trade as fallback
            lowestPrice = lastTradePrice;
          }
          
          // Calculate listing gains and worst listing gains
          if (issuePrice > 0) {
            if (lastTradePrice > 0) {
              const listingGain = ((lastTradePrice - issuePrice) / issuePrice) * 100;
              const formattedGain = parseFloat(listingGain.toFixed(2));
              
              if (type === 'best') {
                return {
                  ...ipo,
                  listing_gains: `${formattedGain}%`,
                  listing_gains_numeric: formattedGain,
                  performance_value: formattedGain,
                  calculated: true
                };
              }
            }
            
            if (lowestPrice > 0 && type === 'worst') {
              const worstListingGain = ((lowestPrice - issuePrice) / issuePrice) * 100;
              const formattedWorstGain = parseFloat(worstListingGain.toFixed(2));
              
              return {
                ...ipo,
                worst_listing_gains: `${formattedWorstGain}%`,
                worst_listing_gains_numeric: formattedWorstGain,
                performance_value: formattedWorstGain,
                calculated: true
              };
            }
          }
        }
      }
      
      // If we couldn't calculate anything, return the existing IPO
      // but with a performance_value field set based on the requested type
      return {
        ...ipo,
        performance_value: type === 'best' ? 
          (ipo.listing_gains_numeric || null) :
          (ipo.worst_listing_gains_numeric || null)
      };
    });
    
    // Filter out IPOs without performance data
    const filteredIpos = processedIpos.filter(ipo => ipo.performance_value !== null && ipo.performance_value !== undefined);
    
    // Sort based on the type
    const sortDirection = type === 'best' ? -1 : 1;
    const sortedIpos = filteredIpos.sort((a, b) => sortDirection * (a.performance_value - b.performance_value));
    
    // Apply limit
    const limitedIpos = sortedIpos.slice(0, limit);
    
    // Clean up data for response (remove unnecessary data)
    const cleanedIpos = limitedIpos.map(({ listingDayTrading, ...rest }) => rest);
    
    return res.status(200).json({
      type,
      count: cleanedIpos.length,
      data: cleanedIpos || [], // Ensure we always return an array
      limit,
      message: cleanedIpos.length === 0 ? `No ${type} performing IPOs found` : undefined
    });
  } catch (error) {
    console.error('Error fetching performing IPOs:', error);
    return res.status(500).json({ error: 'Failed to fetch performing IPOs' });
  }
};

// Export the handler with cache middleware (1 hour cache)
export default withCache(handler, 3600); 