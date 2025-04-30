/**
 * Test MongoDB Connection
 * Use this script to verify that MongoDB connection is working properly
 */

const { connectToMongoDB } = require('../utils/mongoDbHelper');
require('dotenv').config();

async function testConnection() {
  console.log('Testing MongoDB connection...');
  console.log(`Connection string: ${process.env.MONGODB_URI || 'mongodb://localhost:27017'}`);
  console.log(`Database name: ${process.env.MONGODB_DB_NAME || 'ipo_data'}`);
  
  let client;
  
  try {
    client = await connectToMongoDB();
    console.log('✅ Successfully connected to MongoDB!');
    
    // Test database access
    const db = client.db(process.env.MONGODB_DB_NAME || 'ipo_data');
    const collections = await db.listCollections().toArray();
    
    console.log('\nAvailable collections:');
    if (collections.length === 0) {
      console.log('- No collections found. This is normal for a new database.');
    } else {
      collections.forEach(collection => {
        console.log(`- ${collection.name}`);
      });
    }
    
    // Create test document
    console.log('\nCreating test document...');
    const testCollection = db.collection('test_connection');
    const result = await testCollection.insertOne({
      test: true,
      timestamp: new Date(),
      message: 'MongoDB connection test successful'
    });
    
    console.log(`✅ Test document created with ID: ${result.insertedId}`);
    
    // Retrieve the document
    const testDoc = await testCollection.findOne({ _id: result.insertedId });
    console.log('✅ Test document retrieved successfully');
    
    // Clean up
    await testCollection.deleteOne({ _id: result.insertedId });
    console.log('✅ Test document deleted');
    
    console.log('\n🎉 All tests passed! MongoDB connection is working properly.');
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection test failed:');
    console.error(error);
    return false;
  } finally {
    if (client) {
      await client.close();
      console.log('Connection closed');
    }
  }
}

// Execute the test if this script is run directly
if (require.main === module) {
  testConnection()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testConnection }; 