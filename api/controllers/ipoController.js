// Replace Mongoose models with JSON data service
// const Ipo = require('../models/Ipo');
// const IpoDetail = require('../models/IpoDetail');
const jsonDataService = require('../utils/jsonDataService');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { calculatePerformanceScore, calculateListingGains } = require('../utils/ipoUtils');

/**
 * Get paginated list of IPOs with filtering and sorting options
 */
exports.getIpos = async (req, res) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Limit max to 100
    const sort = req.query.sort || '-opening_date';
    const year = req.query.year ? parseInt(req.query.year) : null;
    const status = req.query.status;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;

    // Build query
    const query = {
      page,
      limit,
      sort
    };
    
    if (year) query.year = year;
    if (status) query.status = status;
    if (minPrice !== null) query.minPrice = minPrice;
    if (maxPrice !== null) query.maxPrice = maxPrice;

    // Execute query with JSON data service
    const { ipos, total } = await jsonDataService.getIpos(query);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // Return response
    return res.status(200).json({
      data: ipos,
      page,
      limit,
      total,
      totalPages,
      filters: {
        year: year || 'all',
        status: status || 'all',
        price: {
          min: minPrice,
          max: maxPrice
        }
      }
    });
  } catch (error) {
    console.error('Error in getIpos:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPOs',
      error: error.message
    });
  }
};

/**
 * Search IPOs by keyword
 */
exports.searchIpos = async (req, res) => {
  try {
    // Parse query parameters
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);

    // Validate search query
    if (!query || query.length < 2) {
      return res.status(400).json({
        message: 'Search query must be at least 2 characters',
        query: query || ''
      });
    }

    // Execute search with JSON data service
    const { ipos, total } = await jsonDataService.searchIpos(query, { page, limit });

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // Return response
    return res.status(200).json({
      data: ipos,
      page,
      limit,
      total,
      totalPages,
      query,
      search_type: 'text',
      request_parameters: {
        q: query,
        page,
        limit
      }
    });
  } catch (error) {
    console.error('Error in searchIpos:', error);
    return res.status(500).json({
      message: 'Server error while searching IPOs',
      error: error.message
    });
  }
};

/**
 * Get IPOs sorted by performance metrics
 */
exports.getPerformance = async (req, res) => {
  try {
    // Parse query parameters
    const type = req.query.type === 'worst' ? 'worst' : 'best';
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const year = req.query.year ? parseInt(req.query.year) : null;

    // Get performance data from JSON data service
    const ipos = await jsonDataService.getPerformance({ type, limit, year });

    // Return response
    return res.status(200).json({
      performance_type: type,
      count: ipos.length,
      limit,
      year: year || 'all',
      data: ipos,
      source: 'performance_score'
    });
  } catch (error) {
    console.error('Error in getPerformance:', error);
    return res.status(500).json({
      message: 'Server error while fetching performance metrics',
      error: error.message
    });
  }
};

/**
 * Get IPOs categorized by sector
 */
exports.getCategories = async (req, res) => {
  try {
    // Parse query parameters
    const category = req.query.category;
    const year = req.query.year ? parseInt(req.query.year) : null;

    // Get category data from JSON data service
    const result = await jsonDataService.getCategories({ category, year });

    // If no category is provided, return list of categories
    if (!category) {
      return res.status(200).json({
        count: result.categories.length,
        data: result.categories
      });
    }

    // Return IPOs for the specified category
    return res.status(200).json({
      category,
      count: result.ipos.length,
      data: result.ipos
    });
  } catch (error) {
    console.error('Error in getCategories:', error);
    return res.status(500).json({
      message: 'Server error while fetching categories',
      error: error.message
    });
  }
};

/**
 * Get IPO statistics
 */
exports.getStats = async (req, res) => {
  try {
    // Parse query parameters
    const year = req.query.year ? parseInt(req.query.year) : null;

    // Get stats from JSON data service
    const stats = await jsonDataService.getStats({ year });

    // Return response
    return res.status(200).json({
      data: stats,
      year: year || 'all'
    });
  } catch (error) {
    console.error('Error in getStats:', error);
    return res.status(500).json({
      message: 'Server error while fetching statistics',
      error: error.message
    });
  }
};

/**
 * Get IPOs by status
 */
exports.getIposByStatus = async (req, res) => {
  try {
    // Parse parameters
    const status = req.params.status;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const year = req.query.year ? parseInt(req.query.year) : null;

    // Validate status
    if (!['upcoming', 'open', 'closed', 'listed'].includes(status)) {
      return res.status(400).json({
        message: 'Invalid status',
        valid_statuses: ['upcoming', 'open', 'closed', 'listed']
      });
    }

    // Get IPOs by status from JSON data service
    const { ipos, total } = await jsonDataService.getIpos({
      status,
      year,
      page,
      limit,
      sort: '-opening_date'
    });

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // Return response
    return res.status(200).json({
      data: ipos,
      status,
      page,
      limit,
      total,
      totalPages,
      year: year || 'all'
    });
  } catch (error) {
    console.error('Error in getIposByStatus:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPOs by status',
      error: error.message
    });
  }
};

/**
 * Get all IPO IDs
 */
exports.getIpoIds = async (req, res) => {
  try {
    // Get years with IPO data
    const years = await jsonDataService.getAvailableYears();
    let allIpos = [];
    
    // Collect all IPOs from all years
    for (const year of years) {
      try {
        const yearPath = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), year.toString(), '_listings.json');
        const fileData = await fs.promises.readFile(yearPath, 'utf8');
        const yearIpos = JSON.parse(fileData);
        allIpos = allIpos.concat(yearIpos);
      } catch (error) {
        console.error(`Error reading listings for year ${year}:`, error);
      }
    }
    
    // Extract and format IDs
    const ids = allIpos.map(ipo => {
      if (ipo.ipo_id) return ipo.ipo_id;
      return `${ipo.year}_${ipo.company_name.toLowerCase().replace(/\s+/g, '_')}`;
    });

    // Return response
    return res.status(200).json({
      count: ids.length,
      data: ids
    });
  } catch (error) {
    console.error('Error in getIpoIds:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPO IDs',
      error: error.message
    });
  }
};

/**
 * Get years with IPO data
 */
exports.getIpoYears = async (req, res) => {
  try {
    // Get available years from JSON data service
    const years = await jsonDataService.getAvailableYears();

    // Return response
    return res.status(200).json({
      count: years.length,
      data: years
    });
  } catch (error) {
    console.error('Error in getIpoYears:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPO years',
      error: error.message
    });
  }
};

/**
 * Get basic IPO information by ID
 */
exports.getIpoById = async (req, res) => {
  try {
    const id = req.params.id;
    const fields = req.query.fields ? req.query.fields.split(',') : null;
    const sections = req.query.sections ? req.query.sections.split(',') : null;

    // Get IPO by ID from JSON data service
    const ipo = await jsonDataService.getIpoById(id);

    if (!ipo) {
      return res.status(404).json({
        message: 'IPO not found',
        id
      });
    }

    // Calculate listing gains using the new structured approach
    let listingGainInfo = { listing_gains: null, listing_gains_numeric: null };
    
    if (ipo.listingDayTrading && ipo.listingDayTrading.data) {
      // Use the new function for structured listingDayTrading format
      listingGainInfo = calculateListingGains(ipo);
    } else {
      // Fallback to the old method if we don't have structured data
      let listingPrice = null;
      let issuePrice = null;
      
      // Check in different locations for listing price
      if (ipo.listing_day_stats && ipo.listing_day_stats.listing_price) {
        listingPrice = parseFloat(ipo.listing_day_stats.listing_price);
      } else if (ipo.listing_details && ipo.listing_details.listing_price) {
        listingPrice = parseFloat(ipo.listing_details.listing_price);
      } else if (ipo.listingDayTrading && ipo.listingDayTrading.listing_price) {
        listingPrice = parseFloat(ipo.listingDayTrading.listing_price);
      }
      
      // Check in different locations for issue price
      if (ipo.issue_price) {
        const priceMatch = ipo.issue_price.match(/\d+(?:\.\d+)?/);
        if (priceMatch) {
          issuePrice = parseFloat(priceMatch[0]);
        }
      } else if (ipo.basicDetails && ipo.basicDetails.issuePrice) {
        const priceMatch = ipo.basicDetails.issuePrice.match(/\d+(?:\.\d+)?/);
        if (priceMatch) {
          issuePrice = parseFloat(priceMatch[0]);
        }
      }
      
      // Calculate listing gain if both prices are available
      if (listingPrice && issuePrice) {
        const gain = ((listingPrice - issuePrice) / issuePrice) * 100;
        // Round to 2 decimal places
        const roundedGain = Math.round(gain * 100) / 100;
        listingGainInfo = {
          listing_gains: `${roundedGain > 0 ? '+' : ''}${roundedGain.toFixed(2)}%`,
          listing_gains_numeric: roundedGain
        };
      }
    }
    
    // Add listing gain to the IPO data
    const ipoWithExtraFields = {
      ...ipo,
      listing_gain: listingGainInfo.listing_gains_numeric,
      listing_gains: listingGainInfo.listing_gains,
      listing_gains_numeric: listingGainInfo.listing_gains_numeric
    };
    
    // Add detailed exchange-specific gains if available
    if (listingGainInfo.listing_gains_by_exchange) {
      ipoWithExtraFields.listing_gains_by_exchange = listingGainInfo.listing_gains_by_exchange;
    }

    // If fields parameter is provided, filter to only include requested fields
    if (fields) {
      const filteredIpo = {};
      fields.forEach(field => {
        if (ipoWithExtraFields[field] !== undefined) {
          filteredIpo[field] = ipoWithExtraFields[field];
        }
      });
      return res.status(200).json(filteredIpo);
    }
    
    // If sections parameter is provided, filter to only include requested sections
    if (sections) {
      const filteredIpo = { ipo_id: ipoWithExtraFields.ipo_id, listing_gain: ipoWithExtraFields.listing_gain };
      sections.forEach(section => {
        if (ipoWithExtraFields[section] !== undefined) {
          filteredIpo[section] = ipoWithExtraFields[section];
        }
      });
      return res.status(200).json(filteredIpo);
    }

    // Return full response with listing gain
    return res.status(200).json(ipoWithExtraFields);
  } catch (error) {
    console.error('Error in getIpoById:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPO',
      error: error.message
    });
  }
};

/**
 * Get enhanced IPO information with additional calculated fields
 */
exports.getIpoDetail = async (req, res) => {
  try {
    const id = req.params.id;
    const fields = req.query.fields ? req.query.fields.split(',') : null;
    const sections = req.query.sections ? req.query.sections.split(',') : null;

    // Get IPO details by ID from JSON data service
    const ipo = await jsonDataService.getIpoById(id);

    if (!ipo) {
      return res.status(404).json({
        message: 'IPO not found',
        id
      });
    }

    // Calculate listing gains using the new structured approach
    let listingGainInfo = { listing_gains: null, listing_gains_numeric: null };
    
    if (ipo.listingDayTrading && ipo.listingDayTrading.data) {
      // Use the new function for structured listingDayTrading format
      listingGainInfo = calculateListingGains(ipo);
    } else {
      // Fallback to the old method if we don't have structured data
      let listingPrice = null;
      let issuePrice = null;
      
      // Check in different locations for listing price
      if (ipo.listing_day_stats && ipo.listing_day_stats.listing_price) {
        listingPrice = parseFloat(ipo.listing_day_stats.listing_price);
      } else if (ipo.listing_details && ipo.listing_details.listing_price) {
        listingPrice = parseFloat(ipo.listing_details.listing_price);
      } else if (ipo.listingDayTrading && ipo.listingDayTrading.listing_price) {
        listingPrice = parseFloat(ipo.listingDayTrading.listing_price);
      }
      
      // Check in different locations for issue price
      if (ipo.issue_price) {
        const priceMatch = ipo.issue_price.match(/\d+(?:\.\d+)?/);
        if (priceMatch) {
          issuePrice = parseFloat(priceMatch[0]);
        }
      } else if (ipo.basicDetails && ipo.basicDetails.issuePrice) {
        const priceMatch = ipo.basicDetails.issuePrice.match(/\d+(?:\.\d+)?/);
        if (priceMatch) {
          issuePrice = parseFloat(priceMatch[0]);
        }
      }
      
      // Calculate listing gain if both prices are available
      if (listingPrice && issuePrice) {
        const gain = ((listingPrice - issuePrice) / issuePrice) * 100;
        // Round to 2 decimal places
        const roundedGain = Math.round(gain * 100) / 100;
        listingGainInfo = {
          listing_gains: `${roundedGain > 0 ? '+' : ''}${roundedGain.toFixed(2)}%`,
          listing_gains_numeric: roundedGain
        };
      }
    }
    
    // Enhance IPO with additional fields
    const enhancedIpo = {
      ...ipo,
      listing_gain: listingGainInfo.listing_gains_numeric,
      listing_gains: listingGainInfo.listing_gains,
      listing_gains_numeric: listingGainInfo.listing_gains_numeric,
      is_detail_view: true,
      formatted_company_name: ipo.company_name,
      performance_metrics: {
        performance_score: ipo.performance_score,
        listing_gain: listingGainInfo.listing_gains_numeric
      }
    };
    
    // Add detailed exchange-specific gains if available
    if (listingGainInfo.listing_gains_by_exchange) {
      enhancedIpo.listing_gains_by_exchange = listingGainInfo.listing_gains_by_exchange;
    }

    // If fields parameter is provided, filter to only include requested fields
    if (fields) {
      const filteredIpo = {};
      fields.forEach(field => {
        if (enhancedIpo[field] !== undefined) {
          filteredIpo[field] = enhancedIpo[field];
        }
      });
      return res.status(200).json(filteredIpo);
    }
    
    // If sections parameter is provided, filter to only include requested sections
    if (sections) {
      const filteredIpo = { 
        ipo_id: enhancedIpo.ipo_id, 
        listing_gain: enhancedIpo.listing_gain,
        is_detail_view: true,
        performance_metrics: enhancedIpo.performance_metrics
      };
      
      sections.forEach(section => {
        if (enhancedIpo[section] !== undefined) {
          filteredIpo[section] = enhancedIpo[section];
        }
      });
      return res.status(200).json(filteredIpo);
    }

    // Return response with detailed information
    return res.status(200).json(enhancedIpo);
  } catch (error) {
    console.error('Error in getIpoDetail:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPO details',
      error: error.message
    });
  }
};

/**
 * Get available sections for an IPO
 */
exports.getIpoSections = async (req, res) => {
  try {
    const id = req.params.id;

    // Get IPO by ID from JSON data service
    const ipo = await jsonDataService.getIpoById(id);

    if (!ipo) {
      return res.status(404).json({
        message: 'IPO not found',
        id
      });
    }

    // Determine available sections based on data
    const sections = [];
    
    if (ipo.basicDetails) sections.push('basic');
    if (ipo.about) sections.push('about');
    if (ipo.additionalTables && ipo.additionalTables.some(t => t.sanitizedHeading === 'financials')) sections.push('financials');
    if (ipo.faqs) sections.push('faqs');
    if (ipo.promoterHolding) sections.push('promoters');
    if (ipo.tentativeDetails) sections.push('listing');
    if (ipo.reservation) sections.push('subscription');

    // Return response
    return res.status(200).json({
      count: sections.length,
      data: sections
    });
  } catch (error) {
    console.error('Error in getIpoSections:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPO sections',
      error: error.message
    });
  }
};

/**
 * Get a specific section of IPO data
 */
exports.getIpoSection = async (req, res) => {
  try {
    const id = req.params.id;
    const sectionName = req.query.name;

    // Validate section name
    if (!['basic', 'about', 'financials', 'faqs', 'promoters', 'listing', 'subscription'].includes(sectionName)) {
      return res.status(400).json({
        message: 'Invalid section name',
        valid_sections: ['basic', 'about', 'financials', 'faqs', 'promoters', 'listing', 'subscription']
      });
    }

    // Get IPO by ID from JSON data service
    const ipo = await jsonDataService.getIpoById(id);

    if (!ipo) {
      return res.status(404).json({
        message: 'IPO not found',
        id
      });
    }

    // Extract requested section
    let sectionData = null;
    
    switch (sectionName) {
      case 'basic':
        sectionData = ipo.basicDetails || {};
        break;
      case 'about':
        sectionData = ipo.about || {};
        break;
      case 'financials':
        if (ipo.additionalTables) {
          sectionData = ipo.additionalTables.find(t => t.sanitizedHeading === 'financials') || {};
        }
        break;
      case 'faqs':
        sectionData = { faqs: ipo.faqs || [] };
        break;
      case 'promoters':
        sectionData = ipo.promoterHolding || {};
        break;
      case 'listing':
        sectionData = ipo.tentativeDetails || {};
        break;
      case 'subscription':
        sectionData = ipo.reservation || {};
        break;
    }

    // Return response
    return res.status(200).json({
      section: sectionName,
      data: sectionData
    });
  } catch (error) {
    console.error('Error in getIpoSection:', error);
    return res.status(500).json({
      message: 'Server error while fetching IPO section',
      error: error.message
    });
  }
};

/**
 * Get comprehensive data for homepage display
 */
exports.getHomepageData = async (req, res) => {
  try {
    // Get current IPOs (open)
    const { ipos: currentIpos } = await jsonDataService.getIpos({
      status: 'open',
      limit: 15,
      sort: '-opening_date'
    });

    // Get upcoming IPOs
    const { ipos: upcomingIpos } = await jsonDataService.getIpos({
      status: 'upcoming',
      limit: 15,
      sort: 'opening_date'
    });

    // Get recently listed IPOs
    const { ipos: recentIpos } = await jsonDataService.getIpos({
      status: 'listed',
      limit: 15,
      sort: '-listing_date'
    });

    // Get featured IPOs (top performing recent IPOs)
    const { ipos: featuredIpos } = await jsonDataService.getIpos({
      status: 'listed',
      limit: 5,
      sort: '-performance_score'
    });

    // Get top listing gains IPOs (all years)
    const { ipos: topListingGainsIpos } = await jsonDataService.getIpos({
      status: 'listed',
      limit: 20,
      sort: '-listing_gains_numeric'  // Use listing_gains_numeric for sorting
    }).catch(() => ({ ipos: [] })); // Provide empty array if there's an error

    // Get top listing gains IPOs for 2025 specifically
    const { ipos: topListingGains2025 } = await jsonDataService.getIpos({
      status: 'listed',
      year: 2025,
      limit: 10,
      sort: '-listing_gains_numeric'  // Use listing_gains_numeric for sorting
    }).catch(() => ({ ipos: [] })); // Provide empty array if there's an error
    
    // Get IPO statistics
    const stats = await jsonDataService.getStats().catch(() => ({})); // Provide empty object if there's an error

    // Get latest IPO news (from the most recent IPOs)
    const { ipos: newsIpos } = await jsonDataService.getIpos({
      limit: 10,
      sort: '-created_at'
    });

    // Process current IPOs with detailed info
    const enhancedCurrentIpos = await Promise.all(currentIpos.map(async ipo => {
      // Try to get more details for subscription status if available
      let subscriptionData = {};
      const detailedIpo = await jsonDataService.getIpoById(ipo.ipo_id);
      
      if (detailedIpo && detailedIpo.subscription_status) {
        subscriptionData = detailedIpo.subscription_status;
      } else if (detailedIpo && detailedIpo.subscriptionDetails) {
        subscriptionData = detailedIpo.subscriptionDetails;
      }
      
      // Get GMP if available
      const gmp = detailedIpo?.gmp || ipo.gmp || 'N/A';
      
      return {
        company_name: ipo.company_name,
        ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
        opening_date: ipo.opening_date,
        closing_date: ipo.closing_date,
        price_band: ipo.issue_price,
        issue_size: ipo.issue_amount,
        lot_size: ipo.lot_size || detailedIpo?.basicDetails?.lotSize,
        min_investment: detailedIpo?.basicDetails?.minInvestment,
        subscription_status: {
          overall: subscriptionData.overall || 'N/A',
          retail: subscriptionData.retail || 'N/A',
          qib: subscriptionData.qib || 'N/A',
          nii: subscriptionData.nii || 'N/A',
          detailed: subscriptionData
        },
        gmp: gmp,
        category: ipo.category || 'N/A',
        logo_url: ipo.logo_url,
        ipo_id: ipo.ipo_id,
        detail_url: `/ipo/${ipo.ipo_id}`
      };
    }));

    // Process upcoming IPOs with tentative details
    const enhancedUpcomingIpos = await Promise.all(upcomingIpos.map(async ipo => {
      const detailedIpo = await jsonDataService.getIpoById(ipo.ipo_id);
      
      return {
        company_name: ipo.company_name,
        ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
        opening_date: ipo.opening_date,
        closing_date: ipo.closing_date,
        expected_price_band: detailedIpo?.tentativeDetails?.priceBand || 'To be announced',
        expected_issue_size: ipo.issue_amount || 'To be announced',
        expected_listing_date: detailedIpo?.tentativeDetails?.listingDate || 'To be announced',
        category: ipo.category || 'N/A',
        logo_url: ipo.logo_url,
        ipo_id: ipo.ipo_id,
        detail_url: `/ipo/${ipo.ipo_id}`
      };
    }));

    // Process recently listed IPOs with detailed performance info
    const enhancedRecentIpos = await Promise.all(recentIpos.map(async ipo => {
      const detailedIpo = await jsonDataService.getIpoById(ipo.ipo_id);
      
      // Calculate listing gains if not already available
      let listingGainInfo = { 
        listing_gains: ipo.listing_gains, 
        listing_gains_numeric: ipo.listing_gains_numeric,
        listing_gains_by_exchange: ipo.listing_gains_by_exchange
      };
      
      if ((!listingGainInfo.listing_gains || !listingGainInfo.listing_gains_numeric) && detailedIpo) {
        const calculatedGains = calculateListingGains(detailedIpo);
        listingGainInfo = {
          listing_gains: calculatedGains.listing_gains || listingGainInfo.listing_gains,
          listing_gains_numeric: calculatedGains.listing_gains_numeric || listingGainInfo.listing_gains_numeric,
          listing_gains_by_exchange: calculatedGains.listing_gains_by_exchange || listingGainInfo.listing_gains_by_exchange
        };
      }
      
      // Get current market price or latest available price
      let currentPrice = ipo.current_price;
      if (!currentPrice && detailedIpo && detailedIpo.listingDayTrading) {
        currentPrice = detailedIpo.listingDayTrading.data?.nse?.latestPrice || 
                       detailedIpo.listingDayTrading.data?.bse?.latestPrice;
      }
      
      return {
        company_name: ipo.company_name,
        ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
        listing_date: ipo.listing_date,
        issue_price: ipo.issue_price,
        issue_price_numeric: ipo.issue_price_numeric,
        listing_price: ipo.listing_price,
        current_price: currentPrice || 'N/A',
        listing_gain: listingGainInfo.listing_gains_numeric,
        listing_gains: listingGainInfo.listing_gains,
        listing_gains_numeric: listingGainInfo.listing_gains_numeric,
        listing_gains_by_exchange: listingGainInfo.listing_gains_by_exchange,
        current_gain: ipo.current_gains || 'N/A',
        performance_score: ipo.performance_score || 'N/A',
        category: ipo.category || 'N/A',
        logo_url: ipo.logo_url,
        ipo_id: ipo.ipo_id,
        detail_url: `/ipo/${ipo.ipo_id}`
      };
    }));

    // Process featured IPOs with detailed descriptions
    const enhancedFeaturedIpos = await Promise.all(featuredIpos.map(async ipo => {
      const detailedIpo = await jsonDataService.getIpoById(ipo.ipo_id);
      
      let companyDescription = '';
      if (detailedIpo && detailedIpo.about && detailedIpo.about.summary) {
        companyDescription = detailedIpo.about.summary;
      } else if (detailedIpo && detailedIpo.company_overview) {
        companyDescription = detailedIpo.company_overview;
      }
      
      return {
        company_name: ipo.company_name,
        ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
        opening_date: ipo.opening_date,
        closing_date: ipo.closing_date,
        price_band: ipo.issue_price,
        issue_size: ipo.issue_amount,
        listing_date: ipo.listing_date,
        listing_gain: ipo.listing_gains,
        performance_score: ipo.performance_score,
        company_description: companyDescription,
        key_highlights: detailedIpo?.kpi?.indicators || {},
        financials: detailedIpo?.financials?.data || [],
        category: ipo.category || 'N/A',
        logo_url: ipo.logo_url,
        ipo_id: ipo.ipo_id,
        detail_url: `/ipo/${ipo.ipo_id}`
      };
    }));

    // Process top listing gains IPOs with basic data
    const enhancedTopListingGainsIpos = await Promise.all(topListingGainsIpos.map(async ipo => {
      try {
        // Get detailed listing gain information
        const detailedIpo = await jsonDataService.getIpoById(ipo.ipo_id).catch(() => null);
        
        // Calculate listing gains using the structured approach
        let listingGainInfo = { 
          listing_gains: ipo.listing_gains || null, 
          listing_gains_numeric: ipo.listing_gains_numeric || null,
          listing_gains_by_exchange: ipo.listing_gains_by_exchange || null
        };
        
        if (detailedIpo && detailedIpo.listingDayTrading && detailedIpo.listingDayTrading.data) {
          // Use the function for structured listingDayTrading format
          const calculatedGains = calculateListingGains(detailedIpo);
          if (calculatedGains && calculatedGains.listing_gains_numeric) {
            listingGainInfo = calculatedGains;
          }
        }
        
        return {
          company_name: ipo.company_name,
          ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
          listing_date: ipo.listing_date,
          issue_price: ipo.issue_price,
          issue_price_numeric: ipo.issue_price_numeric,
          listing_price: ipo.listing_price,
          listing_gain: ipo.listing_gain || listingGainInfo.listing_gains_numeric,
          listing_gains: listingGainInfo.listing_gains,
          listing_gains_numeric: listingGainInfo.listing_gains_numeric,
          listing_gains_by_exchange: listingGainInfo.listing_gains_by_exchange,
          year: ipo.year,
          category: ipo.category || 'N/A',
          logo_url: ipo.logo_url,
          ipo_id: ipo.ipo_id,
          detail_url: `/ipo/${ipo.ipo_id}`
        };
      } catch (error) {
        console.error(`Error processing IPO ${ipo.ipo_id}:`, error);
        // Return basic info if there's an error
        return {
          company_name: ipo.company_name,
          ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
          listing_date: ipo.listing_date,
          issue_price: ipo.issue_price,
          listing_price: ipo.listing_price,
          listing_gain: ipo.listing_gain,
          listing_gains: ipo.listing_gains,
          listing_gains_numeric: ipo.listing_gains_numeric,
          year: ipo.year,
          ipo_id: ipo.ipo_id,
          detail_url: `/ipo/${ipo.ipo_id}`
        };
      }
    }));

    // Make sure the arrays are sorted by listing gains (highest first) in case the database sort didn't work
    const filteredTopGains = enhancedTopListingGainsIpos
      .filter(ipo => ipo && ipo.listing_gains_numeric != null)
      .sort((a, b) => {
        const gainA = a.listing_gains_numeric || -9999;
        const gainB = b.listing_gains_numeric || -9999;
        return gainB - gainA;  // Descending order
      });

    // Process top listing gains IPOs for 2025
    const enhancedTopListingGains2025 = await Promise.all(topListingGains2025.map(async ipo => {
      try {
        // Get detailed listing gain information
        const detailedIpo = await jsonDataService.getIpoById(ipo.ipo_id).catch(() => null);
        
        // Calculate listing gains using the structured approach
        let listingGainInfo = { 
          listing_gains: ipo.listing_gains || null, 
          listing_gains_numeric: ipo.listing_gains_numeric || null,
          listing_gains_by_exchange: ipo.listing_gains_by_exchange || null
        };
        
        if (detailedIpo && detailedIpo.listingDayTrading && detailedIpo.listingDayTrading.data) {
          // Use the function for structured listingDayTrading format
          const calculatedGains = calculateListingGains(detailedIpo);
          if (calculatedGains && calculatedGains.listing_gains_numeric) {
            listingGainInfo = calculatedGains;
          }
        }
        
        return {
          company_name: ipo.company_name,
          ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
          listing_date: ipo.listing_date,
          issue_price: ipo.issue_price,
          issue_price_numeric: ipo.issue_price_numeric,
          listing_price: ipo.listing_price,
          listing_gain: ipo.listing_gain || listingGainInfo.listing_gains_numeric,
          listing_gains: listingGainInfo.listing_gains,
          listing_gains_numeric: listingGainInfo.listing_gains_numeric,
          listing_gains_by_exchange: listingGainInfo.listing_gains_by_exchange,
          category: ipo.category || 'N/A',
          logo_url: ipo.logo_url,
          ipo_id: ipo.ipo_id,
          detail_url: `/ipo/${ipo.ipo_id}`
        };
      } catch (error) {
        console.error(`Error processing IPO ${ipo.ipo_id}:`, error);
        // Return basic info if there's an error
        return {
          company_name: ipo.company_name,
          ipo_name: ipo.ipo_name || `${ipo.company_name} IPO`,
          listing_date: ipo.listing_date,
          issue_price: ipo.issue_price,
          listing_price: ipo.listing_price,
          listing_gain: ipo.listing_gain,
          listing_gains: ipo.listing_gains,
          listing_gains_numeric: ipo.listing_gains_numeric,
          ipo_id: ipo.ipo_id,
          detail_url: `/ipo/${ipo.ipo_id}`
        };
      }
    }));

    // Make sure the 2025 array is sorted by listing gains (highest first) in case the database sort didn't work
    const filteredTopGains2025 = enhancedTopListingGains2025
      .filter(ipo => ipo && ipo.listing_gains_numeric != null)
      .sort((a, b) => {
        const gainA = a.listing_gains_numeric || -9999;
        const gainB = b.listing_gains_numeric || -9999;
        return gainB - gainA;  // Descending order
      });

    // Process latest news with more details
    const enhancedLatestNews = await Promise.all(newsIpos.map(async ipo => {
      const detailedIpo = await jsonDataService.getIpoById(ipo.ipo_id);
      
      let newsSummary = '';
      if (detailedIpo && detailedIpo.about && detailedIpo.about.summary) {
        newsSummary = detailedIpo.about.summary;
      } else if (detailedIpo && detailedIpo.company_overview) {
        newsSummary = detailedIpo.company_overview;
      }
      
      const newsDate = ipo.updated_at || new Date().toISOString();
      
      return {
        title: `${ipo.company_name} IPO Update`,
        date: newsDate,
        summary: newsSummary || `Latest updates for ${ipo.company_name} IPO`,
        status: ipo.status || 'N/A',
        category: ipo.category || 'N/A',
        ipo_id: ipo.ipo_id,
        detail_url: `/ipo/${ipo.ipo_id}`
      };
    }));

    // Enhance educational snippets with more detailed content
    const enhancedEducationalSnippets = [
      {
        title: "What is an IPO?",
        content: "An Initial Public Offering (IPO) is when a private company offers its shares to the public for the first time. This allows companies to raise capital from public investors and provides an opportunity for early investors to monetize their investments.",
        icon: "info-circle"
      },
      {
        title: "How to Apply for an IPO?",
        content: "You can apply for an IPO through your bank's ASBA (Application Supported by Blocked Amount) facility or using UPI-based applications. The minimum investment is typically one lot, which varies by IPO. Your funds are only debited if shares are allotted to you.",
        icon: "file-signature"
      },
      {
        title: "Understanding GMP",
        content: "Grey Market Premium (GMP) indicates the premium at which IPO shares are trading in the unofficial market before listing. A positive GMP suggests the stock may list above the issue price, while a negative GMP suggests it may list below the issue price.",
        icon: "chart-line"
      },
      {
        title: "IPO Allotment Process",
        content: "IPO allotment follows a lottery system for retail investors if oversubscribed. For Qualified Institutional Buyers (QIBs) and Non-Institutional Investors (NIIs), it's proportionate. You can check your allotment status on the registrar's website or stock exchange platforms.",
        icon: "random"
      },
      {
        title: "Key IPO Dates",
        content: "Important IPO dates include the Issue Opening Date, Issue Closing Date, Allotment Date, Refund Initiation Date, Demat Credit Date, and Listing Date. Each marks a crucial stage in the IPO process.",
        icon: "calendar"
      }
    ];

    // Format the response with all enhanced data
    const response = {
      hero_section: {
        title: "Your Comprehensive Guide to Indian IPOs",
        description: "Track, analyze, and invest in Indian IPOs with real-time data and insights",
        total_ipos: stats.total_ipos || 0,
        total_companies: stats.total_companies || 0,
        total_raised: stats.total_raised || 0,
        market_performance: stats.market_performance || {},
        current_year: new Date().getFullYear()
      },
      current_ipos: enhancedCurrentIpos,
      upcoming_ipos: enhancedUpcomingIpos,
      recent_ipos: enhancedRecentIpos,
      featured_ipos: enhancedFeaturedIpos,
      top_listing_gains: {
        all_time: filteredTopGains,
        current_year: filteredTopGains2025,
        title: "Top Performing IPOs by Listing Gains",
        description: "IPOs with the highest listing day gains"
      },
      latest_news: enhancedLatestNews,
      quick_links: {
        allotment_status: '/check-allotment',
        performance_tracker: '/performance',
        ipo_calendar: '/calendar',
        ipo_guide: '/guide',
        categories: '/categories',
        compare: '/compare',
        search: '/search'
      },
      educational_snippets: enhancedEducationalSnippets,
      meta: {
        last_updated: new Date().toISOString(),
        version: '2.0',
        total_ipos_shown: enhancedCurrentIpos.length + enhancedUpcomingIpos.length + enhancedRecentIpos.length
      }
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in getHomepageData:', error);
    return res.status(500).json({
      message: 'Server error while fetching homepage data',
      error: error.message
    });
  }
}; 