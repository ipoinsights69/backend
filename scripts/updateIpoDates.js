require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const IpoModel = require('../models/IpoModel');

// Base directory for data storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

/**
 * Update dates for IPO records in MongoDB using their corresponding JSON files
 */
async function updateIpoDates() {
  try {
    console.log('Connecting to MongoDB...');
    await db.connectToDatabase();
    
    // Get all IPOs from database
    const ipos = await IpoModel.find({}).lean();
    console.log(`Found ${ipos.length} IPOs in database`);
    
    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    let errors = 0;
    
    // Process each IPO
    for (const ipo of ipos) {
      try {
        // Extract year and name from ipo_id
        const idMatch = ipo.ipo_id.match(/^(\d{4})_(.+)$/);
        if (!idMatch) {
          console.log(`Invalid ipo_id format: ${ipo.ipo_id}, skipping`);
          skipped++;
          continue;
        }
        
        const year = idMatch[1];
        const name = idMatch[2];
        
        // Find corresponding JSON file
        const yearDir = path.join(DATA_DIR, year);
        
        try {
          // Check if year directory exists
          await fs.access(yearDir);
        } catch (err) {
          console.log(`Directory for year ${year} not found, skipping IPO: ${ipo.ipo_id}`);
          skipped++;
          continue;
        }
        
        // List files in year directory
        const files = await fs.readdir(yearDir);
        const jsonFiles = files.filter(file => file.endsWith('.json') && !file.startsWith('_'));
        
        // Find file that might match this IPO
        const matchingFile = jsonFiles.find(file => {
          const fileNameWithoutExt = path.basename(file, '.json');
          // Check if sanitized filename would match the ID's name part
          const sanitizedName = fileNameWithoutExt.toLowerCase().replace(/[^a-z0-9]/g, '_');
          return sanitizedName === name || fileNameWithoutExt === name;
        });
        
        if (!matchingFile) {
          console.log(`JSON file not found for IPO: ${ipo.ipo_id}`);
          notFound++;
          continue;
        }
        
        // Read and parse JSON file
        const filePath = path.join(yearDir, matchingFile);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        // Create data object with the id and enriched data
        const enrichedData = { 
          ...data, 
          ipo_id: ipo.ipo_id,
          year: parseInt(year, 10)
        };
        
        // Use the upsertIpo method which has improved date parsing
        await IpoModel.upsertIpo(enrichedData);
        updated++;
        console.log(`Updated IPO: ${ipo.ipo_id}`);
      } catch (error) {
        console.error(`Error processing IPO ${ipo.ipo_id}:`, error.message);
        errors++;
      }
    }
    
    console.log('\nUpdate complete!');
    console.log(`Total IPOs: ${ipos.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Not found: ${notFound}`);
    console.log(`Errors: ${errors}`);
  } catch (error) {
    console.error('Error during update process:', error);
  } finally {
    await db.disconnectFromDatabase();
    process.exit(0);
  }
}

// Run the update
updateIpoDates(); 