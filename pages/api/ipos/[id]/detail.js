import { connectToDatabase } from '../../../../config/database';
import IpoModel from '../../../../models/IpoModel';
import { withCache } from '../../utils/cache';
import compression from 'compression';

// Wrap handler with compression middleware
const withCompression = handler => (req, res) => {
  compression()(req, res, () => handler(req, res));
};

// Main handler for IPO details
const handler = async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'IPO ID is required' });
  }
  
  switch (req.method) {
    case 'GET':
      return getIpoDetail(id, req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get formatted IPO details for frontend use
const getIpoDetail = async (id, req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Find IPO by ID
    const ipo = await IpoModel.findOne({ ipo_id: id }).lean();
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    // Format IPO data for frontend display
    const formattedIpo = {
      id: ipo.ipo_id,
      name: ipo.ipo_name || ipo.company_name,
      company: ipo.company_name,
      year: ipo.year,
      logo: ipo.logo_url || (ipo.logo ? ipo.logo : null),
      status: ipo.status || 'unknown',
      
      // Basic details
      basicDetails: {
        ipoDate: formatDateRange(ipo.opening_date, ipo.closing_date),
        listingDate: formatDate(ipo.listing_date),
        faceValue: ipo.basicDetails?.faceValue || null,
        issuePrice: ipo.issue_price || ipo.basicDetails?.issuePrice || null,
        lotSize: ipo.lot_size || (ipo.basicDetails?.lotSize ? parseInt(ipo.basicDetails.lotSize) : null),
        issueSize: ipo.issue_size || ipo.basicDetails?.issueSize || null,
        freshIssue: ipo.basicDetails?.freshIssue || null,
        issueType: ipo.basicDetails?.issueType || null,
        listingAt: ipo.basicDetails?.listingAt || null
      },
      
      // Dates
      dates: {
        opening: ipo.opening_date,
        closing: ipo.closing_date,
        listing: ipo.listing_date,
        allotment: ipo.tentativeDetails?.tentative_allotment 
          ? new Date(ipo.tentativeDetails.tentative_allotment) 
          : null,
        refunds: ipo.tentativeDetails?.initiation_of_refunds 
          ? new Date(ipo.tentativeDetails.initiation_of_refunds) 
          : null,
        creditToDemat: ipo.tentativeDetails?.credit_of_shares_to_demat 
          ? new Date(ipo.tentativeDetails.credit_of_shares_to_demat) 
          : null
      },
      
      // Lot size details
      lotSizeDetails: ipo.lotSize ? {
        summary: ipo.lotSize.summary || null,
        applications: formatLotSizeApplications(ipo.lotSize?.applications),
        calculator: ipo.lotSize?.calculator_link || null
      } : null,
      
      // About the company
      about: ipo.about?.details || null,
      
      // Subscription status
      subscription: ipo.subscriptionStatus ? {
        summary: ipo.subscriptionStatus.summary || null,
        overall: formatSubscriptionData(ipo.subscriptionStatus?.overall),
        totalApplications: ipo.subscriptionStatus?.total_applications || null
      } : null,
      
      // Promoter holding
      promoterHolding: ipo.promoterHolding ? {
        promoters: ipo.promoterHolding.promoters || null,
        preIssue: ipo.promoterHolding.holdings?.share_holding_pre_issue || null,
        postIssue: ipo.promoterHolding.holdings?.share_holding_post_issue || null
      } : null,
      
      // Contact and registrar details
      contactDetails: formatContactDetails(ipo.contactDetails),
      registrar: formatRegistrarDetails(ipo.registrarDetails),
      
      // Lead managers
      leadManagers: ipo.leadManagers || [],
      
      // Listing details
      listingDetails: ipo.listingDetails ? {
        ipoDate: ipo.listingDetails.ipo_date || null,
        symbol: ipo.listingDetails.nse_symbol || null,
        isin: ipo.listingDetails.isin || null,
        finalIssuePrice: ipo.listingDetails.final_issue_price || null
      } : null,
      
      // Listing day performance
      performance: formatListingPerformance(ipo.listingDayTrading),
      
      // FAQs
      faqs: ipo.faqs || [],
      
      // Recommendations
      recommendations: ipo.recommendationSummary ? {
        brokers: ipo.recommendationSummary.recommendations?.brokersbrokers || null,
        members: ipo.recommendationSummary.recommendations?.membersmembers || null,
        links: ipo.recommendationSummary.links || []
      } : null,
      
      // Prospectus links
      prospectus: ipo.prospectusLinks || [],
      
      // Reservation
      reservation: ipo.reservation ? {
        summary: ipo.reservation.summary || null,
        allocation: ipo.reservation.allocation || []
      } : null,
      
      // Anchor investors
      anchorInvestors: ipo.anchorInvestors ? {
        summary: ipo.anchorInvestors.summary || null,
        details: ipo.anchorInvestors.details || null,
        listLink: ipo.anchorInvestors.list_link || null
      } : null,
      
      // Financial information
      financials: extractFinancials(ipo.additionalTables)
    };
    
    // Return formatted IPO data
    return res.status(200).json(formattedIpo);
  } catch (error) {
    console.error(`Error fetching detail for IPO ${id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPO detail' });
  }
};

// Helper function to format date range
function formatDateRange(startDate, endDate) {
  if (!startDate) return null;
  
  const start = new Date(startDate);
  
  if (!endDate) return formatDate(start);
  
  const end = new Date(endDate);
  
  return `${formatDate(start)} to ${formatDate(end)}`;
}

// Helper function to format date
function formatDate(date) {
  if (!date) return null;
  
  const d = new Date(date);
  
  // Handle invalid dates
  if (isNaN(d.getTime())) return null;
  
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-US', options);
}

// Helper function to format lot size applications
function formatLotSizeApplications(applications) {
  if (!applications) return null;
  
  return {
    retailMin: applications.retail_min || null,
    retailMax: applications.retail_max || null,
    hniMin: applications.hni_min || null,
    lotSize: applications.lot_size || null
  };
}

// Helper function to format subscription data
function formatSubscriptionData(overall) {
  if (!overall) return null;
  
  return {
    qib: overall.qib || null,
    nii: overall.nii || null,
    retail: overall.retail || null,
    total: overall.total || null
  };
}

// Helper function to format contact details
function formatContactDetails(contactDetails) {
  if (!contactDetails) return null;
  
  return {
    phone: contactDetails.phone || null,
    email: contactDetails.email || null,
    address: contactDetails.full_address || null,
    website: contactDetails.website || null
  };
}

// Helper function to format registrar details
function formatRegistrarDetails(registrarDetails) {
  if (!registrarDetails) return null;
  
  return {
    name: registrarDetails.name || null,
    phone: registrarDetails.phone || null,
    email: registrarDetails.email || null,
    website: registrarDetails.website || null
  };
}

// Helper function to format listing day performance
function formatListingPerformance(listingDayTrading) {
  if (!listingDayTrading || !listingDayTrading.data) return null;
  
  const data = listingDayTrading.data;
  const exchange = Object.keys(data.final_issue_price || {})[0] || null;
  
  if (!exchange) return null;
  
  // Extract issue price
  const issuePrice = parseFloat(data.final_issue_price[exchange] || '0');
  
  // Extract listing day prices
  const openPrice = parseFloat(data.open[exchange] || '0');
  const lowPrice = parseFloat(data.low[exchange] || '0');
  const highPrice = parseFloat(data.high[exchange] || '0');
  const closePrice = parseFloat(data.last_trade[exchange] || '0');
  
  // Calculate gains
  const listingGain = issuePrice > 0 && openPrice > 0 
    ? ((openPrice - issuePrice) / issuePrice) * 100
    : null;
    
  const currentGain = issuePrice > 0 && closePrice > 0
    ? ((closePrice - issuePrice) / issuePrice) * 100
    : null;
  
  return {
    exchange,
    issuePrice,
    openPrice,
    lowPrice,
    highPrice,
    closePrice,
    listingGain: listingGain !== null ? parseFloat(listingGain.toFixed(2)) : null,
    currentGain: currentGain !== null ? parseFloat(currentGain.toFixed(2)) : null,
    performanceLink: listingDayTrading.performance_link || null
  };
}

// Helper function to extract financials from additional tables
function extractFinancials(additionalTables) {
  if (!additionalTables || !additionalTables.length) return null;
  
  // Find the financial table
  const financialTable = additionalTables.find(table => 
    table.sanitizedHeading === 'financials'
  );
  
  if (!financialTable) return null;
  
  // Get headers and rows
  const { headers, rows } = financialTable;
  
  // Format data
  const financials = headers.slice(1).map((period, index) => {
    const periodData = {};
    
    rows.forEach(row => {
      const metric = row[0];
      const value = parseFloat(row[index + 1]) || null;
      
      periodData[metric.toLowerCase().replace(/\s+/g, '_')] = value;
    });
    
    return {
      period,
      ...periodData
    };
  });
  
  return financials;
}

// Export the handler with cache and compression middleware
// Cache for 15 minutes (900 seconds) - detail page data changes infrequently
export default withCompression(withCache(handler, 900)); 