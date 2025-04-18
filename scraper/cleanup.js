const fs = require('fs');
const path = require('path');

/**
 * Cleanup script to remove unnecessary files
 */
function cleanup() {
  console.log('Cleaning up unnecessary files...');
  
  const scraperDir = __dirname;
  
  // Files to keep
  const essentialFiles = [
    'ipoDetailScraper.js',
    'generateMetaJson.js'
  ];
  
  // Get all files in scraper directory
  const files = fs.readdirSync(scraperDir);
  
  // Remove non-essential files
  files.forEach(file => {
    if (!essentialFiles.includes(file) && file.endsWith('.js')) {
      const filePath = path.join(scraperDir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`Removed: ${filePath}`);
      } catch (err) {
        console.error(`Error removing ${filePath}:`, err.message);
      }
    }
  });
  
  console.log('Cleanup completed');
}

// Run the cleanup
cleanup(); 