import { connectToDatabase } from '../../../../config/database';
import IpoModel from '../../../../models/IpoModel';
import { withCache } from '../../utils/cache';
import compression from 'compression';

// Wrap handler with compression middleware
const withCompression = handler => (req, res) => {
  compression()(req, res, () => handler(req, res));
};

// Main handler for IPO sections
const handler = async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'IPO ID is required' });
  }
  
  switch (req.method) {
    case 'GET':
      return getIpoSections(id, req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
};

// Get available sections for an IPO
const getIpoSections = async (id, req, res) => {
  try {
    // Ensure database connection
    await connectToDatabase();
    
    // Find IPO by ID
    const ipo = await IpoModel.findOne({ ipo_id: id })
      .select('_metadata.sectionsAvailable')
      .lean();
    
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }
    
    // Get available sections
    const availableSections = ipo._metadata?.sectionsAvailable || {};
    
    // Convert to array of available section names
    const sectionNames = Object.keys(availableSections).filter(key => 
      availableSections[key] === true
    );
    
    // For IPOs without _metadata, include default core sections
    const defaultSections = [
      'basicDetails',
      'company_name',
      'year',
      'ipo_id',
      'ipo_name',
      'issue_price',
      'issue_size'
    ];
    
    const sections = sectionNames.length ? sectionNames : defaultSections;
    
    return res.status(200).json({
      ipo_id: id,
      available_sections: sections
    });
  } catch (error) {
    console.error(`Error fetching sections for IPO ${id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch IPO sections' });
  }
};

// Export the handler with cache and compression middleware
// Cache for 1 hour (3600 seconds) as sections rarely change
export default withCompression(withCache(handler, 3600)); 