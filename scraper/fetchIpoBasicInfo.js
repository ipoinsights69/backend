const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Fetches basic IPO details from a URL
 * @param {string} url - The URL of the IPO page to scrape
 * @returns {Promise<Object>} - The basic IPO details
 */
async function fetchIpoBasicInfo(url) {
  let browser;
  try {
    console.log(`Fetching IPO basic info from: ${url}`);
    
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
    
    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
    console.log(`Page loaded: ${url}`);
    
    // Extract IPO name and logo
    const ipoName = await page.$eval('h1.ipo-title', el => el.textContent.trim())
      .catch(() => null);
    const logoUrl = await page.$eval('.div-logo img', el => el.getAttribute('src'))
      .catch(() => null);
    
    // Extract the specific details we want
    const details = await page.evaluate(() => {
      // Define the fields we want to extract
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
      
      // Find all rows in the basic details table
      const rows = document.querySelectorAll('table.table-bordered tr');
      
      // Extract our target fields
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim();
          
          // Check if this row contains one of our target fields
          for (const [key, fieldLabel] of Object.entries(targetFields)) {
            if (label.includes(fieldLabel)) {
              // For market maker portion, handle special case with links
              if (key === 'marketMakerPortion' && cells[1].querySelector('a')) {
                const makerLink = cells[1].querySelector('a');
                let textNode = '';
                Array.from(cells[1].childNodes).forEach(node => {
                  if (node.nodeType === Node.TEXT_NODE) {
                    textNode += node.textContent;
                  }
                });
                results[key] = {
                  text: textNode.trim(),
                  maker_name: makerLink?.textContent?.trim() || '',
                  maker_url: makerLink?.href || ''
                };
              } else {
                // Normal case - just get the text
                results[key] = cells[cells.length - 1].textContent.trim();
              }
              break;
            }
          }
        }
      });
      
      return results;
    });
    
    // Get IPO status (open, closed, upcoming)
    let status = 'unknown';
    try {
      const statusText = await page.$eval('.text-navy, .text-success, .text-info, .text-danger', 
        el => el.textContent.trim()).catch(() => null);
      
      if (statusText) {
        if (statusText.toLowerCase().includes('open')) status = 'open';
        else if (statusText.toLowerCase().includes('closed')) status = 'closed';
        else if (statusText.toLowerCase().includes('upcoming')) status = 'upcoming';
      }
    } catch (err) {
      console.log('Could not determine IPO status');
    }
    
    const result = {
      ipoName,
      logoUrl,
      status,
      url,
      scrapedAt: new Date().toISOString(),
      ...details
    };
    
    return result;
    
  } catch (error) {
    console.error(`Error fetching IPO basic info: ${error.message}`);
    return { 
      error: true, 
      message: error.message,
      url,
      scrapedAt: new Date().toISOString()
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Function to save result to JSON file
function saveToJsonFile(data, filename) {
  const outputDir = path.join(__dirname, '..', 'data');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Data saved to ${filepath}`);
}

// Run the function if this script is executed directly
if (require.main === module) {
  const urls = process.argv.slice(2);
  
  if (urls.length === 0) {
    console.log('Please provide one or more URLs as arguments');
    console.log('Example: node fetchIpoBasicInfo.js https://www.chittorgarh.com/ipo/emcure-pharma-ipo/1545/');
    process.exit(1);
  }
  
  // Process each URL
  (async () => {
    for (const url of urls) {
      const result = await fetchIpoBasicInfo(url);
      
      // Generate filename from URL or IPO name
      const ipoNameForFile = result.ipoName 
        ? result.ipoName.toLowerCase().replace(/\s+/g, '_')
        : `ipo_${Date.now()}`;
      
      saveToJsonFile(result, `${ipoNameForFile}_basic_info.json`);
    }
  })();
}

module.exports = { fetchIpoBasicInfo }; 