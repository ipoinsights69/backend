const puppeteer = require('puppeteer');
const { fetchBasicDetails } = require('./ipoDetailScraper');

async function testBasicDetails(url) {
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
    
    // Extract specific IPO details directly from page
    const specificDetails = await page.evaluate(() => {
      // Define the specific fields we want
      const targetFields = {
        faceValue: "Face Value",
        issuePrice: "Issue Price",
        lotSize: "Lot Size",
        issueSize: "Total Issue Size",
        freshIssue: "Fresh Issue",
        offerForSale: "Offer for Sale",
        listingAt: "Listing At",
        ipoDate: "IPO Date",
        issuePriceBand: "Issue Price Band",
        shareHoldingPreIssue: "Share Holding Pre Issue",
        shareHoldingPostIssue: "Share Holding Post Issue",
        marketMakerPortion: "Market Maker Portion"

      };
      
      const results = {};
      
      // Find all rows in table
      const rows = document.querySelectorAll('table.table-bordered tr');
      
      // Extract only our target fields
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim();
          
          // Check if this row contains one of our target fields
          for (const [key, fieldLabel] of Object.entries(targetFields)) {
            if (label.includes(fieldLabel)) {
              results[key] = cells[cells.length - 1].textContent.trim();
              break;
            }
          }
        }
      });
      
      return results;
    });
    
    // Output the results
    console.log("\n===== SPECIFIC IPO DETAILS =====");
    Object.entries(specificDetails).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    
    return specificDetails;
    
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

// Example usage
const testUrl = 'https://www.chittorgarh.com/ipo/emcure-pharma-ipo/1545/'; // Update with a real IPO URL

// Run the test
testBasicDetails(testUrl)
  .then(result => {
    console.log("\n===== TEST COMPLETE =====");
    if (!result.error) {
      console.log("Successfully extracted specific IPO details");
    }
  })
  .catch(err => console.error("Error running test:", err)); 