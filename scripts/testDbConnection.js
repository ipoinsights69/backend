require('dotenv').config();
const db = require('../config/database');
const IpoModel = require('../models/IpoModel');

async function testConnection() {
  console.log('Testing database connection...');
  console.log('MongoDB URI:', process.env.MONGODB_URI || 'mongodb://localhost:27017/ipo_data');
  
  try {
    // Connect to the database
    await db.connectToDatabase();
    console.log('Successfully connected to MongoDB');
    
    // Count IPOs in the database
    const count = await IpoModel.countDocuments();
    console.log(`Found ${count} IPOs in the database`);
    
    if (count > 0) {
      // Get a sample of IPOs
      const sample = await IpoModel.find()
        .sort({ _id: -1 })
        .limit(5)
        .select('ipo_id company_name year status')
        .lean();
      
      console.log('Sample IPOs:');
      console.table(sample);
    } else {
      console.log('No IPOs found in the database');
    }
    
    // Get years
    const years = await IpoModel.distinct('year');
    if (years.length > 0) {
      console.log(`Years with IPO data: ${years.sort((a, b) => b - a).join(', ')}`);
    }
    
    // Get statuses
    const statuses = await IpoModel.distinct('status');
    if (statuses.length > 0) {
      console.log(`IPO statuses in database: ${statuses.join(', ')}`);
    }
    
  } catch (error) {
    console.error('Error testing database connection:', error);
  } finally {
    // Disconnect from the database
    await db.disconnectFromDatabase();
    process.exit(0);
  }
}

// Run the test
testConnection(); 