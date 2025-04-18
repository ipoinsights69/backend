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
    
    // Fetch IPOs - don't filter on listing_gains_numeric yet because we need to process data
    const ipos = await IpoModel.find(filter)
      .select('ipo_id ipo_name company_name year opening_date listing_date issue_price issue_price_numeric listing_gains listing_gains_numeric status logo_url listingDayTrading')
      .lean();
    
    // Process IPOs to calculate listing gains if missing
    const processedIpos = ipos.map(ipo => {
      // If listing gains already exists, use it
      if (ipo.listing_gains_numeric) {
        return ipo;
      }
      
      // Try to calculate listing gains from listingDayTrading data
      if (ipo.listingDayTrading && ipo.listingDayTrading.data) {
        const data = ipo.listingDayTrading.data;
        // Find first available exchange data
        const exchange = Object.keys(data.final_issue_price || {})[0] || 
                        Object.keys(data.last_trade || {})[0];
        
        if (exchange) {
          let issuePrice = 0;
          let lastTradePrice = 0;
          
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
          
          // Calculate listing gains
          if (issuePrice > 0 && lastTradePrice > 0) {
            const listingGain = ((lastTradePrice - issuePrice) / issuePrice) * 100;
            return {
              ...ipo,
              listing_gains: `${listingGain.toFixed(2)}%`,
              listing_gains_numeric: parseFloat(listingGain.toFixed(2)),
              calculated: true // Flag to indicate we calculated this
            };
          }
        }
      }
      
      return ipo;
    });
    
    // Filter out IPOs without listing gains data
    const filteredIpos = processedIpos.filter(ipo => ipo.listing_gains_numeric !== null && ipo.listing_gains_numeric !== undefined);
    
    // Sort based on the type
    const sortDirection = type === 'best' ? -1 : 1;
    const sortedIpos = filteredIpos.sort((a, b) => sortDirection * (a.listing_gains_numeric - b.listing_gains_numeric));
    
    // Apply limit
    const limitedIpos = sortedIpos.slice(0, limit);
    
    // Clean up data for response (remove unnecessary listingDayTrading data)
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