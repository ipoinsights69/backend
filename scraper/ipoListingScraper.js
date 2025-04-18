const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

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
  const MAX_RETRIES = 3;
  const INITIAL_TIMEOUT = 60000; // 60 seconds
  
  try {
    const apiUrl = `https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/3/${year}/2024-25/0/0`;
    console.log(`Fetching IPO listings from API: ${apiUrl}`);
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled' // Try to hide automation
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set request interception
    await page.setRequestInterception(true);
    
    // Track API responses
    let apiResponse = null;
    
    // Handle requests
    page.on('request', request => {
      // Add headers to all requests
      const headers = {
        ...request.headers(),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.chittorgarh.com/',
      };
      
      // Continue the request with modified headers
      request.continue({ headers });
    });
    
    // Handle responses
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('webnodejs.chittorgarh.com/cloud/report/data-read')) {
        try {
          const text = await response.text();
          if (text && text.includes('reportTableData')) {
            apiResponse = JSON.parse(text);
            console.log('Successfully intercepted API response');
          }
        } catch (error) {
          console.error('Error parsing API response:', error.message);
        }
      }
    });
    
    // First visit the referrer page
    await page.goto('https://www.chittorgarh.com/ipo/mainboard-ipo-in-india/', {
      waitUntil: 'networkidle2',
      timeout: INITIAL_TIMEOUT
    });
    
    // Wait before making the API request
    console.log('Waiting before API navigation...');
    await new Promise(r => setTimeout(r, 5000)); // Use standard setTimeout
    
    // Now navigate to the API URL with retries
    console.log('Navigating to API URL...');
    let navigationSuccess = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await page.goto(apiUrl, {
          waitUntil: 'networkidle0', // Wait for network to be idle
          timeout: INITIAL_TIMEOUT * attempt // Increase timeout on each retry
        });
        navigationSuccess = true;
        console.log(`Successfully navigated to API URL on attempt ${attempt}`);
        break; // Exit loop on success
      } catch (error) {
        console.error(`Attempt ${attempt} failed: ${error.message}`);
        if (attempt === MAX_RETRIES) {
          throw new Error(`Failed to navigate to API URL after ${MAX_RETRIES} attempts: ${error.message}`);
        }
        // Wait before retrying
        await new Promise(r => setTimeout(r, 3000 * attempt)); // Use standard setTimeout
      }
    }
    
    // If we couldn't get the response from the intercepted request, try to parse page content
    if (!apiResponse) {
      console.log('API response not intercepted, trying to extract from page content...');
      const pageContent = await page.content();
      // Check if the page contains JSON
      if (pageContent.includes('"reportTableData"')) {
        try {
          // Extract JSON from the page (it's often in a <pre> tag or directly in the body)
          const jsonContent = await page.evaluate(() => {
            // Try different ways to find the JSON
            const preTag = document.querySelector('pre');
            if (preTag) return preTag.textContent;
            
            // If not in pre tag, try to get it from the body
            return document.body.textContent;
          });
          
          if (jsonContent) {
            // Find JSON by looking for opening and closing braces
            const jsonStart = jsonContent.indexOf('{');
            const jsonEnd = jsonContent.lastIndexOf('}') + 1;
            
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const jsonStr = jsonContent.substring(jsonStart, jsonEnd);
              apiResponse = JSON.parse(jsonStr);
              console.log('Extracted API response from page content');
            }
          }
        } catch (error) {
          console.error('Error extracting JSON from page content:', error.message);
        }
      }
    }
    
    // Process the API response
    if (apiResponse && apiResponse.reportTableData) {
      console.log(`Successfully extracted ${apiResponse.reportTableData.length} IPO listings from API`);
      
      // Process each IPO entry
      const listings = apiResponse.reportTableData.map(entry => {
        // Extract the URL and company name from the Company field
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
    return []; // Return empty array on failure
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

module.exports = {
  fetchIpoListings
};
