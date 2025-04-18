/**
 * IPO Scraper and API Server
 * Main entry point
 */

// Load environment variables
require('dotenv').config();

// Check command-line arguments
const args = process.argv.slice(2);
const command = args[0] || 'server';

// Process command
switch (command) {
  case 'server':
    // Start API server
    require('./server');
    break;
    
  case 'scrape':
    // Run scraper with arguments
    const startYear = parseInt(args[1] || new Date().getFullYear(), 10);
    const endYear = parseInt(args[2] || startYear, 10);
    const saveToMongo = args[3] === 'true' || args[3] === '--mongo';
    
    console.log(`Starting scraper for years ${startYear}-${endYear} with MongoDB: ${saveToMongo}`);
    
    // Execute scraper directly with specific arguments
    const { scrapeIposByYearRange } = require('./scripts/scrapeIpos');
    
    scrapeIposByYearRange(startYear, endYear, saveToMongo)
      .then(() => {
        console.log('Scraping process completed.');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
    break;
    
  default:
    console.error(`Unknown command: ${command}`);
    console.log('Available commands:');
    console.log('  - server: Start the API server');
    console.log('  - scrape [startYear] [endYear] [saveMongo]: Run the scraper');
    process.exit(1);
} 