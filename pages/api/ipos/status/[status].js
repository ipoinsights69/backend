import { connectToDatabase } from '../../../../config/database';
import IpoModel from '../../../../models/IpoModel';
import { withCache } from '../../utils/cache';

// Main handler for status filtering
const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get status from the URL
    const { status } = req.query;
    
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
    
    // Return results even if empty (don't return 404)
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
    console.error(`Error fetching IPOs with status ${req.query.status}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPOs by status' });
  }
};

// Export the handler with cache middleware (5 minute cache)
export default withCache(handler, 300); 