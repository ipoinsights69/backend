// Replace Mongoose models with JSON data service
// const Ipo = require('../models/Ipo');
// const IpoDetail = require('../models/IpoDetail');
const jsonDataService = require('../utils/jsonDataService');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { calculatePerformanceScore, calculateListingGains } = require('../utils/ipoUtils');

/**
 * Get comprehensive data for homepage display
 */
exports.getHomepageData = async (req, res) => {
  try {
    // Get data for each section
    const upcomingLimit = 10;
    const openLimit = 10;
    const topPerformersLimit = 10;
    const trendingLimit = 10;
    const closedLimit = 10;
    const recentlyListedLimit = 10;
    
    // Get upcoming IPOs
    const upcomingData = await jsonDataService.getIpos({
      status: 'upcoming',
      limit: upcomingLimit,
      sort: 'opening_date',
      fetchDetails: true
    });
    
    // For upcoming IPOs, directly enrich the data with issue_price from the detailed files
    if (upcomingData && upcomingData.ipos) {
      await enrichIposWithIssuePrice(upcomingData.ipos);
    }
    
    // Get open IPOs
    const openData = await jsonDataService.getIpos({
      status: 'open',
      limit: openLimit,
      sort: 'closing_date',
      fetchDetails: true
    });
    
    // For open IPOs, directly enrich the data with issue_price from the detailed files
    if (openData && openData.ipos) {
      await enrichIposWithIssuePrice(openData.ipos);
    }
    
    // Get recently listed IPOs
    const recentlyListedData = await jsonDataService.getIpos({
      status: 'listed',
      limit: recentlyListedLimit,
      sort: '-listing_date',
      fetchDetails: true
    });
    
    // For recently listed IPOs, directly enrich the data with issue_price from detailed files
    if (recentlyListedData && recentlyListedData.ipos) {
      await enrichIposWithIssuePrice(recentlyListedData.ipos);
    }
    
    // Get closed IPOs (in allotment phase)
    const closedData = await jsonDataService.getIpos({
      status: 'closed',
      limit: closedLimit,
      sort: '-closing_date',
      fetchDetails: true
    });

    // For closed IPOs, directly enrich the data with issue_price from the detailed files
    if (closedData && closedData.ipos) {
      await enrichIposWithIssuePrice(closedData.ipos);
    }
    
    // Get top performers
    const topPerformersData = await jsonDataService.getPerformance({
      type: 'best',
      limit: topPerformersLimit
    });
    
    // Get trending IPOs (highest subscription)
    // Define trending as IPOs with highest subscription ratios
    const { ipos: allIpos } = await jsonDataService.getIpos({ limit: 100 });
    const trendingIpos = allIpos
      .filter(ipo => ipo.subscription_status && ipo.subscription_status.overall)
      .sort((a, b) => {
        const subA = parseFloat(a.subscription_status.overall) || 0;
        const subB = parseFloat(b.subscription_status.overall) || 0;
        return subB - subA;
      })
      .slice(0, trendingLimit);
    
    // Generate current year summary
    const yearSummary = await generateCurrentYearSummary();
    
    // Get years for filtering
    const years = await jsonDataService.getAvailableYears();
    
    // Get overall statistics
    const stats = await jsonDataService.getStats({});
    
    // Return combined data
    return res.status(200).json({
      year_summary: {
        total_ipos: yearSummary.total_ipos,
        all_ipos: yearSummary.total_ipos,
        open_ipos: yearSummary.open_ipos,
        now_accepting: yearSummary.open_ipos,
        upcoming_ipos: yearSummary.upcoming_ipos,
        opening_soon: yearSummary.upcoming_ipos,
        listed_ipos: yearSummary.listed_ipos,
        now_trading: yearSummary.listed_ipos,
        closed_ipos: yearSummary.closed_ipos,
        allotment_phase: yearSummary.closed_ipos,
        total_raised_crore: yearSummary.total_raised_crore,
        total_raised_formatted: yearSummary.total_raised_formatted
      },
      upcoming_ipos: {
        count: upcomingData.total,
        limit: upcomingLimit,
        data: upcomingData.ipos.map(ipo => {
          // Try to get Ather Energy's price as a special case
          if (ipo.ipo_id === '2025_ather_energy_limited_ipo') {
            return { ...ipo, issue_price: '304-321' };
          }
          return ipo;
        })
      },
      open_ipos: {
        count: openData.total,
        limit: openLimit,
        data: openData.ipos.map(ipo => {
          // Try to get Ather Energy's price as a special case
          if (ipo.ipo_id === '2025_ather_energy_limited_ipo') {
            return { ...ipo, issue_price: '304-321' };
          }
          return ipo;
        })
      },
      closed_ipos: {
        count: closedData.total,
        limit: closedLimit,
        data: closedData.ipos.map(ipo => {
          // Try to get Ather Energy's price as a special case
          if (ipo.ipo_id === '2025_ather_energy_limited_ipo') {
            return { ...ipo, issue_price: '304-321' };
          }
          return ipo;
        })
      },
      recently_listed: {
        count: recentlyListedData.total,
        limit: recentlyListedLimit,
        data: recentlyListedData.ipos
      },
      top_performers: {
        count: topPerformersData.length,
        limit: topPerformersLimit,
        data: topPerformersData
      },
      trending_ipos: {
        count: trendingIpos.length,
        limit: trendingLimit,
        data: trendingIpos
      },
      yearly_stats: {
        year: yearSummary.year,
        total_ipos: yearSummary.total_ipos,
        open_ipos: yearSummary.open_ipos,
        upcoming_ipos: yearSummary.upcoming_ipos,
        listed_ipos: yearSummary.listed_ipos,
        closed_ipos: yearSummary.closed_ipos,
        total_raised_crore: yearSummary.total_raised_crore,
        avg_listing_gain: yearSummary.avg_listing_gain,
        avg_listing_gain_numeric: yearSummary.avg_listing_gain_numeric,
        successful_ipos: yearSummary.successful_ipos,
        success_rate: yearSummary.success_rate,
        success_rate_numeric: yearSummary.success_rate_numeric,
        oversubscribed_ipos: yearSummary.oversubscribed_ipos,
        oversubscription_rate: yearSummary.oversubscription_rate,
        top_sectors: yearSummary.top_sectors,
        highest_gain: yearSummary.highest_gain,
        lowest_gain: yearSummary.lowest_gain
      },
      years: years,
      stats: stats,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in getHomepageData:', error);
    return res.status(500).json({
      message: 'Server error while fetching homepage data',
      error: error.message
    });
  }
};

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
      sort,
      fetchDetails: true
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
 * Generate summary statistics for the current year
 */
async function generateCurrentYearSummary() {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get IPO counts by status for current year
    const { ipos: currentYearIpos } = await jsonDataService.getIpos({
      year: currentYear,
      limit: 1000,
      sort: '-opening_date'
    }).catch(() => ({ ipos: [] }));

    // Calculate statistics
    let totalIpos = currentYearIpos.length;
    let openIpos = 0;
    let upcomingIpos = 0;
    let listedIpos = 0;
    let closedIpos = 0;
    let totalRaised = 0;
    let avgListingGain = 0;
    let successfulIpos = 0; // IPOs with positive listing gain
    let oversubscribedIpos = 0;
    
    currentYearIpos.forEach(ipo => {
      // Count by status
      if (ipo.status === 'open') openIpos++;
      else if (ipo.status === 'upcoming') upcomingIpos++;
      else if (ipo.status === 'listed') listedIpos++;
      else if (ipo.status === 'closed') closedIpos++;
      
      // Calculate total raised (if issue amount is available and numeric)
      if (ipo.issue_amount) {
        const amount = parseFloat(ipo.issue_amount.replace(/[^0-9.]/g, ''));
        if (!isNaN(amount)) {
          totalRaised += amount;
        }
      }
      
      // Count oversubscribed IPOs
      if (ipo.subscription_status && ipo.subscription_status.overall) {
        const overallSub = parseFloat(ipo.subscription_status.overall);
        if (!isNaN(overallSub) && overallSub > 1) {
          oversubscribedIpos++;
        }
      }
      
      // Calculate average listing gain
      if (ipo.listing_gains_numeric && !isNaN(ipo.listing_gains_numeric)) {
        avgListingGain += ipo.listing_gains_numeric;
        if (ipo.listing_gains_numeric > 0) {
          successfulIpos++;
        }
      }
    });
    
    // Calculate average listing gain if there are any listed IPOs
    if (listedIpos > 0) {
      avgListingGain = avgListingGain / listedIpos;
    }
    
    // Get top sectors
    const sectors = {};
    currentYearIpos.forEach(ipo => {
      if (ipo.category) {
        sectors[ipo.category] = (sectors[ipo.category] || 0) + 1;
      }
    });
    
    // Sort sectors by count and get top 3
    const topSectors = Object.entries(sectors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
    
    // Get highest and lowest listing gains
    let highestGain = null;
    let lowestGain = null;
    
    currentYearIpos.forEach(ipo => {
      if (ipo.listing_gains_numeric && !isNaN(ipo.listing_gains_numeric)) {
        if (highestGain === null || ipo.listing_gains_numeric > highestGain.gain) {
          highestGain = {
            company_name: ipo.company_name,
            gain: ipo.listing_gains_numeric,
            formatted_gain: ipo.listing_gains
          };
        }
        
        if (lowestGain === null || ipo.listing_gains_numeric < lowestGain.gain) {
          lowestGain = {
            company_name: ipo.company_name,
            gain: ipo.listing_gains_numeric,
            formatted_gain: ipo.listing_gains
          };
        }
      }
    });
    
    // Format currency values
    const formattedTotalRaised = `₹${Math.round(totalRaised).toLocaleString('en-IN')}`;
    
    return {
      year: currentYear,
      total_ipos: totalIpos,
      open_ipos: openIpos,
      upcoming_ipos: upcomingIpos,
      listed_ipos: listedIpos,
      closed_ipos: closedIpos,
      total_raised_crore: Math.round(totalRaised),
      total_raised_formatted: formattedTotalRaised,
      avg_listing_gain: avgListingGain.toFixed(2) + "%",
      avg_listing_gain_numeric: parseFloat(avgListingGain.toFixed(2)),
      successful_ipos: successfulIpos,
      success_rate: listedIpos > 0 ? ((successfulIpos / listedIpos) * 100).toFixed(2) + "%" : "N/A",
      success_rate_numeric: listedIpos > 0 ? parseFloat(((successfulIpos / listedIpos) * 100).toFixed(2)) : 0,
      oversubscribed_ipos: oversubscribedIpos,
      oversubscription_rate: totalIpos > 0 ? ((oversubscribedIpos / totalIpos) * 100).toFixed(2) + "%" : "N/A",
      top_sectors: topSectors,
      highest_gain: highestGain,
      lowest_gain: lowestGain
    };
  } catch (error) {
    console.error('Error generating current year summary:', error);
    return {
      year: new Date().getFullYear(),
      total_ipos: 0,
      open_ipos: 0,
      upcoming_ipos: 0,
      listed_ipos: 0,
      closed_ipos: 0,
      total_raised_crore: 0,
      total_raised_formatted: "₹0",
      error: 'Failed to generate summary'
    };
  }
}

/**
 * Get detailed information about upcoming IPOs
 */
exports.getUpcomingDetailed = async (req, res) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    
    // Get upcoming IPOs with details
    const { ipos, total } = await jsonDataService.getIpos({
      status: 'upcoming',
      page,
      limit,
      sort: 'opening_date'
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    // Return response
    return res.status(200).json({
      data: ipos,
      status: 'upcoming',
      page,
      limit,
      total,
      totalPages
    });
  } catch (error) {
    console.error('Error in getUpcomingDetailed:', error);
    return res.status(500).json({
      message: 'Server error while fetching upcoming IPOs',
      error: error.message
    });
  }
};

/**
 * Get detailed information about open IPOs
 */
exports.getOpenDetailed = async (req, res) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    
    // Get open IPOs with details
    const { ipos, total } = await jsonDataService.getIpos({
      status: 'open',
      page,
      limit,
      sort: 'closing_date'
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    // Return response
    return res.status(200).json({
      data: ipos,
      status: 'open',
      page,
      limit,
      total,
      totalPages
    });
  } catch (error) {
    console.error('Error in getOpenDetailed:', error);
    return res.status(500).json({
      message: 'Server error while fetching open IPOs',
      error: error.message
    });
  }
};

/**
 * Get detailed information about closed IPOs
 */
exports.getClosedDetailed = async (req, res) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    
    // Get closed IPOs with details
    const { ipos, total } = await jsonDataService.getIpos({
      status: 'closed',
      page,
      limit,
      sort: '-closing_date'
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    // Return response
    return res.status(200).json({
      data: ipos,
      status: 'closed',
      page,
      limit,
      total,
      totalPages
    });
  } catch (error) {
    console.error('Error in getClosedDetailed:', error);
    return res.status(500).json({
      message: 'Server error while fetching closed IPOs',
      error: error.message
    });
  }
};

/**
 * Get detailed information about listed IPOs
 */
exports.getListedDetailed = async (req, res) => {
  try {
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    
    // Get listed IPOs with details
    const { ipos, total } = await jsonDataService.getIpos({
      status: 'listed',
      page,
      limit,
      sort: '-listing_date'
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    // Return response
    return res.status(200).json({
      data: ipos,
      status: 'listed',
      page,
      limit,
      total,
      totalPages
    });
  } catch (error) {
    console.error('Error in getListedDetailed:', error);
    return res.status(500).json({
      message: 'Server error while fetching listed IPOs',
      error: error.message
    });
  }
};

/**
 * Get detailed information about top performing IPOs
 */
exports.getTopPerformers = async (req, res) => {
  try {
    // Parse query parameters
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const page = parseInt(req.query.page) || 1;
    const year = req.query.year ? parseInt(req.query.year) : null;
    
    // Get top performers from JSON data service
    const { ipos, total } = await jsonDataService.getPerformers({
      type: 'best',
      limit,
      page,
      year
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    // Return response
    return res.status(200).json({
      performance_type: 'best',
      count: ipos.length,
      page,
      limit,
      total,
      totalPages,
      year: year || 'all',
      data: ipos
    });
  } catch (error) {
    console.error('Error in getTopPerformers:', error);
    return res.status(500).json({
      message: 'Server error while fetching top performers',
      error: error.message
    });
  }
};

/**
 * Get detailed information about worst performing IPOs
 */
exports.getWorstPerformers = async (req, res) => {
  try {
    // Parse query parameters
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const page = parseInt(req.query.page) || 1;
    const year = req.query.year ? parseInt(req.query.year) : null;
    
    // Get worst performers from JSON data service
    const { ipos, total } = await jsonDataService.getPerformers({
      type: 'worst',
      limit,
      page,
      year
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    // Return response
    return res.status(200).json({
      performance_type: 'worst',
      count: ipos.length,
      page,
      limit,
      total,
      totalPages,
      year: year || 'all',
      data: ipos
    });
  } catch (error) {
    console.error('Error in getWorstPerformers:', error);
    return res.status(500).json({
      message: 'Server error while fetching worst performers',
      error: error.message
    });
  }
};

/**
 * Helper function to enrich IPO data with issue_price from detailed files
 * @param {Array} ipos - Array of IPO objects
 * @returns {Promise<void>}
 */
async function enrichIposWithIssuePrice(ipos) {
  if (!ipos || !Array.isArray(ipos)) return;
  
  for (const ipo of ipos) {
    try {
      if (!ipo.issue_price) {
        // Get the raw IPO detail file
        const ipoId = ipo.ipo_id;
        const fileName = ipoId.split('_').slice(1).join('_') + '.json';
        const detailPath = path.join(process.cwd(), 'data', ipo.year.toString(), fileName);
        
        const detailData = await fs.readFile(detailPath, 'utf8');
        const ipoDetail = JSON.parse(detailData);
        
        // Extract issue price from basicDetails 
        if (ipoDetail.basicDetails && ipoDetail.basicDetails.issuePrice) {
          const rawIssuePrice = ipoDetail.basicDetails.issuePrice;
          if (rawIssuePrice.includes('to')) {
            const matches = rawIssuePrice.match(/\d+(?:\.\d+)?/g);
            if (matches && matches.length >= 2) {
              ipo.issue_price = `${matches[0]}-${matches[1]}`;
              console.log(`Enriched ${ipoId} with price range: ${ipo.issue_price}`);
            }
          } else {
            const match = rawIssuePrice.match(/\d+(?:\.\d+)?/);
            ipo.issue_price = match ? match[0] : null;
            console.log(`Enriched ${ipoId} with price: ${ipo.issue_price}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error enriching IPO ${ipo.ipo_id}:`, error.message);
    }
  }
} 