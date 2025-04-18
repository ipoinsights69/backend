import { connectToDatabase } from '../../../config/database';
import IpoModel from '../../../models/IpoModel';
import { withCache, createProjection } from '../utils/cache';
import compression from 'compression';

// Wrap handler with compression middleware
const withCompression = handler => (req, res) => {
  compression()(req, res, () => handler(req, res));
};

// Main handler for single IPO
const handler = async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'IPO ID is required' });
  }
  
  switch (req.method) {
    case 'GET':
      return getIpoById(id, req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get IPO by ID with optional section filtering
const getIpoById = async (id, req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Get sections to include (if specified)
    const { sections } = req.query;
    
    // Create projection object for MongoDB
    const projection = createProjection(sections);
    
    // Find IPO by ID with projection
    const query = { ipo_id: id };
    const options = Object.keys(projection).length ? { projection } : { lean: true };
    
    const ipo = await IpoModel.findOne(query, projection, options);
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    // Return IPO data
    return res.status(200).json(ipo);
  } catch (error) {
    console.error(`Error fetching IPO ${id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPO' });
  }
};

// Export the handler with cache and compression middleware
// Cache for 5 minutes (300 seconds)
export default withCompression(withCache(handler, 300)); 