import { connectToDatabase } from '../../../../config/database';
import IpoModel from '../../../../models/IpoModel';
import { withCache } from '../../utils/cache';
import compression from 'compression';

// Wrap handler with compression middleware
const withCompression = handler => (req, res) => {
  compression()(req, res, () => handler(req, res));
};

// Main handler for IPO performance
const handler = async (req, res) => {
  const { type } = req.query;
  
  if (!type || !['best', 'worst'].includes(type)) {
    return res.status(400).json({ 
      error: 'Valid performance type is required',
      valid_types: ['best', 'worst']
    });
  }
  
  switch (req.method) {
    case 'GET':
      return getPerformingIpos(type, req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get best or worst performing IPOs
const getPerformingIpos = async (type, req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Parse pagination parameters
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const skip = (page - 1) * limit;
    
    // Parse optional year filter
    const yearFilter = req.query.year ? { year: parseInt(req.query.year, 10) } : {};
    
    // We only want listed IPOs
    const filter = {
      status: 'listed',
      ...yearFilter
    };
    
    // Fetch IPOs with listing day trading data
    const ipos = await IpoModel.find(filter)
      .select('ipo_id ipo_name company_name year opening_date listing_date issue_price logo_url listingDayTrading subscriptionStatus')
      .lean();
    
    // Process and calculate gains
    const processedIpos = ipos
      .map(ipo => {
        // Extract the numeric issue price
        const issuePrice = parseFloat(ipo.issue_price?.replace(/[^\d.]/g, '') || '0');
        
        if (issuePrice <= 0) return null;
        
        // Extract listing day trading data
        const listingData = ipo.listingDayTrading?.data || {};
        
        // Get listing price (open)
        const listingOpen = parseFloat(
          listingData.open?.nse_sme || 
          listingData.open?.nse || 
          listingData.open?.bse || '0'
        );
        
        // Get current/last trade price
        const lastTrade = parseFloat(
          listingData.last_trade?.nse_sme || 
          listingData.last_trade?.nse || 
          listingData.last_trade?.bse || '0'
        );
        
        // Calculate gains
        const listingGain = listingOpen > 0 ? ((listingOpen - issuePrice) / issuePrice) * 100 : null;
        const currentGain = lastTrade > 0 ? ((lastTrade - issuePrice) / issuePrice) * 100 : null;
        
        // Skip if no gain data available
        if (listingGain === null && currentGain === null) return null;
        
        // Get subscription data if available
        const subscriptionTimes = ipo.subscriptionStatus?.overall?.total?.subscription_times || null;
        
        return {
          ipo_id: ipo.ipo_id,
          company_name: ipo.company_name,
          ipo_name: ipo.ipo_name,
          year: ipo.year,
          opening_date: ipo.opening_date,
          listing_date: ipo.listing_date,
          issue_price: ipo.issue_price,
          listing_price: listingOpen > 0 ? listingOpen : null,
          current_price: lastTrade > 0 ? lastTrade : null,
          logo_url: ipo.logo_url,
          listing_gain: listingGain !== null ? parseFloat(listingGain.toFixed(2)) : null,
          current_gain: currentGain !== null ? parseFloat(currentGain.toFixed(2)) : null,
          subscription_times: subscriptionTimes ? parseFloat(subscriptionTimes) : null
        };
      })
      .filter(ipo => ipo !== null); // Remove IPOs without gain data
    
    // Sort by listing gain or current gain
    const sortField = req.query.sortBy === 'listing' ? 'listing_gain' : 'current_gain';
    
    processedIpos.sort((a, b) => {
      const aValue = a[sortField] !== null ? a[sortField] : (type === 'best' ? -Infinity : Infinity);
      const bValue = b[sortField] !== null ? b[sortField] : (type === 'best' ? -Infinity : Infinity);
      
      return type === 'best' ? bValue - aValue : aValue - bValue;
    });
    
    // Apply pagination
    const paginatedIpos = processedIpos.slice(skip, skip + limit);
    
    // Return results
    return res.status(200).json({
      type,
      sort_by: req.query.sortBy === 'listing' ? 'listing_gain' : 'current_gain',
      data: paginatedIpos,
      page,
      limit,
      total: processedIpos.length,
      totalPages: Math.ceil(processedIpos.length / limit)
    });
  } catch (error) {
    console.error(`Error fetching ${type} performing IPOs:`, error);
    return res.status(500).json({ error: `Failed to fetch ${type} performing IPOs` });
  }
};

// Export the handler with cache and compression middleware
// Cache for 1 hour (3600 seconds) - performance data changes infrequently
export default withCompression(withCache(handler, 3600)); 