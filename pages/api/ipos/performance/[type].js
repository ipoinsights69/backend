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
    
    // Fetch IPOs with listing day trading data and include both regular and worst listing gains
    const ipos = await IpoModel.find(filter)
      .select('ipo_id ipo_name company_name year opening_date listing_date issue_price issue_size logo_url listingDayTrading subscriptionStatus listing_gains listing_gains_numeric worst_listing_gains worst_listing_gains_numeric')
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
        
        // Get day low price for worst performance
        const dayLow = parseFloat(
          listingData.day_low?.nse_sme || 
          listingData.day_low?.nse || 
          listingData.day_low?.bse || '0'
        );
        
        // Calculate gains - use stored values if available, otherwise calculate
        // Best case (closing price)
        let listingGain = ipo.listing_gains_numeric;
        if (listingGain === undefined && lastTrade > 0) {
          listingGain = ((lastTrade - issuePrice) / issuePrice) * 100;
          if (!isNaN(listingGain)) {
            listingGain = parseFloat(listingGain.toFixed(2));
          } else {
            listingGain = null;
          }
        }
        
        // Worst case (lowest price)
        let worstListingGain = ipo.worst_listing_gains_numeric;
        if (worstListingGain === undefined && dayLow > 0) {
          worstListingGain = ((dayLow - issuePrice) / issuePrice) * 100;
          if (!isNaN(worstListingGain)) {
            worstListingGain = parseFloat(worstListingGain.toFixed(2));
          } else {
            worstListingGain = null;
          }
        }
        
        // For backwards compatibility, still calculate current_gain
        const currentGain = lastTrade > 0 ? ((lastTrade - issuePrice) / issuePrice) * 100 : null;
        
        // Skip if no gain data is available based on the requested type
        if (type === 'best' && listingGain === null) return null;
        if (type === 'worst' && worstListingGain === null) return null;
        
        // Extract issue size (if available)
        let issueSize = null;
        if (ipo.issue_size) {
          // Try to extract numeric value from issue_size (e.g., "₹500 Cr" -> 500)
          const sizeMatch = ipo.issue_size.match(/[₹₨]?\s*(\d+(?:\.\d+)?)/);
          if (sizeMatch) {
            issueSize = parseFloat(sizeMatch[1]);
          }
        }
        
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
          issue_size: ipo.issue_size,
          issue_size_numeric: issueSize,
          listing_price: listingOpen > 0 ? listingOpen : null,
          current_price: lastTrade > 0 ? lastTrade : null,
          lowest_price: dayLow > 0 ? dayLow : null,
          logo_url: ipo.logo_url,
          listing_gain: listingGain,
          worst_listing_gain: worstListingGain,
          current_gain: currentGain !== null ? parseFloat(currentGain.toFixed(2)) : null,
          subscription_times: subscriptionTimes ? parseFloat(subscriptionTimes) : null,
          // For sorting, use the appropriate gain value based on the requested type
          performance_value: type === 'best' ? listingGain : worstListingGain
        };
      })
      .filter(ipo => ipo !== null); // Remove IPOs without gain data
    
    // Determine the sort field based on the requested type
    let sortField = 'performance_value';
    if (req.query.sortBy === 'subscription') {
      sortField = 'subscription_times';
    } else if (req.query.sortBy === 'issue_size') {
      sortField = 'issue_size_numeric';
    }
    
    // Sort the IPOs - for best we want highest values first, for worst we want lowest values first
    processedIpos.sort((a, b) => {
      // Handle null/undefined values for the sort field
      const aValue = a[sortField] !== null && a[sortField] !== undefined ? 
        a[sortField] : (type === 'best' ? -Infinity : Infinity);
      const bValue = b[sortField] !== null && b[sortField] !== undefined ? 
        b[sortField] : (type === 'best' ? -Infinity : Infinity);
      
      if (sortField === 'subscription_times' || sortField === 'issue_size_numeric') {
        // For subscription and issue size, always sort highest first regardless of type
        return bValue - aValue;
      } else {
        // For performance metrics, sort based on type
        return type === 'best' ? bValue - aValue : aValue - bValue;
      }
    });
    
    // Apply pagination
    const paginatedIpos = processedIpos.slice(skip, skip + limit);
    
    // Return results
    return res.status(200).json({
      type,
      sort_by: sortField,
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