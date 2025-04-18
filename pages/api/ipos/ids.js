import { connectToDatabase } from '../../../config/database';
import IpoModel from '../../../models/IpoModel';
import { withCache } from '../utils/cache';

// Main handler to get all IPO IDs
const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Parse query parameters
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const status = req.query.status || null;
    
    // Build filter
    const filter = {};
    
    // Add year filter if provided
    if (year) {
      filter.year = year;
    }
    
    // Add status filter if provided
    if (status) {
      const validStatuses = ['upcoming', 'open', 'closed', 'listed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status parameter',
          validStatuses
        });
      }
      filter.status = status;
    }
    
    // Fetch only IPO IDs
    const ipoIds = await IpoModel.find(filter)
      .select('ipo_id')
      .sort({ opening_date: -1 })
      .lean();
    
    // Return even if empty (don't return 404)
    return res.status(200).json({
      total: ipoIds.length,
      data: ipoIds.map(ipo => ipo.ipo_id),
      message: ipoIds.length === 0 ? 'No IPOs found matching the criteria' : undefined
    });
  } catch (error) {
    console.error('Error fetching IPO IDs:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO IDs' });
  }
};

// Export the handler with cache middleware (5 minute cache)
export default withCache(handler, 300); 