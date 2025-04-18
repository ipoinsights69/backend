const puppeteer = require('puppeteer');
const { fetchSpecificIpoDetails } = require('./ipoDetailScraper');

async function testSpecificDetails(url) {
  let browser;
  try {
    console.log(`Starting test for URL: ${url}`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to the page and wait for content to load
    console.log("Navigating to page...");
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
    console.log("Page loaded successfully");
    
    // Use our specialized function to get just the specific details
    const result = await fetchSpecificIpoDetails(page);
    
    // Output the results
    console.log("\n===== SPECIFIC IPO DETAILS =====");
    console.log("IPO Name:", result.ipoName);
    
    // Show all the specific details
    const { ipoName, ...details } = result;
    Object.entries(details).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    
    return result;
    
  } catch (error) {
    console.error("Test failed:", error);
    return { error: true, message: error.message };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}

// Example usage with multiple URLs to show it works on different IPOs
const testUrls = [
  'https://www.chittorgarh.com/ipo/emcure-pharma-ipo/1545/',
  'https://www.chittorgarh.com/ipo/zaggle-prepaid-ocean-services-ipo/1487/'
];

// Run tests for each URL
async function runTests() {
  for (const url of testUrls) {
    console.log(`\n\nTESTING URL: ${url}\n`);
    await testSpecificDetails(url);
  }
  console.log("\n===== ALL TESTS COMPLETE =====");
}

runTests().catch(err => console.error("Error running tests:", err)); 