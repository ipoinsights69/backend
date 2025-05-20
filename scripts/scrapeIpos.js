const path = require('path');
const fs = require('fs').promises;
const { fetchIpoListings } = require('../scraper/ipoListingScraper');
const { fetchCompleteIpoData } = require('../scraper/ipoDetailScraper');
const { saveToJson, sanitizeFilename, ensureDirectoryExists } = require('../utils/helpers');
require('dotenv').config();

// Base directory for data storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Configure throttling
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_BETWEEN_REQUESTS || '1000', 10);

// Delay function to prevent rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process a single IPO, fetching details and saving to file
 * @param {Object} ipo - Basic IPO information with detail_url
 * @param {string} year - Year for organization
 * @returns {Promise<Object>} - Processed IPO data
 */
async function processIpo(ipo, year) {
  try {
    if (!ipo.detail_url) {
      console.warn(`Missing detail URL for IPO: ${ipo.company_name}`);
      return null;
    }

    // Full URL if it's a relative URL
    const fullUrl = ipo.detail_url.startsWith('http') 
      ? ipo.detail_url 
      : `https://www.chittorgarh.com${ipo.detail_url}`;

    console.log(`Processing IPO: ${ipo.company_name}`);
    
    // Use the comprehensive data fetching function
    const ipoData = await fetchCompleteIpoData(fullUrl);
    
    if (ipoData._error) {
      console.error(`Error fetching data for ${ipo.company_name}: ${ipoData.message}`);
      return null;
    }

    // Save to file system (organized by year)
    const yearDir = path.join(DATA_DIR, year.toString());
    const companyName = sanitizeFilename(ipo.company_name);
    const fileName = `${companyName}.json`;
    
    await saveToJson(yearDir, fileName, ipoData);
    console.log(`Saved ${ipo.company_name} data to ${path.join(yearDir, fileName)}`);

    // Add a delay after each request to avoid rate limiting
    await delay(DELAY_BETWEEN_REQUESTS);

    return ipoData;
  } catch (error) {
    console.error(`Error processing IPO ${ipo.company_name}:`, error);
    return null;
  }
}

/**
 * Checks if detailed data for an IPO already exists
 * @param {Object} ipo - IPO listing data
 * @param {string} year - Year directory
 * @returns {Promise<boolean>} - True if data exists, false otherwise
 */
async function ipoDetailExists(ipo, year) {
  if (!ipo || !ipo.company_name) return false;
  
  const yearDir = path.join(DATA_DIR, year.toString());
  const companyName = sanitizeFilename(ipo.company_name);
  const fileName = `${companyName}.json`;
  const filePath = path.join(yearDir, fileName);
  
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main function to scrape IPOs for a given year
 * Only scrapes new IPOs and always scrapes the latest 7
 * @param {number} year - Year to scrape
 */
async function scrapeNewIpos(year) {
  console.log(`\n--- Processing Year: ${year} ---`);
  
  try {
    // Ensure data directory exists
    await ensureDirectoryExists(DATA_DIR);
    const yearDir = path.join(DATA_DIR, year.toString());
    await ensureDirectoryExists(yearDir);
    
    // Fetch IPO listings for the year
    console.log(`Fetching IPO listings for year ${year}`);
    const ipoListings = await fetchIpoListings(year);
    
    if (!ipoListings || ipoListings.length === 0) {
      console.log(`No IPO listings found for year ${year}`);
      return true;
    }
    
    console.log(`Found ${ipoListings.length} IPO listings for year ${year}`);
    
    // Save listings summary to file
    const listingsPath = path.join(yearDir, '_listings.json');
    await saveToJson(yearDir, '_listings.json', ipoListings);
    console.log(`Saved listings summary for year ${year}`);
    
    // Identify which IPOs need to be scraped
    const iposToScrape = [];
    const latestIpos = ipoListings.slice(0, 7); // Get the latest 7 IPOs
    
    // Always scrape the latest 7 IPOs
    console.log(`\nWill always scrape the latest 7 IPOs:`);
    for (const ipo of latestIpos) {
      const exists = await ipoDetailExists(ipo, year);
      console.log(`- ${ipo.company_name}${exists ? ' (already exists, will update)' : ' (new)'}`);
      iposToScrape.push(ipo);
    }
    
    // Check the remaining IPOs and only add those that don't exist
    const remainingIpos = ipoListings.slice(7);
    const missingIpos = [];
    
    for (const ipo of remainingIpos) {
      const exists = await ipoDetailExists(ipo, year);
      if (!exists) {
        missingIpos.push(ipo);
      }
    }
    
    if (missingIpos.length > 0) {
      console.log(`\nFound ${missingIpos.length} missing IPOs that need to be scraped:`);
      missingIpos.forEach(ipo => console.log(`- ${ipo.company_name}`));
      iposToScrape.push(...missingIpos);
    } else {
      console.log('\nNo missing IPOs found beyond the latest 7.');
    }
    
    // Process all IPOs that need to be scraped sequentially
    console.log(`\nTotal IPOs to scrape: ${iposToScrape.length} out of ${ipoListings.length}`);
    
    if (iposToScrape.length === 0) {
      console.log('All IPO data is already up to date!');
      return true;
    }
    
    console.log('\nStarting sequential processing of IPOs...');
    for (let i = 0; i < iposToScrape.length; i++) {
      const ipo = iposToScrape[i];
      console.log(`\nProcessing IPO ${i+1}/${iposToScrape.length}: ${ipo.company_name}`);
      await processIpo(ipo, year.toString());
    }
    
    console.log(`\nCompleted processing ${iposToScrape.length} IPOs for year ${year}`);
    return true;
  } catch (error) {
    console.error(`Error processing year ${year}:`, error);
    return false;
  }
}

/**
 * Main function to scrape IPOs for a given year range
 * @param {number} startYear - Start year
 * @param {number} endYear - End year (inclusive)
 */
async function scrapeIposByYearRange(startYear, endYear) {
  console.log(`Starting optimized IPO scraping for years ${startYear}-${endYear}`);
  console.log('Only scraping new/missing IPOs and the latest 7');
  
  try {
    // Process each year sequentially
    for (let year = startYear; year <= endYear; year++) {
      await scrapeNewIpos(year);
    }
    
    console.log('\nIPO scraping completed successfully!');
    return true;
  } catch (error) {
    console.error('Error during IPO scraping:', error);
    return false;
  }
}

// Export functions for use in other modules
module.exports = {
  scrapeIposByYearRange,
  scrapeNewIpos
}; 