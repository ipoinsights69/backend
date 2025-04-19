/**
 * Enhanced Browser Helper Module
 * Advanced anti-detection with optional proxy and human-like behavior
 */

// Try to load the enhanced puppeteer setup
let puppeteer;
let puppeteerExtra;
let StealthPlugin;
let AnonymizeUAPlugin;
let randomUserAgent;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try {
  // Load puppeteer-extra and plugins
  puppeteerExtra = require('puppeteer-extra');
  StealthPlugin = require('puppeteer-extra-plugin-stealth');
  AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');
  randomUserAgent = require('random-useragent');
  
  // Regular puppeteer as fallback
  puppeteer = require('puppeteer');
  
  // Apply plugins
  puppeteerExtra.use(StealthPlugin());
  
  // Configure anonymize plugin with custom options
  const anonymizePlugin = AnonymizeUAPlugin({
    stripHeadless: false,
    makeWindows: true,
    customFn: (ua) => ua.replace('HeadlessChrome', 'Chrome')
  });
  puppeteerExtra.use(anonymizePlugin);
  
  console.log('✅ Puppeteer-extra with stealth and plugins loaded successfully');
} catch (e) {
  console.error('⚠️ Error loading puppeteer-extra:', e.message);
  console.error('Falling back to regular puppeteer. Anti-detection capabilities will be limited.');
  
  try {
    puppeteer = require('puppeteer');
    console.log('✅ Regular puppeteer loaded as fallback');
  } catch (fallbackError) {
    console.error('❌ Critical error: Both puppeteer-extra and puppeteer failed to load:', fallbackError.message);
    console.error('Please run: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth puppeteer-extra-plugin-anonymize-ua random-useragent');
    process.exit(1);
  }
}

// Array of realistic user agents to rotate through
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
];

// Get a random user agent - uses both hardcoded and library-based options
const getRandomUserAgent = () => {
  try {
    // 50% chance to use the random-useragent library (more diverse but sometimes outdated)
    if (randomUserAgent && Math.random() > 0.5) {
      const ua = randomUserAgent.getRandom(ua => {
        return ua.browserName === 'Chrome' && parseFloat(ua.browserVersion) >= 100;
      });
      if (ua) return ua;
    }
  } catch (e) {
    console.warn('⚠️ random-useragent generation failed, using hardcoded list');
  }
  
  // Fallback to hardcoded list
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

// Get browser-like headers to avoid detection
const getBrowserLikeHeaders = (referer) => {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': referer || 'https://www.google.com/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1'
  };
};

// Pre-configured proxy settings
const PROXY_SETTINGS = [
  {
    server: 'geo.iproyal.com:12321',
    username: 'T3SdWfWt2L3ZbveZ',
    password: 'O3FRVz4QjAAvBgYw'
  }
  // Add more proxy configurations if you have multiple
  // Example:
  // {
  //   server: 'proxy2.example.com:8080',
  //   username: 'user2',
  //   password: 'pass2'
  // }
];

// Get a random proxy from the available options
const getRandomProxy = () => {
  return PROXY_SETTINGS[Math.floor(Math.random() * PROXY_SETTINGS.length)];
};

// Track used IPs to avoid reuse in the same session
const usedProxyIPs = new Set();

/**
 * Creates a unique temporary user data directory
 * @returns {string} - Path to the unique user data directory
 */
function createTempUserDataDir() {
  const baseTempDir = path.join(__dirname, '..', 'temp_user_data');
  
  // Create base temp directory if it doesn't exist
  if (!fs.existsSync(baseTempDir)) {
    fs.mkdirSync(baseTempDir, { recursive: true });
  }
  
  // Generate a unique subfolder name using timestamp and random string
  const uniqueId = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const tempUserDataDir = path.join(baseTempDir, uniqueId);
  
  // Create the unique directory
  fs.mkdirSync(tempUserDataDir, { recursive: true });
  
  console.log(`📁 Created temporary user data directory: ${tempUserDataDir}`);
  return tempUserDataDir;
}

/**
 * Clean up a temporary user data directory
 * @param {string} dirPath - Path to the user data directory to clean up
 */
function cleanupTempUserDataDir(dirPath) {
  if (!dirPath || !dirPath.includes('temp_user_data')) {
    console.warn('⚠️ Refusing to delete directory that does not appear to be a temp user data dir:', dirPath);
    return;
  }
  
  try {
    if (fs.existsSync(dirPath)) {
      console.log(`🧹 Removing temporary user data directory: ${dirPath}`);
      
      // Simple file deletion - for production use, consider a more robust recursive deletion
      // This is a simplified version that works for many cases but may not handle all edge cases
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`⚠️ Error cleaning up user data directory ${dirPath}:`, error.message);
  }
}

/**
 * Performs randomized, human-like scrolling on the page
 * @param {import('puppeteer').Page} page - The page to scroll on
 * @param {number} minScrolls - Minimum number of scroll actions
 * @param {number} maxScrolls - Maximum number of scroll actions
 */
async function performHumanLikeScrolling(page, minScrolls = 3, maxScrolls = 8) {
  const scrolls = Math.floor(Math.random() * (maxScrolls - minScrolls + 1)) + minScrolls;
  console.log(`🔄 Performing ${scrolls} human-like scrolls`);
  
  for (let i = 0; i < scrolls; i++) {
    const scrollAmount = Math.floor(Math.random() * 800) + 100; // Random scroll between 100-900px
    await page.evaluate((amount) => {
      window.scrollBy({
        top: amount,
        behavior: 'smooth'
      });
    }, scrollAmount);
    
    // Random pause between scrolls (300-1200ms)
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 900) + 300));
  }
}

/**
 * Performs random mouse movements to appear more human-like
 * @param {import('puppeteer').Page} page - The page to move mouse on
 * @param {number} movements - Number of movements to make
 */
async function performRandomMouseMovements(page, movements = 5) {
  console.log(`🖱️ Performing ${movements} random mouse movements`);
  
  for (let i = 0; i < movements; i++) {
    const x = Math.floor(Math.random() * 800);
    const y = Math.floor(Math.random() * 600);
    
    await page.mouse.move(x, y);
    
    // Random pause between movements (100-500ms)
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 400) + 100));
  }
}

/**
 * Patches browser fingerprints to avoid detection
 * @param {import('puppeteer').Page} page - The page to patch
 */
async function patchBrowserFingerprints(page) {
  console.log('🔧 Patching browser fingerprints');
  
  await page.evaluateOnNewDocument(() => {
    // Override navigator properties
    const originalNavigator = window.navigator;
    const navigatorProxy = new Proxy(originalNavigator, {
      has: (target, key) => key in target,
      get: (target, key) => {
        switch (key) {
          case 'webdriver':
            return false;
          case 'plugins':
            // Create fake plugins array
            return {
              length: 3,
              refresh: () => {},
              item: (i) => { 
                return {
                  name: ['Chrome PDF Plugin', 'Chrome PDF Viewer', 'Native Client'][i],
                  description: ['Portable Document Format', 'Chrome PDF Viewer', 'Native Client Executable'][i],
                  filename: ['internal-pdf-viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', 'internal-nacl-plugin'][i],
                  length: 1
                };
              },
              namedItem: (name) => { return null; },
              [Symbol.iterator]: function* () {
                yield {name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer'};
                yield {name: 'Chrome PDF Viewer', description: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai'};
                yield {name: 'Native Client', description: 'Native Client Executable', filename: 'internal-nacl-plugin'};
              }
            };
          case 'languages':
            return ['en-US', 'en', 'es'];
          case 'mimeTypes':
            return {
              length: 2,
              item: (i) => ({
                type: ['application/pdf', 'application/x-google-chrome-pdf'][i],
                description: ['Portable Document Format', 'Portable Document Format'][i],
                suffixes: ['pdf', 'pdf'][i],
              }),
              [Symbol.iterator]: function* () {
                yield {type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf'};
                yield {type: 'application/x-google-chrome-pdf', description: 'Portable Document Format', suffixes: 'pdf'};
              }
            };
          case 'hardwareConcurrency':
            return 8;
          case 'deviceMemory':
            return 8;
          case 'platform':
            return 'Win32';
          default:
            return target[key];
        }
      }
    });
    
    // Override navigator
    window.navigator = navigatorProxy;
    
    // Mock chrome browser environment
    if (!window.chrome) {
      window.chrome = {
        runtime: {
          connect: function() { return {}; },
          sendMessage: function() { return {}; }
        }
      };
    }
    
    // Override WebGL renderer
    const getParameterProxy = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      // UNMASKED_VENDOR_WEBGL
      if (parameter === 37445) {
        return 'Google Inc. (NVIDIA)';
      }
      // UNMASKED_RENDERER_WEBGL
      if (parameter === 37446) {
        return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0)';
      }
      return getParameterProxy.call(this, parameter);
    };
    
    // Add modern browser features
    window.Notification = window.Notification || function() {};
    window.SharedWorker = window.SharedWorker || function() {};
    
    // Override document.createElement to handle iframe contentWindow access
    const originalCreateElement = document.createElement;
    document.createElement = function(...args) {
      const element = originalCreateElement.apply(this, args);
      if (args[0].toLowerCase() === 'iframe') {
        const contentWindowProxy = new Proxy({}, {
          get: function(target, key) {
            // Simulate empty iframe
            if (key === 'document') {
              return { body: { appendChild: function() {} } };
            }
            return undefined;
          }
        });
        
        Object.defineProperty(element, 'contentWindow', {
          get: function() { return contentWindowProxy; }
        });
      }
      return element;
    };
    
    // Override permissions behavior
    const originalQuery = Permissions.prototype.query;
    Permissions.prototype.query = function(queryObj) {
      return Promise.resolve({
        state: 'granted',
        addEventListener: function() {}
      });
    };
  });
  
  console.log('✅ Browser fingerprints patched');
}

/**
 * Waits for JavaScript challenge to resolve
 * @param {import('puppeteer').Page} page - The page to wait on
 * @param {number} timeout - Maximum time to wait in ms
 */
async function waitForJsChallenge(page, timeout = 30000) {
  console.log('⏳ Waiting for JavaScript challenges to resolve...');
  
  const challengeSelectors = [
    // Cloudflare selectors
    '#cf-spinner', '.cf-browser-verification', '#challenge-form', '#cf-please-wait',
    // Imperva/Incapsula
    '#incapsula-block', '.incapsula-block',
    // DataDome
    '#datadome-puzzle', '.datadome-challenge',
    // Akamai
    '#ak-spinner', '#akam-captcha'
  ];
  
  const startTime = Date.now();
  
  // First wait for any challenge element to appear
  try {
    for (const selector of challengeSelectors) {
      const element = await page.$(selector);
      if (element) {
        console.log(`🛡️ Detected JS challenge: ${selector}`);
        break;
      }
    }
  } catch (e) {
    console.log('No challenge elements found initially, continuing...');
  }
  
  // Then wait for it to disappear (challenge resolved)
  let resolved = false;
  while (Date.now() - startTime < timeout) {
    let challengeActive = false;
    
    try {
      for (const selector of challengeSelectors) {
        const element = await page.$(selector);
        if (element) {
          challengeActive = true;
          console.log(`⏳ Still waiting on JS challenge: ${selector}`);
          await new Promise(r => setTimeout(r, 1000)); // Check again in 1 second
          break;
        }
      }
    } catch (e) {
      // If we can't check, assume no challenge (page might have navigated)
      challengeActive = false;
    }
    
    if (!challengeActive) {
      resolved = true;
      break;
    }
  }
  
  // Additional checks for successful page load
  try {
    await page.waitForFunction(() => {
      return (
        document.readyState === 'complete' && 
        !document.title.includes('Attention Required') &&
        !document.title.includes('DDOS') &&
        !document.title.includes('DDoS') &&
        !document.title.includes('Robot') &&
        !document.title.includes('Captcha')
      );
    }, { timeout: 5000 });
  } catch (e) {
    console.warn('⚠️ Page may not be fully loaded or could still be showing protection:', e.message);
  }
  
  const timeSpent = (Date.now() - startTime) / 1000;
  if (resolved) {
    console.log(`✅ Challenge resolved in ${timeSpent.toFixed(1)} seconds`);
  } else {
    console.warn(`⚠️ Challenge timeout after ${timeSpent.toFixed(1)} seconds`);
  }
  
  return resolved;
}

/**
 * Gets the current public IP address to verify proxy connection
 * @param {import('puppeteer').Page} page - The Puppeteer page instance
 * @returns {Promise<string>} - The public IP address
 */
async function getPublicIP(page) {
  try {
    // Use a mix of IP detection services to avoid blocks
    const ipServices = [
      'https://api.ipify.org/?format=json',
      'https://ifconfig.me/all.json',
      'https://ip.seeip.org/jsonip'
    ];
    
    // Try each service in random order
    const shuffledServices = [...ipServices].sort(() => Math.random() - 0.5);
    
    for (const service of shuffledServices) {
      try {
        console.log(`🔍 Checking IP using: ${service}`);
        await page.goto(service, {
          waitUntil: 'networkidle2',
          timeout: 15000
        });
        
        // Extract the IP based on the response format
        const ip = await page.evaluate(() => {
          try {
            const content = document.body.textContent;
            const json = JSON.parse(content);
            return json.ip || json.IP || json.query;
          } catch (e) {
            // If not JSON, try to extract directly
            const match = document.body.textContent.match(/\d+\.\d+\.\d+\.\d+/);
            return match ? match[0] : 'Unable to parse IP';
          }
        });
        
        if (ip && /\d+\.\d+\.\d+\.\d+/.test(ip)) {
          return ip;
        }
        
        console.log(`⚠️ Invalid IP format from ${service}, trying next service...`);
      } catch (serviceError) {
        console.warn(`⚠️ Failed to get IP from ${service}:`, serviceError.message);
        // Continue to next service
      }
    }
    
    throw new Error('All IP detection services failed');
  } catch (error) {
    console.error('❌ Error detecting public IP:', error.message);
    return 'IP detection failed';
  }
}

/**
 * Creates an enhanced browser session using puppeteer-extra with stealth plugin
 * Proxy usage is optional when using other anti-detection methods
 * 
 * @param {string} url - The URL to navigate to
 * @param {object} options - Options for the session
 * @param {boolean} options.useProxy - Whether to use a proxy (default: false)
 * @param {object} options.proxy - Optional custom proxy configuration (used only if useProxy is true)
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.timeout - Page load timeout in ms (default: 30000)
 * @param {boolean} options.humanBehavior - Whether to simulate human-like behavior (default: true)
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page, proxyIP: string}>}
 */
async function launchBrowser(url, options = {}) {
  // Decide whether to use a proxy based on options
  const useProxy = options.useProxy === true;
  const proxy = useProxy ? (options.proxy || getRandomProxy()) : null;
  
  const {
    maxRetries = 3,
    timeout = 30000,
    humanBehavior = true
  } = options;

  let retryCount = 0;
  let browser = null;
  let page = null;
  let success = false;
  let proxyIP = null;
  let tempUserDataDir = null;

  console.log(`🚀 Creating enhanced browser session for ${url}`);
  if (useProxy) {
    console.log(`🔒 Using proxy server: ${proxy.server}`);
  } else {
    console.log(`🔓 Running without proxy (direct connection)`);
  }
  
  while (retryCount < maxRetries && !success) {
    try {
      // Close previous browser instance if it exists
      if (browser) {
        await browser.close();
        browser = null;
        page = null;
      }
      
      // Clean up previous temp directory if it exists
      if (tempUserDataDir) {
        cleanupTempUserDataDir(tempUserDataDir);
        tempUserDataDir = null;
      }
      
      // Create a new unique user data directory for this session
      tempUserDataDir = createTempUserDataDir();

      // Configure browser launch args
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ];
      
      // Add proxy settings if proxy is being used
      if (useProxy && proxy) {
        launchArgs.push(`--proxy-server=${proxy.server}`);
      }

      // Add any custom args if provided
      if (options.args && Array.isArray(options.args)) {
        launchArgs.push(...options.args);
      }

      console.log(`🔄 Attempt ${retryCount + 1}/${maxRetries}`);
      
      // Choose user agent early to configure both puppeteer and manual settings consistently
      const userAgent = getRandomUserAgent();
      
      // Launch browser with puppeteer-extra if available, fallback to regular puppeteer
      if (puppeteerExtra) {
        browser = await puppeteerExtra.launch({
          headless: false,
          args: launchArgs,
          ignoreHTTPSErrors: true,
          defaultViewport: { width: 1920, height: 1080 },
          userDataDir: tempUserDataDir, // Use unique temp directory for each session
        });
      } else {
        browser = await puppeteer.launch({
          headless: false,
          args: launchArgs,
          ignoreHTTPSErrors: true,
          defaultViewport: { width: 1920, height: 1080 },
          userDataDir: tempUserDataDir, // Use unique temp directory for each session
        });
      }

      // Create new page with enhanced fingerprint protection
      page = await browser.newPage();
      
      // Set consistent user agent
      await page.setUserAgent(userAgent);
      
      // Set proxy authentication if using proxy
      if (useProxy && proxy && proxy.username && proxy.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password
        });
      }
      
      // Apply custom patches to avoid fingerprinting
      await patchBrowserFingerprints(page);
      
      // Set extra headers to look like a real browser
      await page.setExtraHTTPHeaders(getBrowserLikeHeaders(url));
      
      // Set commonly expected cookies
      await page.setCookie({
        name: 'visited',
        value: 'true',
        domain: new URL(url).hostname,
        path: '/',
      }, {
        name: 'sessionid',
        value: Math.random().toString(36).substring(2),
        domain: new URL(url).hostname,
        path: '/',
      });
      
      // Set webdriver flag explicitly to false
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      // Mimic real browser window history by adding a Google referrer
      await page.evaluateOnNewDocument(() => {
        window.history.pushState({}, '', 'https://www.google.com/search?q=stock+market+ipo');
        window.history.pushState({}, '', window.location.href);
      });
      
      // Get the public IP to verify connection if using proxy
      if (useProxy) {
        proxyIP = await getPublicIP(page);
        
        // Skip if we've already used this IP in the same session
        if (usedProxyIPs.has(proxyIP) && proxyIP !== 'IP detection failed') {
          console.warn(`⚠️ Proxy IP ${proxyIP} was already used, trying again with new proxy`);
          await browser.close();
          cleanupTempUserDataDir(tempUserDataDir);
          tempUserDataDir = null;
          
          // Get a different proxy on the next try
          const currentProxy = proxy;
          while (proxy === currentProxy) {
            proxy = getRandomProxy();
          }
          continue;
        }
        
        console.log(`✅ Connected via proxy IP: ${proxyIP}`);
        usedProxyIPs.add(proxyIP);
      } else {
        // For direct connections, just set a placeholder
        proxyIP = 'direct-connection';
      }
      
      // Navigate to the URL
      console.log(`🌐 Navigating to ${url}`);
      const response = await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: timeout
      });
      
      // Wait for any JS challenges to resolve
      await waitForJsChallenge(page, 30000);
      
      // Add human-like behavior if enabled
      if (humanBehavior) {
        // Random delay to simulate page reading (1-3 seconds)
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));
        
        // Perform random mouse movements
        await performRandomMouseMovements(page);
        
        // Scroll like a human would
        await performHumanLikeScrolling(page);
      }

      // Check for 403 status
      if (response && response.status() === 403) {
        console.warn(`⚠️ Received 403 Forbidden response on attempt ${retryCount + 1}`);
        retryCount++;
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      // Check if page is accessible by testing for common block indicators
      const pageContent = await page.content();
      if (pageContent.includes('Access Denied') || 
          pageContent.includes('403 Forbidden') || 
          pageContent.includes('captcha') ||
          pageContent.includes('Captcha') ||
          pageContent.includes('DDOS') ||
          pageContent.includes('DDoS') ||
          pageContent.includes('robot') ||
          pageContent.includes('Robot Check')) {
        console.warn(`⚠️ Page shows access restrictions on attempt ${retryCount + 1}`);
        retryCount++;
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      // If we got here, we succeeded
      console.log(`✅ Successfully accessed ${url}${useProxy ? ` with proxy IP: ${proxyIP}` : ''}`);
      success = true;
    } catch (error) {
      console.error(`❌ Error on attempt ${retryCount + 1}:`, error.message);
      retryCount++;
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Close browser on error
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error(`❌ Error closing browser: ${closeError.message}`);
        }
        browser = null;
        page = null;
      }
      
      // Clean up temp directory on error
      if (tempUserDataDir) {
        cleanupTempUserDataDir(tempUserDataDir);
        tempUserDataDir = null;
      }
    }
  }

  if (!success) {
    // Clean up any remaining temp directory
    if (tempUserDataDir) {
      cleanupTempUserDataDir(tempUserDataDir);
    }
    throw new Error(`❌ Failed to access ${url} after ${maxRetries} attempts`);
  }
  
  // Add cleanup function to browser object
  browser._cleanup = () => {
    if (tempUserDataDir) {
      cleanupTempUserDataDir(tempUserDataDir);
    }
  };

  // Override browser.close() to also clean up the temp directory
  const originalClose = browser.close.bind(browser);
  browser.close = async () => {
    const result = await originalClose();
    if (tempUserDataDir) {
      cleanupTempUserDataDir(tempUserDataDir);
    }
    return result;
  };

  return { browser, page, proxyIP };
}

/**
 * Creates a browser session - legacy function name for backward compatibility
 * @param {string} url - The URL to navigate to
 * @param {object} options - Options for the browser session
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page, proxyIP: string}>}
 */
async function createBrowserSession(url, options = {}) {
  // For backward compatibility, the legacy function defaults to using a proxy
  return launchBrowser(url, { ...options, useProxy: true });
}

// Export functions
module.exports = { 
  launchBrowser,
  createBrowserSession,
  getPublicIP,
  performHumanLikeScrolling,
  performRandomMouseMovements,
  waitForJsChallenge
}; 