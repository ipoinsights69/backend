const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { launchBrowser } = require('../utils/browserHelper');

/**
 * Extracts URL from an HTML anchor tag
 * @param {string} htmlTag - HTML anchor tag
 * @returns {string|null} - Extracted URL or null
 */
function extractUrl(htmlTag) {
  const match = htmlTag.match(/href="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Extracts company name from an HTML anchor tag
 * @param {string} htmlTag - HTML anchor tag
 * @returns {string} - Extracted company name
 */
function extractCompanyName(htmlTag) {
  const match = htmlTag.match(/>([^<]+)<\/a>/);
  return match ? match[1].trim() : '';
}

/**
 * Get headers that mimic a real browser to avoid 403 errors
 * @returns {Object} - Headers object
 */
function getBrowserLikeHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.chittorgarh.com/ipo/mainboard-ipo-in-india/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'DNT': '1'
  };
}

/**
 * Fetch IPO listings directly from the API using Puppeteer
 * @param {number|string} year - The year to fetch
 * @returns {Promise<Array>} - Array of IPO listings
 */
async function fetchIpoListings(year) {
  let browser;
  let page;
  const MAX_RETRIES = 3;
  const INITIAL_TIMEOUT = 60000; // 60 seconds
  const REFERRER_URL = 'https://www.chittorgarh.com/ipo/mainboard-ipo-in-india/';
  const apiUrl = `https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/3/${year}/2024-25/0/0`;

  try {
    console.log(`Attempting to launch browser for API: ${apiUrl}`);
    const browserLaunchResult = await launchBrowser(REFERRER_URL, {
        timeout: INITIAL_TIMEOUT,
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
        ]
    });
    browser = browserLaunchResult.browser;
    page = browserLaunchResult.page;

    let apiResponse = null;
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('webnodejs.chittorgarh.com/cloud/report/data-read')) {
        try {
          const buffer = await response.buffer(); 
          const text = buffer.toString('utf-8');
          
          if (text && text.includes('reportTableData')) {
            apiResponse = JSON.parse(text);
            console.log('Successfully intercepted API response');
          }
        } catch (error) {
          console.error('Error parsing API response:', error.message);
        }
      }
    });

    console.log('Waiting before API navigation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`Navigating to API URL: ${apiUrl}`);
    let navigationSuccess = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await page.goto(apiUrl, {
          waitUntil: 'networkidle0',
          timeout: INITIAL_TIMEOUT * attempt
        });
        
        if (!response || !response.ok()) {
            const status = response ? response.status() : 'unknown';
            console.warn(`API navigation attempt ${attempt} resulted in status: ${status}`);
            if (status === 403 || status === 404 || status >= 500) {
                 throw new Error(`API returned non-OK status: ${status}`);
            }
        } else {
            navigationSuccess = true;
            console.log(`Successfully navigated to API URL on attempt ${attempt}`);
            break;
        }
      } catch (error) {
        console.error(`API navigation attempt ${attempt} failed: ${error.message}`);
        if (attempt === MAX_RETRIES) {
          throw new Error(`Failed to navigate to API URL after ${MAX_RETRIES} attempts: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt)); 
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (!apiResponse) {
      console.log('API response not intercepted, trying to extract from page content...');
      const pageContent = await page.content();
      if (pageContent.includes('"reportTableData"')) {
        try {
          const jsonContent = await page.evaluate(() => {
            const preTag = document.querySelector('pre');
            if (preTag) return preTag.textContent;
            
            return document.body.textContent;
          });
          
          if (jsonContent) {
            const jsonStart = jsonContent.indexOf('{');
            const jsonEnd = jsonContent.lastIndexOf('}') + 1;
            
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const jsonStr = jsonContent.substring(jsonStart, jsonEnd);
              try {
                  apiResponse = JSON.parse(jsonStr);
                  console.log('Extracted API response from page content');
              } catch (parseError) {
                  console.error('Failed to parse JSON extracted from page content:', parseError.message);
                  if (jsonContent.toLowerCase().includes('error') || jsonContent.toLowerCase().includes('forbidden')) {
                      console.error('Page content seems to be an error page.');
                  } else {
                     console.error('Raw content:', jsonContent.substring(0, 500));
                  }
              }
            }
          }
        } catch (error) {
          console.error('Error extracting JSON from page content:', error.message);
        }
      }
    }
    
    if (apiResponse && apiResponse.reportTableData) {
      console.log(`Successfully extracted ${apiResponse.reportTableData.length} IPO listings from API`);
      
      const listings = apiResponse.reportTableData.map(entry => {
        const url = extractUrl(entry.Company);
        const companyName = extractCompanyName(entry.Company);
        
        return {
          company_name: companyName,
          detail_url: url,
          opening_date: entry['Opening Date'] || null,
          closing_date: entry['Closing Date'] || null,
          listing_date: entry['Listing Date'] || null,
          issue_price: entry['Issue Price (Rs)'] || null,
          issue_amount: entry['Issue Amount (Rs.cr.)'] || null,
          listing_at: entry['Listing at'] || null,
          lead_manager: entry['Lead Manager'] || null,
          year: year,
          _fetched_at: new Date().toISOString()
        };
      });
      
      return listings;
    }
    
    throw new Error('Failed to get API response after navigation and content extraction');
    
  } catch (error) {
    console.error(`Error fetching IPO listings for year ${year}: ${error.message}`);
    console.error(error.stack);
    return [];
  } finally {
    if (browser) {
       try {
          await browser.close();
          console.log('Browser closed');
       } catch (closeError) {
           console.error(`Error closing browser: ${closeError.message}`);
       }
    }
  }
}

module.exports = {
  fetchIpoListings
};
