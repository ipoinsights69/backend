/**
 * Example Script - Using Enhanced Browser Helper
 * Demonstrates how to use the browser helper for web scraping
 */
const { launchBrowser, randomDelay } = require('../utils/browserHelper');

// Target URL to scrape
const TARGET_URL = 'https://www.chittorgarh.com/ipo/mainboard-ipo-in-india/';

/**
 * Example function: Scrape IPO listing data
 */
async function scrapeIpoListings() {
  let browser;
  let page;
  
  try {
    console.log('Launching browser with progressive fallback strategy...');
    
    // Launch browser with automatic fallback to different methods
    const result = await launchBrowser(TARGET_URL, {
      // Optional: Override headless mode (default: 'new')
      // headless: false, 
      
      // Optional: Pass additional args to the browser
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      
      // Optional: Enable proxy fallback
      // useProxy: true,  // Will only use proxy if direct methods fail
      
      // Optional: Set timeout
      timeout: 60000
    });
    
    browser = result.browser;
    page = result.page;
    
    // Log which method succeeded
    console.log(`Browser launched successfully with method: ${result.browserMethod}`);
    if (result.usingProxy) {
      console.log('Using proxy: yes');
    }
    
    // Page is already loaded at this point (launchBrowser navigates to the URL)
    console.log('Page loaded successfully');
    
    // Add random delay to appear more human-like
    await randomDelay(1000, 3000);
    
    // Extract data from the page
    console.log('Extracting data from page...');
    
    // Get page title
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Example: Extract IPO listings from the page
    const listings = await page.evaluate(() => {
      // Find the main table containing IPO data
      const table = document.querySelector('table.table-bordered');
      if (!table) return [];
      
      // Get all rows except header
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 3) return null;
        
        // Extract data from cells
        return {
          company: cells[0].textContent.trim(),
          openDate: cells[1]?.textContent.trim() || '',
          closeDate: cells[2]?.textContent.trim() || '',
          // Add more fields as needed
        };
      }).filter(item => item !== null);
    });
    
    // Log the results
    console.log(`Found ${listings.length} IPO listings`);
    console.log('First 3 listings:');
    listings.slice(0, 3).forEach((listing, index) => {
      console.log(`${index + 1}. ${listing.company} (${listing.openDate} - ${listing.closeDate})`);
    });
    
    // Take a screenshot
    await page.screenshot({ path: 'ipo-listings.png' });
    console.log('Screenshot saved to ipo-listings.png');
    
    return listings;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Run the example
if (require.main === module) {
  console.log('Starting browser example...');
  scrapeIpoListings()
    .then(listings => {
      console.log('Example completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
} 