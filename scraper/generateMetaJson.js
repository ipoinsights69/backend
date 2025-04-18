const fs = require('fs');
const path = require('path');

/**
 * Generates a meta.json file containing a list of all scraped IPOs
 */
function generateMetaJson() {
  console.log('Generating meta.json file...');
  
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    console.error('Data directory not found:', dataDir);
    return;
  }
  
  // Structure to hold our IPO metadata
  const ipoMeta = {
    total: 0,
    ipos: [],
    lastUpdated: new Date().toISOString()
  };
  
  // Get all years (directories in data folder)
  const years = fs.readdirSync(dataDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  // Process each year directory
  years.forEach(year => {
    const yearPath = path.join(dataDir, year);
    const files = fs.readdirSync(yearPath)
      .filter(file => file.endsWith('.json'));
    
    // Process each JSON file in the year directory
    files.forEach(file => {
      const filePath = path.join(yearPath, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Extract key details
        const ipoData = {
          ipoName: data.ipoName || path.basename(file, '.json'),
          year: year,
          path: `${year}/${file}`,
          listingAt: Array.isArray(data.basicDetails?.listingAt) ? 
            data.basicDetails.listingAt.join(', ') : 
            (data.basicDetails?.listingAt || 'Unknown'),
          sectionsAvailable: data._metadata?.sectionsAvailable || {},
          scrapedAt: data._metadata?.scrapedAt || null
        };
        
        // Add to our list
        ipoMeta.ipos.push(ipoData);
      } catch (err) {
        console.error(`Error processing ${filePath}:`, err.message);
      }
    });
  });
  
  // Update total count
  ipoMeta.total = ipoMeta.ipos.length;
  
  // Sort by most recent first
  ipoMeta.ipos.sort((a, b) => {
    // Try to sort by scrapedAt date if available
    if (a.scrapedAt && b.scrapedAt) {
      return new Date(b.scrapedAt) - new Date(a.scrapedAt);
    }
    // Otherwise sort by year
    return b.year - a.year;
  });
  
  // Write the meta.json file
  const metaPath = path.join(dataDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(ipoMeta, null, 2));
  
  console.log(`Meta.json file created with ${ipoMeta.total} IPO entries at: ${metaPath}`);
}

// Run the function if this script is executed directly
if (require.main === module) {
  generateMetaJson();
}

// Export for use in other scripts
module.exports = { generateMetaJson }; 