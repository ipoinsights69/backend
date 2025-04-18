const { fetchStructuredData } = require('./ipoDetailScraper');
const fs = require('fs');
const path = require('path');

// URLs to test with
const testUrls = [
  'https://www.chittorgarh.com/ipo/emcure-pharma-ipo/1545/', // Original test case
  'https://www.chittorgarh.com/ipo/arkade-developers-ipo/1552/' // Recent IPO with lot size table
];

async function runTest() {
  for (const testUrl of testUrls) {
    console.log(`\n\nTesting scraper with URL: ${testUrl}`);
    
    try {
      // Run the scraper
      const result = await fetchStructuredData(testUrl);
      
      // Create output directory if it doesn't exist
      const outputDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Generate a filename based on the URL
      const urlParts = testUrl.split('/');
      const ipoName = urlParts[urlParts.length - 2] || 'test';
      const outputFile = path.join(outputDir, `${ipoName}_test_result.json`);
      
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      
      console.log(`\nScraping completed successfully.`);
      console.log(`Results saved to: ${outputFile}`);
      
      // Display the basic details section specifically
      console.log('\n===== BASIC DETAILS SECTION =====');
      console.log(JSON.stringify(result.basicDetails, null, 2));
      
      // Also display the lot size section
      console.log('\n===== LOT SIZE SECTION =====');
      console.log(JSON.stringify(result.lotSize, null, 2));
      
      // Display the sections availability metadata
      console.log('\n===== SECTIONS AVAILABILITY =====');
      console.log(JSON.stringify(result._metadata.sectionsAvailable, null, 2));
      
    } catch (error) {
      console.error('Test failed:', error);
    }
  }
}

// Run the test
runTest().catch(console.error); 