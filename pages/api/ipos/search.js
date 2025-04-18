import { connectToDatabase } from '../../../config/database';
import IpoModel from '../../../models/IpoModel';

// In-memory cache for frequent searches
const searchCache = {
  data: {},
  // Clear cache every 5 minutes
  maxAge: 5 * 60 * 1000
};

// Clear expired cache entries
setInterval(() => {
  const now = Date.now();
  Object.keys(searchCache.data).forEach(key => {
    if (now - searchCache.data[key].timestamp > searchCache.maxAge) {
      delete searchCache.data[key];
    }
  });
}, 60 * 1000); // Check every minute

// Cache response for a shorter duration
const withCache = (handler) => async (req, res) => {
  // Set aggressive cache control headers for browsers/CDNs
  const cacheSeconds = parseInt(process.env.SEARCH_CACHE_TIME || '30', 10); 
  res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 2}, stale-while-revalidate=60`);
  
  return handler(req, res);
};

// Main handler for IPO search
const handler = async (req, res) => {
  switch (req.method) {
    case 'GET':
      return searchIpos(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Search IPOs by query
const searchIpos = async (req, res) => {
  try {
    const query = req.query.q;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Search request received for query: "${query}"`);
    }
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query is required and must be at least 2 characters' });
    }
    
    // Parse pagination parameters
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const skip = (page - 1) * limit;
    
    // Connect to database
    await connectToDatabase();
    
    // Construct a regex pattern that's case-insensitive
    const regexPattern = new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
    
    // Build a comprehensive query that uses both text search and regex
    // First try text search (using existing index, whatever it's named)
    let ipos = [];
    let total = 0;
    let searchType = '';
    
    try {
      // Try text search first (most efficient if index exists)
      const textSearchQuery = { $text: { $search: query } };
      const textResults = await IpoModel.find(textSearchQuery, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limit)
        .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status logo_url')
        .lean();
      
      if (textResults && textResults.length > 0) {
        ipos = textResults;
        total = await IpoModel.countDocuments(textSearchQuery);
        searchType = 'text';
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Text search returned ${ipos.length} results out of ${total} total`);
        }
      } else {
        // Fall back to regex search if text search returns no results
        const regexQuery = {
          $or: [
            { ipo_id: regexPattern },
            { ipo_name: regexPattern },
            { company_name: regexPattern },
            { issue_price: regexPattern },
            { status: regexPattern },
            { year: query.match(/^\d{4}$/) ? parseInt(query, 10) : null }
          ].filter(condition => condition.year !== null) // Filter out null year conditions
        };
        
        ipos = await IpoModel.find(regexQuery)
          .sort({ year: -1, opening_date: -1 })
          .skip(skip)
          .limit(limit)
          .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status logo_url')
          .lean();
        
        total = await IpoModel.countDocuments(regexQuery);
        searchType = 'regex';
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Regex search returned ${ipos.length} results out of ${total} total`);
        }
      }
    } catch (searchError) {
      console.error('Search error:', searchError);
      // If text search fails (e.g., no text index), just use regex
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
        .select('ipo_id ipo_name company_name year opening_date closing_date listing_date issue_price status logo_url')
        .lean();
      
      total = await IpoModel.countDocuments(regexQuery);
      searchType = 'regex-fallback';
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Fallback regex search returned ${ipos.length} results out of ${total} total`);
      }
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
      search_type: searchType
    };
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Returning ${formattedResults.length} results for query "${query}" using ${searchType} search`);
    }
    
    // Return results
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error searching IPOs:', error);
    return res.status(500).json({ error: `Failed to search IPOs: ${error.message}` });
  }
};

// Export the handler with cache middleware
export default withCache(handler); 