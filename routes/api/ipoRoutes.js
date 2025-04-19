/**
 * IPO API Routes
 * Express routes for IPO data access
 */
const express = require('express');
const router = express.Router();
const { connectToDatabase } = require('../../config/database');
const IpoModel = require('../../models/IpoModel');

// Cache middleware
const withCache = (duration = 60) => (req, res, next) => {
  // Set cache control headers
  const cacheSeconds = duration;
  res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}, stale-while-revalidate=60`);
  next();
};

// Search cache - optimized for frequent searches
const searchCache = {
  data: {},
  maxAge: 5 * 60 * 1000 // 5 minutes
};

// Clear expired cache entries every minute
setInterval(() => {
  const now = Date.now();
  Object.keys(searchCache.data).forEach(key => {
    if (now - searchCache.data[key].timestamp > searchCache.maxAge) {
      delete searchCache.data[key];
    }
  });
}, 60 * 1000);

/**
 * @route   GET /api/ipos
 * @desc    Get all IPOs with pagination, filtering and sorting
 * @access  Public
 */
router.get('/', withCache(120), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Parse and sanitize query parameters
    let page = 1;
    let limit = 10;
    let sort = '-opening_date'; // Default sort by opening date desc
    let year = null;
    let status = null;
    let minPrice = null;
    let maxPrice = null;
    
    // Handle malformed query strings and extract parameters
    Object.keys(req.query).forEach(key => {
      const param = req.query[key];
      
      // Handle normal parameters with validation
      if (key === 'page' && !isNaN(parseInt(param))) {
        page = Math.max(1, parseInt(param));
      }
      
      if (key === 'limit' && !isNaN(parseInt(param))) {
        limit = Math.min(100, Math.max(1, parseInt(param))); // Limit between 1-100
      }
      
      if (key === 'sort' && typeof param === 'string') {
        // Validate sort parameter to prevent injection
        const validSortFields = ['opening_date', '-opening_date', 'year', '-year', 
                                'issue_price_numeric', '-issue_price_numeric', 
                                'performance_score', '-performance_score'];
        if (validSortFields.includes(param)) {
          sort = param;
        }
      }
      
      if (key === 'year' && !isNaN(parseInt(param))) {
        year = parseInt(param);
      }
      
      if (key === 'status' && typeof param === 'string') {
        const validStatuses = ['upcoming', 'open', 'closed', 'listed', 'withdrawn', 'unknown'];
        if (validStatuses.includes(param.toLowerCase())) {
          status = param.toLowerCase();
        }
      }
      
      if (key === 'minPrice' && !isNaN(parseFloat(param))) {
        minPrice = parseFloat(param);
      }
      
      if (key === 'maxPrice' && !isNaN(parseFloat(param))) {
        maxPrice = parseFloat(param);
      }
      
      // Check for malformed parameters (e.g., "status=listed?limit=20")
      if (param && typeof param === 'string' && param.includes('?')) {
        const parts = param.split('?');
        const mainValue = parts[0];
        const additionalParams = parts[1];
        
        // Process the main value based on the key
        if (key === 'status') {
          const validStatuses = ['upcoming', 'open', 'closed', 'listed', 'withdrawn', 'unknown'];
          if (validStatuses.includes(mainValue.toLowerCase())) {
            status = mainValue.toLowerCase();
          }
        } else if (key === 'year' && !isNaN(parseInt(mainValue))) {
          year = parseInt(mainValue);
        }
        
        // Process additional parameters
        if (additionalParams) {
          additionalParams.split('&').forEach(p => {
            const [paramName, paramValue] = p.split('=');
            if (paramName === 'limit' && !isNaN(parseInt(paramValue))) {
              limit = Math.min(100, Math.max(1, parseInt(paramValue)));
            } else if (paramName === 'page' && !isNaN(parseInt(paramValue))) {
              page = Math.max(1, parseInt(paramValue));
            }
          });
        }
      }
    });
    
    console.log(`Processing IPO listing with: page=${page}, limit=${limit}, sort=${sort}, year=${year}, status=${status}`);
    
    const skip = (page - 1) * limit;
    
    // Build filter based on query parameters
    const filter = {};
    
    // Add year filter if provided
    if (year) {
      filter.year = year;
    }
    
    // Add status filter if provided
    if (status) {
      filter.status = status;
    }
    
    // Add price range filter if provided
    if (minPrice || maxPrice) {
      filter.issue_price_numeric = {};
      if (minPrice) {
        filter.issue_price_numeric.$gte = minPrice;
      }
      if (maxPrice) {
        filter.issue_price_numeric.$lte = maxPrice;
      }
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
    
    // Return paginated results
    return res.status(200).json({
      data: ipos || [],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
      filters: {
        year: year || 'all',
        status: status || 'all',
        price: { min: minPrice, max: maxPrice }
      }
    });
  } catch (error) {
    console.error('Error fetching IPOs:', error);
    return res.status(500).json({ error: 'Failed to fetch IPOs' });
  }
});

/**
 * @route   GET /api/ipos/search
 * @desc    Search IPOs by query
 * @access  Public
 */
router.get('/search', withCache(30), async (req, res) => {
  try {
    // Parse and sanitize query parameters
    let query = '';
    let page = 1;
    let limit = 10;
    
    // Handle malformed query strings and extract parameters
    Object.keys(req.query).forEach(key => {
      const param = req.query[key];
      
      // Handle the main search query parameter
      if (key === 'q') {
        if (param && typeof param === 'string') {
          // Check if the query parameter contains embedded parameters
          if (param.includes('?')) {
            const parts = param.split('?');
            query = parts[0];
            
            // Process additional parameters
            const additionalParams = parts[1];
            if (additionalParams) {
              additionalParams.split('&').forEach(p => {
                const [paramName, paramValue] = p.split('=');
                if (paramName === 'limit' && !isNaN(parseInt(paramValue))) {
                  limit = Math.min(100, Math.max(1, parseInt(paramValue)));
                } else if (paramName === 'page' && !isNaN(parseInt(paramValue))) {
                  page = Math.max(1, parseInt(paramValue));
                }
              });
            }
          } else {
            query = param;
          }
        }
      }
      
      // Handle pagination parameters
      if (key === 'page' && !isNaN(parseInt(param))) {
        page = Math.max(1, parseInt(param));
      }
      
      if (key === 'limit' && !isNaN(parseInt(param))) {
        limit = Math.min(100, Math.max(1, parseInt(param))); // Limit between 1-100
      }
    });
    
    // Validate search query
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Search query is required and must be at least 2 characters',
        request_parameters: {
          q: query,
          page,
          limit
        }
      });
    }
    
    console.log(`Processing search query: "${query}" (page=${page}, limit=${limit})`);
    
    const skip = (page - 1) * limit;
    
    // Create cache key from query params
    const cacheKey = `${query.toLowerCase()}_${page}_${limit}`;
    
    // Check if we have a cached result for this query
    if (searchCache.data[cacheKey]) {
      const cachedResult = searchCache.data[cacheKey];
      // Use cached result if it's not too old
      if (Date.now() - cachedResult.timestamp < searchCache.maxAge) {
        return res.status(200).json(cachedResult.data);
      }
    }
    
    // Connect to database only if not in cache
    await connectToDatabase();
    
    // Try multiple search approaches for better results
    let ipos = [];
    let total = 0;
    let searchType = '';
    
    try {
      // Try text search first (most efficient if index exists)
      const textSearchQuery = { $text: { $search: query } };
      const scoreField = { score: { $meta: 'textScore' } };
      
      const textResults = await IpoModel.find(textSearchQuery, scoreField)
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit)
        .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status score')
        .lean();
      
      if (textResults && textResults.length > 0) {
        ipos = textResults;
        total = await IpoModel.countDocuments(textSearchQuery);
        searchType = 'text';
      } else {
        // Fall back to regex search if text search returns no results
        const regexPattern = new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        
        const regexQuery = {
          $or: [
            { ipo_id: regexPattern },
            { ipo_name: regexPattern },
            { company_name: regexPattern },
            { issue_price: regexPattern },
            { status: regexPattern },
            { year: query.match(/^\d{4}$/) ? parseInt(query, 10) : null }
          ].filter(condition => condition.year !== null)
        };
        
        ipos = await IpoModel.find(regexQuery)
          .sort({ year: -1, opening_date: -1 })
          .skip(skip)
          .limit(limit)
          .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status score')
          .lean();
        
        total = await IpoModel.countDocuments(regexQuery);
        searchType = 'regex';
      }
    } catch (searchError) {
      console.error('Search error:', searchError);
      // If text search fails (e.g., no text index), just use regex
      const regexPattern = new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
      
      const regexQuery = {
        $or: [
          { ipo_id: regexPattern },
          { ipo_name: regexPattern },
          { company_name: regexPattern }
        ]
      };
      
      ipos = await IpoModel.find(regexQuery)
        .sort({ year: -1, opening_date: -1 })
        .skip(skip)
        .limit(limit)
        .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status')
        .lean();
      
      total = await IpoModel.countDocuments(regexQuery);
      searchType = 'regex-fallback';
    }
    
    // Format results to handle null values
    const formattedResults = ipos.map(ipo => {
      // Extract company name from ipo_name if missing
      let companyName = ipo.company_name;
      
      if (!companyName || companyName.trim() === '') {
        // Try to extract from ipo_name by removing "ipo", "limited", etc.
        if (ipo.ipo_name) {
          companyName = ipo.ipo_name
            .replace(/\s+ipo\s*$/i, '')  // Remove 'ipo' at the end
            .replace(/\s+limited\s*$/i, '') // Remove 'limited' at the end
            .replace(/\s+ltd\s*$/i, '')  // Remove 'ltd' at the end
            .trim();
        } 
        
        // If still no company name, try to extract from ipo_id
        if ((!companyName || companyName.trim() === '') && ipo.ipo_id) {
          const parts = ipo.ipo_id.split('_');
          if (parts.length > 1) {
            // Skip the first part (year) and join the rest
            companyName = parts.slice(1)
              .join(' ')
              .replace(/_/g, ' ')
              .replace(/\s+ipo\s*$/i, '')  // Remove 'ipo' at the end
              .replace(/\s+limited\s*$/i, '') // Remove 'limited' at the end 
              .replace(/\s+ltd\s*$/i, '')  // Remove 'ltd' at the end
              .trim();
          }
        }
      }
      
      // Capitalize the company name
      if (companyName && typeof companyName === 'string') {
        companyName = companyName
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      
      return {
        ipo_id: ipo.ipo_id,
        ipo_name: ipo.ipo_name || ipo.basicDetails?.ipoName || ipo.ipo_id.split('_').slice(1).join(' ').replace(/_/g, ' '),
        company_name: companyName || 'Unknown',
        year: ipo.year || new Date().getFullYear(),
        opening_date: ipo.opening_date,
        closing_date: ipo.closing_date,
        listing_date: ipo.listing_date,
        issue_price: ipo.issue_price || ipo.basicDetails?.issuePrice || 'N/A',
        status: ipo.status || 'unknown',
        logo_url: ipo.logo_url || null
      };
    });
    
    // Create response object
    const response = {
      data: formattedResults,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      query,
      search_type: searchType,
      request_parameters: {
        q: query,
        page,
        limit
      }
    };
    
    // Cache result
    searchCache.data[cacheKey] = {
      data: response,
      timestamp: Date.now()
    };
    
    // Return results
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error searching IPOs:', error);
    return res.status(500).json({ error: 'Failed to search IPOs' });
  }
});

/**
 * @route   GET /api/ipos/ids
 * @desc    Get all IPO IDs
 * @access  Public
 */
router.get('/ids', withCache(600), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get filter parameters
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const status = req.query.status || null;
    
    // Build filter
    const filter = {};
    if (year) filter.year = year;
    if (status) filter.status = status;
    
    // Project only the IDs and names
    const ipos = await IpoModel.find(filter)
      .select('ipo_id ipo_name year')
      .sort('-year')
      .lean();
    
    return res.status(200).json({
      count: ipos.length,
      data: ipos
    });
  } catch (error) {
    console.error('Error fetching IPO IDs:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO IDs' });
  }
});

/**
 * @route   GET /api/ipos/years
 * @desc    Get years with IPO data
 * @access  Public
 */
router.get('/years', withCache(3600), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get distinct years
    const years = await IpoModel.distinct('year');
    
    // Sort from most recent to oldest
    years.sort((a, b) => b - a);
    
    // Get counts for each year
    const yearStats = await Promise.all(
      years.map(async (year) => {
        const count = await IpoModel.countDocuments({ year });
        return { year, count };
      })
    );
    
    return res.status(200).json(yearStats);
  } catch (error) {
    console.error('Error fetching IPO years:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO years' });
  }
});

/**
 * @route   GET /api/ipos/performance
 * @desc    Get IPOs sorted by performance metrics
 * @access  Public
 */
router.get('/performance', withCache(120), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Parse and sanitize query parameters
    // Extract type from the query - handle malformed query strings
    let type = 'best';
    let limit = 10;
    let year = null;
    
    // Parse all parameters individually to handle any malformed URLs
    Object.keys(req.query).forEach(key => {
      const param = req.query[key];
      
      // Handle cases where the parameter might contain other parameters (e.g. "best?limit=10")
      if (key === 'type') {
        if (param.includes('?')) {
          // If the type parameter contains a question mark, extract just the type
          type = param.split('?')[0];
          
          // Try to parse additional params from the malformed query
          const additionalParams = param.split('?')[1];
          if (additionalParams) {
            additionalParams.split('&').forEach(p => {
              const [paramName, paramValue] = p.split('=');
              if (paramName === 'limit' && !isNaN(parseInt(paramValue))) {
                limit = parseInt(paramValue);
              }
              if (paramName === 'year' && !isNaN(parseInt(paramValue))) {
                year = parseInt(paramValue);
              }
            });
          }
        } else {
          type = param;
        }
      }
      
      // Handle normal parameters
      if (key === 'limit' && !isNaN(parseInt(param))) {
        limit = parseInt(param);
      }
      if (key === 'year' && !isNaN(parseInt(param))) {
        year = parseInt(param);
      }
    });
    
    // Validate type is either 'best' or 'worst'
    if (type !== 'best' && type !== 'worst') {
      type = 'best'; // Default to best if invalid
    }
    
    // Cap the limit to prevent excessive requests
    limit = Math.min(limit, 100);
    
    console.log(`Processing performance query with: type=${type}, limit=${limit}, year=${year}`);
    
    // Build filter - less restrictive than before
    const filter = { 
      status: 'listed',
      listing_gains_numeric: { $exists: true, $ne: null } 
    }; // Only consider listed IPOs with listing gains
    
    // Add year filter if provided
    if (year) filter.year = year;
    
    console.log('Fetching performance data with filter:', JSON.stringify(filter));
    
    // Determine sort direction based on performance type
    const sortDirection = type === 'worst' ? 1 : -1; // 1 for worst (ascending), -1 for best (descending)
    
    // Find IPOs - sort by listing_gains_numeric
    const ipos = await IpoModel.find(filter)
      .sort({ listing_gains_numeric: sortDirection })
      .limit(limit)
      .select('ipo_id ipo_name company_name year issue_price listing_gains listing_gains_numeric logo_url')
      .lean();
    
    console.log(`Found ${ipos.length} IPOs matching the performance criteria`);
    
    // If no results were found, try a more lenient approach
    if (ipos.length === 0) {
      // Try using the static method
      const topPerforming = await IpoModel.getTopPerforming(limit);
      
      if (topPerforming.length > 0) {
        console.log(`Found ${topPerforming.length} IPOs using getTopPerforming`);
        return res.status(200).json({
          performance_type: type,
          count: topPerforming.length,
          limit: limit,
          year: year || 'all',
          data: topPerforming,
          source: 'static_method'
        });
      }
      
      // If still no results, try a more lenient query
      const anyListedIpos = await IpoModel.find({ status: 'listed' })
        .sort({ year: -1, listing_date: -1 })
        .limit(limit)
        .select('ipo_id ipo_name company_name year issue_price listing_gains performance_score logo_url')
        .lean();
      
      if (anyListedIpos.length > 0) {
        console.log(`Found ${anyListedIpos.length} IPOs using lenient query`);
        return res.status(200).json({
          performance_type: type,
          count: anyListedIpos.length,
          limit: limit,
          year: year || 'all',
          data: anyListedIpos,
          source: 'lenient_query'
        });
      }
    }
    
    // Calculate performance metrics for any IPOs that might not have them stored
    const formattedIpos = ipos.map(ipo => {
      // Extract performance data 
      let listingGain = null;
      
      // Try to extract from listing_gains field
      if (ipo.listing_gains) {
        const gainsMatch = ipo.listing_gains.match(/(-?\d+(\.\d+)?)/);
        if (gainsMatch) {
          listingGain = parseFloat(gainsMatch[1]);
        }
      }
      
      // If no listing gain was extracted, try to calculate it
      if (listingGain === null && ipo.issue_price && ipo.listing_price) {
        const issuePrice = parseFloat(ipo.issue_price.replace(/[₹,]/g, ''));
        const listingPrice = parseFloat(ipo.listing_price.replace(/[₹,]/g, ''));
        
        if (!isNaN(issuePrice) && !isNaN(listingPrice) && issuePrice > 0) {
          listingGain = ((listingPrice - issuePrice) / issuePrice) * 100;
        }
      }
      
      return {
        ipo_id: ipo.ipo_id,
        ipo_name: ipo.ipo_name,
        company_name: ipo.company_name,
        year: ipo.year,
        issue_price: ipo.issue_price,
        listing_gains: ipo.listing_gains || (listingGain !== null ? `${listingGain.toFixed(2)}%` : 'N/A'),
        performance_score: ipo.performance_score,
        logo_url: ipo.logo_url
      };
    });
    
    return res.status(200).json({
      performance_type: type,
      count: formattedIpos.length,
      limit: limit,
      year: year || 'all',
      data: formattedIpos,
      source: 'performance_score'
    });
  } catch (error) {
    console.error('Error fetching IPO performance data:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO performance data' });
  }
});

/**
 * @route   GET /api/ipos/categories
 * @desc    Get IPOs by category
 * @access  Public
 */
router.get('/categories', withCache(600), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const category = req.query.category;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    
    // If no category specified, return available categories
    if (!category) {
      const categories = await IpoModel.distinct('category');
      return res.status(200).json({
        count: categories.length,
        data: categories.filter(c => c && c.trim() !== '')
      });
    }
    
    // Build filter
    const filter = {
      category: { $regex: new RegExp(category, 'i') }
    };
    
    // Add year filter if specified
    if (year) filter.year = year;
    
    // Find IPOs in the category
    const ipos = await IpoModel.find(filter)
      .sort({ opening_date: -1 })
      .select('ipo_id ipo_name company_name year opening_date closing_date issue_price category logo_url')
      .lean();
    
    return res.status(200).json({
      category,
      count: ipos.length,
      data: ipos
    });
  } catch (error) {
    console.error('Error fetching IPO categories:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO categories' });
  }
});

/**
 * @route   GET /api/ipos/stats
 * @desc    Get IPO statistics
 * @access  Public
 */
router.get('/stats', withCache(1800), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get current year
    const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
    
    // Get various counts with Promise.all for parallel execution
    const [
      totalCount,
      yearCount, 
      upcomingCount,
      openCount,
      closedCount,
      listedCount,
      bestPerforming
    ] = await Promise.all([
      IpoModel.countDocuments({}),
      IpoModel.countDocuments({ year }),
      IpoModel.countDocuments({ status: 'upcoming' }),
      IpoModel.countDocuments({ status: 'open' }),
      IpoModel.countDocuments({ status: 'closed' }),
      IpoModel.countDocuments({ status: 'listed' }),
      IpoModel.find({ 
        year,
        'performance.listingGain': { $exists: true, $ne: null }
      })
        .sort({'performance.listingGain': -1})
        .limit(1)
        .select('ipo_id ipo_name company_name performance.listingGain')
        .lean()
    ]);
    
    // Create stats object
    const stats = {
      total_ipos: totalCount,
      current_year: {
        year,
        count: yearCount,
      },
      status: {
        upcoming: upcomingCount,
        open: openCount,
        closed: closedCount,
        listed: listedCount
      },
      best_performer: bestPerforming.length > 0 ? {
        ipo_id: bestPerforming[0].ipo_id,
        ipo_name: bestPerforming[0].ipo_name,
        company_name: bestPerforming[0].company_name,
        listing_gain: bestPerforming[0].performance?.listingGain
      } : null
    };
    
    return res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching IPO stats:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO statistics' });
  }
});

/**
 * @route   GET /api/ipos/status/:status
 * @desc    Get IPOs by status
 * @access  Public
 */
router.get('/status/:status', withCache(60), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get status from the URL
    const { status } = req.params;
    
    // Validate status
    const validStatuses = ['upcoming', 'open', 'closed', 'listed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status parameter',
        validStatuses
      });
    }
    
    // Parse other query parameters
    const limit = parseInt(req.query.limit || '20', 10);
    const page = parseInt(req.query.page || '1', 10);
    const skip = (page - 1) * limit;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    
    // Build filter
    const filter = { status };
    
    // Add year filter if provided
    if (year) {
      filter.year = year;
    }
    
    // Fetch IPOs with pagination
    const [ipos, total] = await Promise.all([
      IpoModel.find(filter)
        .sort({ opening_date: -1 })
        .skip(skip)
        .limit(limit)
        .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status allotment_date logo_url')
        .lean(),
      IpoModel.countDocuments(filter)
    ]);
    
    // Calculate total pages
    const totalPages = Math.ceil(total / limit);
    
    // Return results
    return res.status(200).json({
      status,
      data: ipos || [], // Ensure we always return an array
      pagination: {
        total,
        limit,
        page,
        totalPages,
        hasMore: page < totalPages
      },
      message: total === 0 ? `No IPOs found with status: ${status}` : undefined
    });
  } catch (error) {
    console.error(`Error fetching IPOs with status ${req.params.status}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPOs' });
  }
});

/**
 * @route   GET /api/ipos/:id/sections
 * @desc    Get available sections for an IPO
 * @access  Public
 */
router.get('/:id/sections', withCache(300), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const ipoId = req.params.id;
    console.log(`Fetching sections for IPO ID: ${ipoId}`);
    
    // Try exact match first
    let ipo = await IpoModel.findOne({ ipo_id: ipoId })
      .select('ipo_id ipo_name company_name _metadata basicDetails about additionalTables faqs promoterHolding listingDetails')
      .lean();
    
    // If not found, try to match with some flexibility
    if (!ipo) {
      console.log('IPO not found with exact ID, trying alternative search strategies');
      
      // Try to match by removing _ipo suffix
      const cleanedId = ipoId.replace(/_ipo$/, '');
      ipo = await IpoModel.findOne({ ipo_id: cleanedId })
        .select('ipo_id ipo_name company_name _metadata basicDetails about additionalTables faqs promoterHolding listingDetails')
        .lean();
      
      // If still not found, try a regex search
      if (!ipo) {
        const regexPattern = new RegExp(ipoId.replace(/_/g, '.*?'), 'i');
        ipo = await IpoModel.findOne({ ipo_id: regexPattern })
          .select('ipo_id ipo_name company_name _metadata basicDetails about additionalTables faqs promoterHolding listingDetails')
          .lean();
      }
    }
    
    // If no IPO was found after all attempts
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    console.log(`Found IPO: ${ipo.ipo_name}`);
    
    // Determine available sections
    const availableSections = {
      basic: !!ipo.basicDetails,
      about: !!ipo.about,
      financials: !!(ipo.additionalTables && ipo.additionalTables.find(t => t.sanitizedHeading === 'financials')),
      faqs: !!(ipo.faqs && ipo.faqs.length > 0),
      promoters: !!ipo.promoterHolding,
      listing: !!ipo.listingDetails,
      // Additional metadata if available
      ...(ipo._metadata?.sectionsAvailable || {})
    };
    
    // Return the list of available sections
    return res.status(200).json({
      ipo_id: ipo.ipo_id,
      ipo_name: ipo.ipo_name,
      company_name: ipo.company_name,
      available_sections: availableSections
    });
  } catch (error) {
    console.error(`Error fetching IPO sections for ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPO sections' });
  }
});

/**
 * @route   GET /api/ipos/:id/section
 * @desc    Get a specific section of IPO data
 * @access  Public
 */
router.get('/:id/section', withCache(300), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const ipoId = req.params.id;
    
    // Parse and sanitize query parameters
    let sectionName = '';
    
    // Handle query parameters
    Object.keys(req.query).forEach(key => {
      const param = req.query[key];
      
      if (key === 'name' && typeof param === 'string') {
        sectionName = param.toLowerCase();
      }
    });
    
    // Validate section name
    if (!sectionName) {
      return res.status(400).json({ 
        error: 'Section name is required',
        valid_sections: ['basic', 'about', 'financials', 'faqs', 'promoters', 'listing', 'subscription']
      });
    }
    
    console.log(`Fetching section "${sectionName}" for IPO ID: ${ipoId}`);
    
    // Map section name to the actual data fields
    const sectionMapping = {
      basic: 'basicDetails',
      about: 'about',
      financials: 'additionalTables',
      faqs: 'faqs',
      promoters: 'promoterHolding',
      listing: 'listingDetails',
      subscription: 'subscriptionStatus'
    };
    
    // Determine fields to select based on requested section
    const fieldToSelect = sectionMapping[sectionName];
    
    if (!fieldToSelect) {
      return res.status(400).json({ 
        error: 'Invalid section name',
        valid_sections: Object.keys(sectionMapping)
      });
    }
    
    // Build projection - always include basic IPO info
    const projection = {
      ipo_id: 1,
      ipo_name: 1,
      company_name: 1,
      year: 1
    };
    
    // Add the requested section to the projection
    projection[fieldToSelect] = 1;
    
    // Try exact match first
    let ipo = await IpoModel.findOne({ ipo_id: ipoId })
      .select(projection)
      .lean();
    
    // If not found, try to match with some flexibility
    if (!ipo) {
      console.log('IPO not found with exact ID, trying alternative search strategies');
      
      // Try to match by removing _ipo suffix
      const cleanedId = ipoId.replace(/_ipo$/, '');
      ipo = await IpoModel.findOne({ ipo_id: cleanedId })
        .select(projection)
        .lean();
      
      // If still not found, try a regex search
      if (!ipo) {
        const regexPattern = new RegExp(ipoId.replace(/_/g, '.*?'), 'i');
        ipo = await IpoModel.findOne({ ipo_id: regexPattern })
          .select(projection)
          .lean();
      }
    }
    
    // If no IPO was found after all attempts
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    console.log(`Found IPO: ${ipo.ipo_name}`);
    
    // Extract the requested section data
    let sectionData = ipo[fieldToSelect];
    
    // Special handling for financials in additionalTables
    if (sectionName === 'financials' && Array.isArray(ipo.additionalTables)) {
      sectionData = ipo.additionalTables.find(t => 
        t.sanitizedHeading === 'financials' || 
        t.heading?.toLowerCase().includes('financial')
      ) || {};
    }
    
    // Return the section data
    return res.status(200).json({
      ipo_id: ipo.ipo_id,
      ipo_name: ipo.ipo_name,
      company_name: ipo.company_name,
      section: sectionName,
      data: sectionData || {}
    });
  } catch (error) {
    console.error(`Error fetching IPO section for ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPO section' });
  }
});

/**
 * @route   GET /api/ipos/:id/detail
 * @desc    Get detailed IPO information by ID
 * @access  Public
 */
router.get('/:id/detail', withCache(300), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const ipoId = req.params.id;
    console.log(`Fetching detail for IPO ID: ${ipoId}`);
    
    // Try exact match first
    let ipo = await IpoModel.findOne({ ipo_id: ipoId }).lean();
    
    // If not found, try to match with some flexibility
    if (!ipo) {
      // Many IPO IDs have format like "2025_shreenath_paper_products_limited_ipo"
      // Try alternative formats or partial matches
      console.log('IPO not found with exact ID, trying alternative search strategies');
      
      // Try to match by removing _ipo suffix
      const cleanedId = ipoId.replace(/_ipo$/, '');
      ipo = await IpoModel.findOne({ ipo_id: cleanedId }).lean();
      
      // If still not found, try a regex search for a partial match
      if (!ipo) {
        const regexPattern = new RegExp(ipoId.replace(/_/g, '.*?'), 'i');
        ipo = await IpoModel.findOne({ ipo_id: regexPattern }).lean();
        
        // If still not found, try to tokenize the ID and search
        if (!ipo) {
          // Extract year and company name from ID format like 2025_company_name
          const parts = ipoId.split('_');
          if (parts.length > 1) {
            // Try to match by year and a partial company name
            const yearMatch = parts[0].match(/^\d{4}$/);
            if (yearMatch) {
              const year = parseInt(yearMatch[0], 10);
              const nameTokens = parts.slice(1).join(' ');
              
              // Use text search if available
              const nameQuery = { $text: { $search: nameTokens } };
              ipo = await IpoModel.findOne({ 
                year,
                $text: { $search: nameTokens } 
              }).lean();
              
              // Final fallback: just find the most recent IPO with matching year
              if (!ipo) {
                ipo = await IpoModel.findOne({ year })
                  .sort({ opening_date: -1 })
                  .lean();
              }
            }
          }
        }
      }
    }
    
    // If no IPO was found after all attempts
    if (!ipo) {
      console.log(`IPO not found for ID: ${ipoId}`);
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    console.log(`Found IPO: ${ipo.ipo_name}`);
    
    // Add any additional processing for detailed view
    // For example, compute additional metrics or format certain fields
    const enhancedIpo = {
      ...ipo,
      is_detail_view: true,
      
      // Add a formatted/clean version of the company name if needed
      formatted_company_name: ipo.company_name 
        ? ipo.company_name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
        : ipo.ipo_name,
        
      // Format performance metrics if available
      performance_metrics: {
        performance_score: ipo.performance_score || 0,
        listing_gains_formatted: ipo.listing_gains || 'N/A',
      }
    };
    
    // Return the IPO with detailed information
    return res.status(200).json(enhancedIpo);
  } catch (error) {
    console.error(`Error fetching IPO detail for ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPO details' });
  }
});

/**
 * @route   GET /api/ipos/:id
 * @desc    Get IPO by ID
 * @access  Public
 */
router.get('/:id', withCache(300), async (req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    const ipoId = req.params.id;
    console.log(`Fetching IPO with ID: ${ipoId}`);
    
    // Try exact match first
    let ipo = await IpoModel.findOne({ ipo_id: ipoId }).lean();
    
    // If not found, try to match with some flexibility
    if (!ipo) {
      // Many IPO IDs have format like "2025_shreenath_paper_products_limited_ipo"
      // Try alternative formats or partial matches
      console.log('IPO not found with exact ID, trying alternative search strategies');
      
      // Try to match by removing _ipo suffix
      const cleanedId = ipoId.replace(/_ipo$/, '');
      ipo = await IpoModel.findOne({ ipo_id: cleanedId }).lean();
      
      // If still not found, try a regex search for a partial match
      if (!ipo) {
        const regexPattern = new RegExp(ipoId.replace(/_/g, '.*?'), 'i');
        ipo = await IpoModel.findOne({ ipo_id: regexPattern }).lean();
        
        // If still not found, try to tokenize the ID and search
        if (!ipo) {
          // Extract year and company name from ID format like 2025_company_name
          const parts = ipoId.split('_');
          if (parts.length > 1) {
            // Try to match by year and a partial company name
            const yearMatch = parts[0].match(/^\d{4}$/);
            if (yearMatch) {
              const year = parseInt(yearMatch[0], 10);
              const nameTokens = parts.slice(1).join(' ');
              
              // Use text search if available
              ipo = await IpoModel.findOne({ 
                year,
                $text: { $search: nameTokens } 
              }).lean();
              
              // Final fallback: just find the most recent IPO with matching year
              if (!ipo) {
                ipo = await IpoModel.findOne({ year })
                  .sort({ opening_date: -1 })
                  .lean();
              }
            }
          }
        }
      }
    }
    
    // If no IPO was found after all attempts
    if (!ipo) {
      console.log(`IPO not found for ID: ${ipoId}`);
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    console.log(`Found IPO: ${ipo.ipo_name}`);
    
    // Return the IPO
    return res.status(200).json(ipo);
  } catch (error) {
    console.error(`Error fetching IPO ${req.params.id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPO details' });
  }
});

module.exports = router; 