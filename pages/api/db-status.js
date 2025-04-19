import { connectToDatabase, isConnected } from '../../lib/mongodb';

export default async function handler(req, res) {
  try {
    // Attempt to connect to the database
    await connectToDatabase();
    
    // Check if we're connected
    const connected = isConnected();
    
    if (connected) {
      return res.status(200).json({ 
        status: 'ok',
        message: 'MongoDB connection successful',
        connected: true
      });
    } else {
      return res.status(500).json({ 
        status: 'error',
        message: 'MongoDB connection failed',
        connected: false
      });
    }
  } catch (error) {
    console.error('MongoDB connection test error:', error);
    
    return res.status(500).json({
      status: 'error',
      message: `MongoDB connection failed: ${error.message}`,
      connected: false
    });
  }
} 