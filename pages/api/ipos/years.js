import { connectToDatabase } from '../../../config/database';
import IpoModel from '../../../models/IpoModel';
import { withCache } from '../utils/cache';

// Main handler to get all available years with IPO data
const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get distinct years from the IPO data
    const years = await IpoModel.distinct('year');
    
    // Sort years in descending order (newest first)
    const sortedYears = years.sort((a, b) => b - a);
    
    // Return empty array if no years found (don't return 404)
    return res.status(200).json({
      total: sortedYears.length,
      data: sortedYears,
      message: sortedYears.length === 0 ? 'No IPO years found in the database' : undefined
    });
  } catch (error) {
    console.error('Error fetching IPO years:', error);
    return res.status(500).json({ error: 'Failed to fetch IPO years' });
  }
};

// Export the handler with cache middleware (1 hour cache)
export default withCache(handler, 3600); 