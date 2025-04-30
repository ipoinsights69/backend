/**
 * Script to update the issue_price field in the _listings.json file
 * by extracting the issuePrice from each IPO's detailed JSON file
 */

const fs = require('fs').promises;
const path = require('path');
const { extractNumericPrice } = require('../api/utils/ipoUtils');

// Base directory for JSON data files
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/**
 * Update the issue_price in listings file from individual IPO files
 */
async function updateListingsPrices() {
  try {
    console.log('Starting to update issue_price in _listings.json files...');
    
    // Get available years
    const years = await getAvailableYears();
    
    for (const year of years) {
      console.log(`Processing year: ${year}...`);
      
      // Read the listings file for this year
      const listingsPath = path.join(DATA_DIR, year.toString(), '_listings.json');
      let listings = [];
      
      try {
        const listingsData = await fs.readFile(listingsPath, 'utf8');
        listings = JSON.parse(listingsData);
      } catch (error) {
        console.error(`Error reading listings for year ${year}:`, error.message);
        continue; // Skip to next year if can't read listings
      }
      
      let updatedCount = 0;
      
      // Update each listing
      for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        const ipoId = listing.ipo_id || `${year}_${listing.company_name.toLowerCase().replace(/\s+/g, '_')}`;
        const fileName = ipoId.split('_').slice(1).join('_') + '.json';
        const detailPath = path.join(DATA_DIR, year.toString(), fileName);
        
        try {
          // Try to read the detailed file
          const detailData = await fs.readFile(detailPath, 'utf8');
          const ipoDetail = JSON.parse(detailData);
          
          // Extract issue price from basicDetails 
          if (ipoDetail.basicDetails && ipoDetail.basicDetails.issuePrice) {
            const rawIssuePrice = ipoDetail.basicDetails.issuePrice;
            
            // Format the price 
            if (rawIssuePrice.includes('to')) {
              const priceRange = extractNumericPrice(rawIssuePrice);
              listings[i].issue_price = priceRange;
              updatedCount++;
            } else {
              // Single price
              const price = extractNumericPrice(rawIssuePrice);
              listings[i].issue_price = price;
              updatedCount++;
            }
          }
        } catch (error) {
          // Skip if can't read detail file
          console.log(`Could not process IPO file ${fileName}: ${error.message}`);
        }
      }
      
      // Save the updated listings
      if (updatedCount > 0) {
        await fs.writeFile(listingsPath, JSON.stringify(listings, null, 2), 'utf8');
        console.log(`Updated ${updatedCount} IPO prices for year ${year}`);
      } else {
        console.log(`No issue_price updates needed for year ${year}`);
      }
    }
    
    console.log('Finished updating issue_price in _listings.json files');
  } catch (error) {
    console.error('Error in updateListingsPrices:', error);
  }
}

/**
 * Get years with IPO data
 * @returns {Promise<Array>} - Available years
 */
async function getAvailableYears() {
  try {
    const dirs = await fs.readdir(DATA_DIR);
    return dirs
      .filter(dir => /^\d{4}$/.test(dir)) // Only include directories named as years
      .map(dir => parseInt(dir))
      .sort((a, b) => b - a); // Sort descending
  } catch (error) {
    console.error('Error getting available years:', error);
    return [];
  }
}

// Run the update script
updateListingsPrices().then(() => {
  console.log('Script completed successfully');
}).catch(error => {
  console.error('Script failed:', error);
}); 