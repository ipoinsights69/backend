/**
 * Script to update IPO documents with computed fields required for the API
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { enrichIpoDocument } = require('../api/utils/ipoUtils');

// MongoDB connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'ipo_data';

// Collections
const COLLECTIONS = {
  IPO_LISTINGS: 'ipo_listings',
  IPO_DETAILS: 'ipo_details'
};

/**
 * Connect to MongoDB
 * @returns {Promise<MongoClient>} MongoDB client
 */
async function connectToMongoDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected to MongoDB');
    return client;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Update IPO documents with computed fields for API
 */
async function updateIpoFields() {
  let client;

  try {
    client = await connectToMongoDB();
    const db = client.db(MONGODB_DB_NAME);
    const ipoCollection = db.collection(COLLECTIONS.IPO_LISTINGS);
    const detailCollection = db.collection(COLLECTIONS.IPO_DETAILS);
    
    console.log('Fetching IPO documents...');
    
    // Get all IPO documents
    const ipos = await ipoCollection.find({}).toArray();
    console.log(`Found ${ipos.length} IPO documents`);
    
    // Process each IPO
    let updateCount = 0;
    for (const ipo of ipos) {
      try {
        // Enrich document with computed fields
        const enrichedIpo = enrichIpoDocument(ipo);
        
        // Only update if there are changes
        if (JSON.stringify(ipo) !== JSON.stringify(enrichedIpo)) {
          // Update the document
          await ipoCollection.updateOne(
            { _id: ipo._id },
            { $set: enrichedIpo }
          );
          updateCount++;
        }
        
        // Ensure details collection has the ipo_id field as well
        if (enrichedIpo.ipo_id) {
          await detailCollection.updateOne(
            { company_name: ipo.company_name, year: ipo.year },
            { 
              $set: { 
                ipo_id: enrichedIpo.ipo_id,
                ipo_name: enrichedIpo.ipo_name || `${ipo.company_name} IPO`
              } 
            },
            { upsert: false } // Only update if exists
          );
        }
      } catch (error) {
        console.error(`Error processing IPO ${ipo.company_name}:`, error);
      }
    }
    
    console.log(`Updated ${updateCount} IPO documents with computed fields`);
    
    // Create indexes for API queries
    console.log('Creating indexes for API queries...');
    await ipoCollection.createIndex({ ipo_id: 1 }, { unique: true });
    await ipoCollection.createIndex({ company_name: 'text', ipo_name: 'text' });
    await ipoCollection.createIndex({ status: 1 });
    await ipoCollection.createIndex({ year: 1 });
    await ipoCollection.createIndex({ issue_price_numeric: 1 });
    await ipoCollection.createIndex({ performance_score: 1 });
    await ipoCollection.createIndex({ category: 1 });
    
    await detailCollection.createIndex({ ipo_id: 1 });
    await detailCollection.createIndex({ company_name: 1, year: 1 }, { unique: true });
    
    console.log('Indexes created successfully');
    
    console.log('Update completed successfully');
  } catch (error) {
    console.error('Error updating IPO fields:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the script if executed directly
if (require.main === module) {
  updateIpoFields()
    .then(() => {
      console.log('Update completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error during update:', error);
      process.exit(1);
    });
}

module.exports = { updateIpoFields }; 