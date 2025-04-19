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
 * Parse date string from various formats
 * @param {string} dateStr - Date string to parse
 * @returns {string|null} - Formatted date string or null
 */
function parseDateString(dateStr) {
  if (!dateStr || dateStr.toLowerCase().includes('na') || dateStr === '-') {
    return null;
  }
  
  try {
    // Clean the date string
    const cleaned = dateStr.trim().replace(/\s+/g, ' ');
    return cleaned;
  } catch (error) {
    console.warn(`Failed to parse date: ${dateStr}`);
    return null;
  }
}

/**
 * Get headers that mimic a real browser to avoid 403 errors
 * @returns {Object} - Headers object
 */
function getBrowserLikeHeaders() {
  // Generate a random user agent from the list for more variety
  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0'
  ];
  
  const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  
  return {
    'User-Agent': randomUserAgent,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.chittorgarh.com/ipo/infonative-solutions-ipo/2200/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://www.chittorgarh.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'DNT': '1'
  };
}

/**
 * Fetch IPO listings for a specific year
 * @param {number} year - Year to fetch IPO listings for
 * @param {boolean} force - Force scrape even for future years
 * @returns {Promise<Array>} - Array of IPO listings
 */
const fetchIpoListings = async (year, force = false) => {
  // Validate year with option to force future years
  const currentYear = new Date().getFullYear();
  if (!year || year < 2000) {
    throw new Error(`Invalid year: ${year}. Year must be 2000 or later`);
  }
  
  // Check future years
  if (year > currentYear + 1 && !force) {
    throw new Error(`Year ${year} is too far in the future. Use force mode to override this check.`);
  }

  console.log(`Fetching IPO listings for year ${year}${force ? ' (force mode)' : ''}...`);

  let browser;
  let page;
  const MAX_RETRIES = 3;
  const INITIAL_TIMEOUT = 60000; // 60 seconds
  const REFERRER_URL = 'https://www.chittorgarh.com/ipo/infonative-solutions-ipo/2200/';
  const apiUrl = `https://webnodejs.chittorgarh.com/cloud/report/data-read/82/1/3/${year}/2024-25/0/0`;

  try {
    console.log(`Attempting to launch browser for API: ${apiUrl}`);
    const browserLaunchResult = await launchBrowser(REFERRER_URL, {
        timeout: INITIAL_TIMEOUT,
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
        ]
    });
    browser = browserLaunchResult.browser;
    page = browserLaunchResult.page;
    
    // Add custom headers to mimic real browser behavior
    await page.setExtraHTTPHeaders(getBrowserLikeHeaders());
    
    // Setup cookies (often helps with sites checking for cookies)
    await page.setCookie({
      name: 'visited',
      value: 'true',
      domain: 'chittorgarh.com',
      path: '/',
    }, {
      name: 'sessionvisit',
      value: Date.now().toString(),
      domain: 'chittorgarh.com',
      path: '/',
    });

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

    // Visit the referrer page first and stay there a bit to look like a real user
    console.log(`First visiting referrer URL: ${REFERRER_URL} to establish cookies and session`);
    await page.goto(REFERRER_URL, { 
      waitUntil: 'networkidle2',
      timeout: INITIAL_TIMEOUT 
    });
    
    // Scroll down the page a bit to simulate real user behavior
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });

    console.log('Waiting before API navigation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Setup the XHR/fetch handler to intercept the API response
    await page.evaluateOnNewDocument(() => {
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        console.log('Fetch request:', args[0]);
        const response = await originalFetch(...args);
        return response;
      };
    });
    
    console.log(`Navigating to API URL: ${apiUrl}`);
    let navigationSuccess = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Try both methods:
        // 1. Direct navigation (uses the established proxy)
        const response = await page.goto(apiUrl, {
          waitUntil: 'networkidle0',
          timeout: INITIAL_TIMEOUT * attempt,
          referer: REFERRER_URL
        });
        
        // Get the current page cookies
        const cookies = await page.cookies();
        console.log(`Cookies count: ${cookies.length}`);
        
        if (!response || !response.ok()) {
            const status = response ? response.status() : 'unknown';
            console.warn(`API navigation attempt ${attempt} resulted in status: ${status}`);
            
            // If it's a 403, try a different approach on the next iteration
            if (status === 403) {
                // Wait longer between retries for 403 errors
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt)); 
                
                // On second attempt, try the fetch call method instead
                if (attempt === 2) {
                    console.log("Trying fetch method approach instead of direct navigation");
                    // Try to fetch the URL using the page's fetch
                    try {
                        const fetchResult = await page.evaluate(async (url) => {
                            const response = await fetch(url, {
                                method: 'GET',
                                headers: {
                                    'Accept': 'application/json',
                                    'Referer': 'https://www.chittorgarh.com/ipo/infonative-solutions-ipo/2200/'
                                },
                                credentials: 'include'
                            });
                            
                            if (!response.ok) {
                                return { 
                                    error: true, 
                                    status: response.status, 
                                    statusText: response.statusText 
                                };
                            }
                            
                            return await response.text();
                        }, apiUrl);
                        
                        if (fetchResult && !fetchResult.error) {
                            console.log('Successfully fetched API response using fetch method');
                            try {
                                apiResponse = JSON.parse(fetchResult);
                                navigationSuccess = true;
                                break;
                            } catch (e) {
                                console.error('Error parsing fetch result:', e.message);
                            }
                        } else {
                            console.error('Fetch method failed:', fetchResult?.status || 'unknown error');
                        }
                    } catch (fetchError) {
                        console.error('Error during fetch evaluation:', fetchError.message);
                    }
                }
                
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