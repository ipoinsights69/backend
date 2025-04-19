import { connectToDatabase } from '../../../../lib/mongodb';
import { withApiOptimizations } from '../../../../lib/middleware';
import { runTask } from '../../../../lib/worker';

// Define model dynamically
let IpoModel;

/**
 * Optimized handler for individual IPO fetching
 */
async function handler(req, res) {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'IPO ID is required' });
  }
  
  switch (req.method) {
    case 'GET':
      return getIpo(req, res, id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Get single IPO by ID with optimized database access
 */
async function getIpo(req, res, id) {
  try {
    // Connect to database
    const mongoose = await connectToDatabase();
    
    // Get model (only once)
    if (!IpoModel) {
      IpoModel = mongoose.models.Ipo || mongoose.model('Ipo', require('../../../../models/IpoModel').schema);
    }
    
    // Use lean query for optimal performance
    const ipo = await IpoModel.findOne({ ipo_id: id }).lean();
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    // Check if enhanced data is requested
    if (req.query.enhanced === 'true') {
      try {
        // Use worker thread for CPU-intensive enhancements
        const enhancedData = await runTask('enhanceIpoData', { ipo });
        
        if (enhancedData && !enhancedData.error) {
          // Merge enhanced data into response
          Object.assign(ipo, {
            enhanced: enhancedData.data,
            performance: enhancedData.timing,
          });
        }
      } catch (error) {
        console.error('Error enhancing IPO data:', error);
        // Continue without enhanced data on error
      }
    }
    
    // Simulate related IPOs (optimization: just add IDs for lazy loading)
    if (req.query.related === 'true') {
      try {
        // Perform quick query to get related IPO IDs only
        const relatedIpoIds = await IpoModel.find({
          year: ipo.year,
          ipo_id: { $ne: ipo.ipo_id }
        })
        .sort('-opening_date')
        .limit(5)
        .select('ipo_id company_name')
        .lean();
        
        ipo.related_ipos = relatedIpoIds;
      } catch (error) {
        console.error('Error fetching related IPOs:', error);
        // Continue without related IPOs on error
      }
    }
    
    return res.status(200).json(ipo);
  } catch (error) {
    console.error(`Error fetching IPO ${id}:`, error);
    return res.status(500).json({ 
      error: 'Failed to fetch IPO details',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Apply optimizations with 2-minute cache for maximum performance
export default withApiOptimizations(120, {
  // Custom cache key generator for IPO details
  cacheKeyGenerator: (req) => {
    const { id, enhanced, related } = req.query;
    return `api:ipos:detail:${id}:${enhanced || 'false'}:${related || 'false'}`;
  },
  // Higher rate limit for detail pages
  rateLimit: {
    limit: 150, // 150 requests
    window: 60 // per minute
  }
})(handler); 