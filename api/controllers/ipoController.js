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