const mongoose = require('mongoose');
const { connectToDatabase, disconnectFromDatabase } = require('../config/database');
require('dotenv').config();

// Function to fix MongoDB indexes and data issues
async function fixMongoDbIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await connectToDatabase();
    
    // Get a reference to the database
    const db = mongoose.connection.db;
    
    console.log('Checking for ipos collection...');
    const collections = await db.listCollections({ name: 'ipos' }).toArray();
    
    if (collections.length === 0) {
      console.log('Collection ipos does not exist yet. No fixes needed.');
      return;
    }
    
    // Get the ipos collection
    const iposCollection = db.collection('ipos');
    
    // Check for documents with null ipoId
    console.log('Checking for documents with null ipoId field...');
    const nullIpoIdCount = await iposCollection.countDocuments({ ipoId: null });
    
    if (nullIpoIdCount > 0) {
      console.log(`Found ${nullIpoIdCount} documents with null ipoId`);
      
      // Drop the problematic index
      console.log('Dropping the problematic ipoId index...');
      try {
        await iposCollection.dropIndex('ipoId_1');
        console.log('Successfully dropped index ipoId_1');
      } catch (indexError) {
        console.log('Error dropping index (may not exist):', indexError.message);
      }
      
      // Update documents to set ipo_id instead of ipoId
      console.log('Updating documents to use ipo_id field...');
      
      // Find all documents that have a null ipoId
      const nullDocs = await iposCollection.find({ ipoId: null }).toArray();
      
      for (const doc of nullDocs) {
        // Generate a valid ipo_id if needed
        let ipo_id = doc.ipo_id;
        
        if (!ipo_id && doc.year && doc.company_name) {
          const sanitizedName = doc.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          ipo_id = `${doc.year}_${sanitizedName}`;
        } else if (!ipo_id && doc.year && doc.ipo_name) {
          const sanitizedName = doc.ipo_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          ipo_id = `${doc.year}_${sanitizedName}`;
        } else if (!ipo_id) {
          // Skip if we can't generate a valid ID
          console.log(`Warning: Unable to generate ipo_id for document ${doc._id}`);
          continue;
        }
        
        // Update the document
        await iposCollection.updateOne(
          { _id: doc._id },
          { 
            $set: { ipo_id },
            $unset: { ipoId: "" }
          }
        );
        console.log(`Updated document ${doc._id} with ipo_id: ${ipo_id}`);
      }
    } else {
      console.log('No documents with null ipoId found');
    }
    
    // Ensure the correct index on ipo_id
    console.log('Creating index on ipo_id field...');
    await iposCollection.createIndex({ ipo_id: 1 }, { unique: true });
    
    // Update other text indexes
    console.log('Creating text indexes for search functionality...');
    await iposCollection.createIndex({ ipo_name: 'text', company_name: 'text' });
    
    console.log('Creating index on year field...');
    await iposCollection.createIndex({ year: 1 });
    
    console.log('Creating index on opening_date field...');
    await iposCollection.createIndex({ opening_date: 1 });
    
    console.log('Creating index on status field...');
    await iposCollection.createIndex({ status: 1 });
    
    console.log('Database index fixes applied successfully!');
    
  } catch (error) {
    console.error('Error fixing MongoDB indexes:', error);
  } finally {
    await disconnectFromDatabase();
  }
}

// Run if executed directly
if (require.main === module) {
  fixMongoDbIndexes()
    .then(() => {
      console.log('Index fixing process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error during index fixing:', error);
      process.exit(1);
    });
}

module.exports = { fixMongoDbIndexes }; 