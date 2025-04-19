/**
 * Manual Scraper Utility
 * A simplified scraping solution with robust anti-detection features
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// Constants
const MIN_DELAY = 3000; // Minimum delay between requests (3 seconds)
const MAX_DELAY = 10000; // Maximum delay between requests (10 seconds)
const MAX_RETRIES = 5; // Maximum retry attempts

// Array of realistic user agents to rotate through
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0'
];

// Random referring sites
const REFERRERS = [
  'https://www.google.com/',
  'https://www.bing.com/',
  'https://search.yahoo.com/',
  'https://duckduckgo.com/',
  'https://www.moneycontrol.com/',
  'https://economictimes.indiatimes.com/',
  'https://www.nseindia.com/',
  'https://www.bseindia.com/'
];

// Common domains to use as cookies
const COOKIE_DOMAINS = [
  'www.chittorgarh.com',
  'chittorgarh.com'
];

/**
 * Create a random delay between requests to avoid rate limiting
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {Promise<void>}
 */
const randomDelay = async (min = MIN_DELAY, max = MAX_DELAY) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

/**
 * Get a random user agent from the array
 * @returns {string} - Random user agent string
 */
const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

/**
 * Get a random referrer
 * @returns {string} - Random referrer URL
 */
const getRandomReferrer = () => {
  return REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
};

/**
 * Generate a random cookie with reasonable values
 * @returns {string} - Cookie string
 */
const generateRandomCookies = () => {
  const domain = COOKIE_DOMAINS[Math.floor(Math.random() * COOKIE_DOMAINS.length)];
  const visitorId = Math.random().toString(36).substring(2, 15);
  const sessionId = Math.random().toString(36).substring(2, 15);
  
  return [
    `visitor_id=${visitorId}; Domain=${domain}; Path=/; Secure`,
    `session=${sessionId}; Domain=${domain}; Path=/; Secure`,
    `last_visit=${new Date().toISOString()}; Domain=${domain}; Path=/; Secure`,
    `has_js=1; Domain=${domain}; Path=/; Secure`
  ].join('; ');
};

/**
 * Makes a request with anti-detection measures
 * @param {string} url - URL to fetch
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - HTML content
 */
const fetchWithAntiDetection = async (url, options = {}) => {
  const { retryCount = 0, customHeaders = {} } = options;
  
  // Create custom headers to avoid detection
  const userAgent = getRandomUserAgent();
  const referrer = getRandomReferrer();
  const cookies = generateRandomCookies();
  
  // Basic exponential backoff for retries
  const retryDelay = retryCount > 0 ? Math.min(MAX_DELAY, MIN_DELAY * Math.pow(2, retryCount)) : 0;
  if (retryDelay > 0) {
    console.log(`Retry ${retryCount} - Waiting ${retryDelay}ms before next attempt`);
    await randomDelay(retryDelay, retryDelay + 3000);
  }
  
  try {
    console.log(`Fetching ${url} with user agent: ${userAgent.substring(0, 30)}...`);

    // HTTPS Agent with custom settings to mimic a browser
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // Accept self-signed certificates
      keepAlive: true,
      timeout: 60000
    });
    
    // Request with axios
    const response = await axios({
      method: 'get',
      url: url,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Referer': referrer,
        'Cookie': cookies,
        'Sec-Ch-Ua': '"Google Chrome";v="119", "Not_A Brand";v="8"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'DNT': '1',
        ...customHeaders
      },
      httpsAgent,
      timeout: 30000,
      validateStatus: status => status >= 200 && status < 500,
    });

    // Handle redirects and status codes
    if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      if (response.headers.location) {
        console.log(`Following redirect to ${response.headers.location}`);
        return fetchWithAntiDetection(response.headers.location, { 
          retryCount, 
          customHeaders: { 
            ...customHeaders, 
            'Referer': url 
          } 
        });
      }
    }
    
    // Check for successful response
    if (response.status === 200) {
      console.log(`Successfully fetched ${url} (${response.data.length} bytes)`);
      
      // Check if the response is a Cloudflare challenge or other anti-bot page
      if (
        response.data.includes('Just a moment') || 
        response.data.includes('Checking your browser') || 
        response.data.includes('Please Wait...') ||
        response.data.includes('DDoS protection') ||
        response.data.includes('Attention Required') ||
        response.data.includes('Bot detection')
      ) {
        console.warn('Detected anti-bot challenge in the response');
        
        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
          return fetchWithAntiDetection(url, { 
            retryCount: retryCount + 1,
            customHeaders 
          });
        } else {
          throw new Error('Max retries exceeded - still encountering anti-bot challenges');
        }
      }
      
      return response.data;
    }
    
    // Handle unsuccessful responses
    if (response.status === 403) {
      console.error('Access forbidden (403) - IP might be blocked or requires cookie authentication');
      
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying with different identity (${retryCount + 1}/${MAX_RETRIES})...`);
        // Wait longer between retries for 403 errors
        await randomDelay(retryDelay * 1.5, retryDelay * 2);
        return fetchWithAntiDetection(url, { 
          retryCount: retryCount + 1,
          customHeaders: {
            ...customHeaders,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          } 
        });
      }
    }
    
    if (response.status === 429) {
      console.error('Rate limited (429) - Too many requests');
      
      if (retryCount < MAX_RETRIES) {
        // Wait much longer for rate limit errors
        const rateDelay = retryDelay * 3;
        console.log(`Rate limited. Waiting ${rateDelay}ms before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await randomDelay(rateDelay, rateDelay * 1.5);
        return fetchWithAntiDetection(url, { 
          retryCount: retryCount + 1,
          customHeaders 
        });
      }
    }
    
    throw new Error(`Received status code ${response.status}`);
    
  } catch (error) {
    console.error(`Error fetching ${url}: ${error.message}`);
    
    if (error.response) {
      console.error(`Status: ${error.response.status}, Status Text: ${error.response.statusText}`);
    }
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
      return fetchWithAntiDetection(url, { 
        retryCount: retryCount + 1,
        customHeaders 
      });
    }
    
    throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries: ${error.message}`);
  }
};

/**
 * Parse IPO listings from HTML content
 * @param {string} html - HTML content
 * @param {number|string} year - Year of IPO listings
 * @returns {Array} - Array of IPO listings objects
 */
const parseIpoListings = (html, year) => {
  try {
    const $ = cheerio.load(html);
    const listings = [];
    
    // Find all tables that could contain IPO data
    const tables = $('table.table-bordered, table.table-striped, table.table');
    let ipoTable;
    
    // Find the IPO table by looking for specific column headers
    tables.each((i, table) => {
      const headers = $(table).find('th');
      if (headers.length >= 5) {
        let companyHeaderFound = false;
        let dateHeaderFound = false;
        
        headers.each((j, header) => {
          const headerText = $(header).text().trim().toLowerCase();
          if (headerText.includes('company')) companyHeaderFound = true;
          if (headerText.includes('date') || headerText.includes('open')) dateHeaderFound = true;
        });
        
        if (companyHeaderFound && dateHeaderFound) {
          ipoTable = table;
          return false; // Break the loop
        }
      }
    });
    
    if (!ipoTable) {
      console.warn('Could not find IPO listings table. Trying alternative approach...');
      
      // Look for divs or sections containing "IPO Calendar" or similar text
      const ipoSections = $('div:contains("IPO Calendar"), div:contains("IPO List"), div:contains("Upcoming IPOs")');
      
      if (ipoSections.length) {
        // Find the nearest table to these sections
        ipoSections.each((i, section) => {
          const nearbyTable = $(section).find('table').first();
          if (nearbyTable.length) {
            ipoTable = nearbyTable[0];
            return false; // Break the loop
          }
        });
      }
      
      if (!ipoTable) {
        throw new Error('Could not locate IPO table in the HTML');
      }
    }
    
    console.log('Found IPO table, extracting data...');
    
    // Extract rows from the table
    $(ipoTable).find('tr').each((idx, row) => {
      // Skip the header row
      if (idx === 0) return;
      
      const columns = $(row).find('td');
      if (columns.length < 5) return; // Skip rows with insufficient data
      
      try {
        // Extract company name and URL
        const companyCell = $(columns[0]);
        const companyLink = companyCell.find('a');
        const companyName = companyLink.length 
          ? companyLink.text().trim() 
          : companyCell.text().trim();
        const detailUrl = companyLink.length 
          ? companyLink.attr('href') 
          : null;
        
        // Skip if company name is empty
        if (!companyName || companyName.toLowerCase() === 'company') return;
        
        // Determine indices for other columns based on table structure
        // This handles variations in table layout
        const dateIndices = findColumnIndices($, columns, ['date', 'open', 'close', 'listing']);
        const priceIndices = findColumnIndices($, columns, ['price', 'issue', 'amount']);
        const lotIndex = findColumnIndex($, columns, ['lot', 'size']);
        const gainsIndex = findColumnIndex($, columns, ['gain', 'listing', 'premium']);
        
        // Extract data using the discovered indices
        const openingDate = dateIndices.open >= 0 
          ? $(columns[dateIndices.open]).text().trim() 
          : null;
        
        const closingDate = dateIndices.close >= 0 
          ? $(columns[dateIndices.close]).text().trim() 
          : null;
        
        const listingDate = dateIndices.listing >= 0 
          ? $(columns[dateIndices.listing]).text().trim() 
          : null;
        
        const issuePrice = priceIndices.price >= 0 
          ? $(columns[priceIndices.price]).text().trim() 
          : null;
        
        const issueSize = priceIndices.amount >= 0 
          ? $(columns[priceIndices.amount]).text().trim() 
          : null;
        
        const lotSize = lotIndex >= 0 
          ? $(columns[lotIndex]).text().trim().replace(/[^\d]/g, '') 
          : null;
        
        const listingGains = gainsIndex >= 0 
          ? $(columns[gainsIndex]).text().trim() 
          : null;
        
        // Create the listing object
        const listing = {
          company_name: companyName,
          detail_url: detailUrl 
            ? (detailUrl.startsWith('http') ? detailUrl : `https://www.chittorgarh.com${detailUrl}`) 
            : null,
          opening_date: openingDate,
          closing_date: closingDate,
          listing_date: listingDate,
          issue_price: issuePrice,
          issue_size: issueSize,
          lot_size: lotSize,
          listing_gains: listingGains,
          year: parseInt(year),
          _fetched_at: new Date().toISOString()
        };
        
        // Only add if we have at least the company name and one date
        if (companyName && (openingDate || closingDate || listingDate)) {
          listings.push(listing);
        }
        
      } catch (rowError) {
        console.error(`Error processing row: ${rowError.message}`);
      }
    });
    
    console.log(`Successfully extracted ${listings.length} IPO listings for year ${year}`);
    return listings;
    
  } catch (error) {
    console.error(`Error parsing IPO listings: ${error.message}`);
    return [];
  }
};

/**
 * Find the index of a column based on text content
 * @param {cheerio} $ - Cheerio instance
 * @param {Array} columns - Array of column elements
 * @param {Array} keywords - Keywords to look for
 * @returns {number} - Index of the matching column or -1
 */
const findColumnIndex = ($, columns, keywords) => {
  for (let i = 0; i < columns.length; i++) {
    const text = $(columns[i]).text().trim().toLowerCase();
    if (keywords.some(keyword => text.includes(keyword))) {
      return i;
    }
  }
  return -1;
};

/**
 * Find column indices for multiple properties
 * @param {cheerio} $ - Cheerio instance
 * @param {Array} columns - Array of column elements
 * @param {Array} types - Types of columns to find
 * @returns {Object} - Object with column indices
 */
const findColumnIndices = ($, columns, types) => {
  const indices = {};
  
  // Set up keyword mappings for different column types
  const keywordMap = {
    date: ['date'],
    open: ['open', 'start', 'from'],
    close: ['close', 'end', 'to'],
    listing: ['listing', 'listed'],
    price: ['price', 'band', 'range'],
    amount: ['amount', 'size', 'value']
  };
  
  // Find indices for all requested types
  types.forEach(type => {
    if (keywordMap[type]) {
      indices[type] = findColumnIndex($, columns, keywordMap[type]);
    }
  });
  
  return indices;
};

/**
 * Fetch IPO listings for a specific year
 * @param {number|string} year - Year to fetch
 * @returns {Promise<Array>} - Array of IPO listings
 */
const fetchIpoListingsForYear = async (year) => {
  try {
    console.log(`Fetching IPO listings for year ${year}...`);
    
    // URL to scrape
    const url = `https://www.chittorgarh.com/ipo/ipo-calendar-year-${year}/`;
    
    // Add a random delay before starting
    await randomDelay();
    
    // Fetch the page with anti-detection measures
    const html = await fetchWithAntiDetection(url);
    
    // Parse the HTML to extract IPO listings
    const listings = parseIpoListings(html, year);
    
    return listings;
  } catch (error) {
    console.error(`Error fetching IPO listings for year ${year}: ${error.message}`);
    return [];
  }
};

module.exports = {
  fetchIpoListingsForYear,
  fetchWithAntiDetection,
  randomDelay
}; 