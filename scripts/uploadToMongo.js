const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const IpoModel = require('../models/IpoModel');
const { smartUpdateIpo, batchSmartUpdate } = require('../utils/mongoUpdater');
require('dotenv').config();

// Base directory for data storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

/**
 * Reads all IPO data files for a specific year
 * @param {string} year - Year to read data for
 * @returns {Promise<Array>} - Array of IPO data objects
 */
async function readIpoDataForYear(year) {
  try {
    const yearDir = path.join(DATA_DIR, year.toString());
    
    // Check if directory exists
    try {
      await fs.access(yearDir);
    } catch (error) {
      console.error(`Directory for year ${year} does not exist: ${yearDir}`);
      return [];
    }
    
    // Get all files in the directory
    const files = await fs.readdir(yearDir);
    const ipoFiles = files.filter(file => 
      file.endsWith('.json') && 
      !file.startsWith('_') && 
      !file.startsWith('sample_')
    );
    
    console.log(`Found ${ipoFiles.length} IPO files for year ${year}`);
    
    // Read each file and parse JSON
    const ipoData = [];
    for (const file of ipoFiles) {
      try {
        const filePath = path.join(yearDir, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        // Add year and ipo_id if not present
        if (!data.year) data.year = parseInt(year, 10);
        if (!data.ipo_id) {
          // Generate ID from filename
          const filename = path.basename(file, '.json');
          data.ipo_id = `${year}_${filename}`;
        }
        
        ipoData.push(data);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error.message);
      }
    }
    
    return ipoData;
  } catch (error) {
    console.error(`Error reading IPO data for year ${year}:`, error);
    return [];
  }
}

/**
 * Upload IPO data to MongoDB with smart updates
 * @param {Array} ipoData - Array of IPO data objects
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Result statistics
 */
async function uploadToMongo(ipoData, options = {}) {
  const { overwrite = false, batchSize = 10 } = options;
  const stats = { 
    total: ipoData.length, 
    created: 0, 
    updated: 0, 
    unchanged: 0, 
    skipped: 0, 
    errors: 0 
  };
  
  try {
    // Process in batches to avoid memory issues
    for (let i = 0; i < ipoData.length; i += batchSize) {
      const batch = ipoData.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(ipoData.length/batchSize)}`);
      
      const promises = batch.map(async (ipo) => {
        try {
          if (!ipo.ipo_id) {
            console.warn(`IPO missing ipo_id, skipping: ${ipo.company_name || 'unknown'}`);
            stats.skipped++;
            return;
          }
          
          // Check if this IPO already exists in the database
          const existingIpo = await IpoModel.findOne({ ipo_id: ipo.ipo_id });
          
          if (existingIpo && !overwrite) {
            // Skip if already exists and overwrite is false
            console.log(`IPO already exists, skipping: ${ipo.ipo_id}`);
            stats.skipped++;
          } else if (!existingIpo) {
            // Insert new IPO
            await IpoModel.upsertIpo(ipo);
            console.log(`Successfully created new IPO: ${ipo.ipo_id}`);
            stats.created++;
          } else {
            // Use smart update for existing records
            const result = await smartUpdateIpo(ipo);
            
            // Check if any fields were updated
            if (Object.keys(result).length > 1) { // More than just the ipo_id field
              console.log(`Updated IPO with selective changes: ${ipo.ipo_id}`);
              stats.updated++;
            } else {
              console.log(`No changes detected for IPO: ${ipo.ipo_id}`);
              stats.unchanged++;
            }
          }
        } catch (error) {
          console.error(`Error uploading IPO ${ipo.ipo_id || 'unknown'}:`, error.message);
          stats.errors++;
        }
      });
      
      // Wait for all promises in the batch to resolve
      await Promise.all(promises);
    }
    
    return stats;
  } catch (error) {
    console.error('Error during batch upload:', error);
    throw error;
  }
}

/**
 * Main function to upload all or year-specific IPO data to MongoDB
 * @param {number|null} startYear - Start year (null for all years)
 * @param {number|null} endYear - End year (null for same as startYear)
 * @param {Object} options - Upload options
 */
async function uploadIpoData(startYear = null, endYear = null, options = {}) {
  try {
    console.log('Connecting to MongoDB...');
    await db.connectToDatabase();
    
    let years = [];
    
    if (startYear === null) {
      // Upload all years
      const dirs = await fs.readdir(DATA_DIR);
      years = dirs.filter(dir => /^\d{4}$/.test(dir)); // Only directories that are valid years
    } else {
      // Upload specific years
      const actualEndYear = endYear || startYear;
      for (let year = startYear; year <= actualEndYear; year++) {
        years.push(year.toString());
      }
    }
    
    console.log(`Processing data for years: ${years.join(', ')}`);
    
    const totalStats = { total: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 };
    
    // Process each year
    for (const year of years) {
      console.log(`\n--- Processing Year: ${year} ---`);
      
      // Read IPO data for this year
      const ipoData = await readIpoDataForYear(year);
      
      if (ipoData.length === 0) {
        console.log(`No IPO data found for year ${year}`);
        continue;
      }
      
      // Upload to MongoDB
      console.log(`Uploading ${ipoData.length} IPOs to MongoDB...`);
      const stats = await uploadToMongo(ipoData, options);
      
      // Update total stats
      totalStats.total += stats.total;
      totalStats.created += stats.created;
      totalStats.updated += stats.updated;
      totalStats.unchanged += stats.unchanged;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;
      
      console.log(`Results for year ${year}:`, stats);
    }
    
    console.log('\nUpload complete!');
    console.log('Total statistics:', totalStats);
  } catch (error) {
    console.error('Error during upload process:', error);
  } finally {
    await db.disconnectFromDatabase();
  }
}

// Handle direct execution
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const startYear = args[0] === 'all' ? null : (args[0] ? parseInt(args[0], 10) : new Date().getFullYear());
  const endYear = args[1] ? parseInt(args[1], 10) : (startYear !== null ? startYear : null);
  const overwrite = args.includes('--overwrite');
  const batchSize = args.includes('--batch-size') 
    ? parseInt(args[args.indexOf('--batch-size') + 1], 10) 
    : 10;
  
  // Display execution info
  if (startYear === null) {
    console.log(`Uploading ALL years to MongoDB with overwrite=${overwrite}, batchSize=${batchSize}`);
  } else if (startYear === endYear || !endYear) {
    console.log(`Uploading year ${startYear} to MongoDB with overwrite=${overwrite}, batchSize=${batchSize}`);
  } else {
    console.log(`Uploading years ${startYear}-${endYear} to MongoDB with overwrite=${overwrite}, batchSize=${batchSize}`);
  }
  
  // Start upload
  uploadIpoData(startYear, endYear, { overwrite, batchSize })
    .then(() => {
      console.log('Upload process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error during upload:', error);
      process.exit(1);
    });
}

module.exports = {
  uploadIpoData,
  readIpoDataForYear,
  uploadToMongo
}; 