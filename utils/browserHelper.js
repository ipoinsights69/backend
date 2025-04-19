/**
 * Browser Helper Module
 * Handles browser launching and management with fallbacks for various configurations
 */

// Try to load dependencies with error handling
let puppeteer, StealthPlugin, connectRealBrowser;

try {
  // First try to import puppeteer from standard location
  puppeteer = require('puppeteer-extra');
  StealthPlugin = require('puppeteer-extra-plugin-stealth');
  connectRealBrowser = require('puppeteer-real-browser').connect;

  // Apply the stealth plugin with stronger settings
  const stealth = StealthPlugin();
  stealth.enabledEvasions.add('chrome.runtime');
  stealth.enabledEvasions.add('iframe.contentWindow');
  stealth.enabledEvasions.add('media.codecs');
  stealth.enabledEvasions.add('navigator.languages');
  stealth.enabledEvasions.add('navigator.permissions');
  stealth.enabledEvasions.add('sourceurl');
  puppeteer.use(stealth);
} catch (error) {
  console.warn(`Browser automation dependencies warning: ${error.message}`);
  console.warn('Will attempt fallbacks if browser launch is requested');
  
  // Set variables to null if imports fail
  if (!puppeteer) puppeteer = null;
  if (!StealthPlugin) StealthPlugin = null;
  if (!connectRealBrowser) connectRealBrowser = null;
}

// Attempt to load regular puppeteer as fallback
let regularPuppeteer;
try {
  regularPuppeteer = require('puppeteer');
} catch (e) {
  regularPuppeteer = null;
}

// Attempt to load puppeteer-core for real browser mode
let puppeteerCore;
try {
  puppeteerCore = require('puppeteer-core');
} catch (e) {
  puppeteerCore = null;
}

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-dev-shm-usage',
  '--disable-web-security',
  '--disable-infobars',
  '--disable-notifications',
  '--ignore-certificate-errors',
  '--window-size=1920,1080',
];

// Array of realistic user agents to rotate through
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
];

// Get a random user agent from the array
const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

// Default proxy configuration (used as fallback)
const DEFAULT_PROXY = {
  server: 'geo.iproyal.com:12321',
  username: 'T3SdWfWt2L3ZbveZ',
  password: 'O3FRVz4QjAAvBgYw'
};

// Add 2Captcha API key - uncomment and add your key to enable captcha solving
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || ''; // '1abc234def567890abcdef1234567890'

// Try to load 2captcha-solver for handling captchas
let TwoCaptchaSolver;
try {
  TwoCaptchaSolver = require('2captcha-ts');
} catch (error) {
  console.warn('2captcha-ts not available. Captcha solving will not work.');
  TwoCaptchaSolver = null;
}

/**
 * Checks if the current page is blocked by Cloudflare.
 * @param {import('puppeteer').Page} page - The Puppeteer page instance.
 * @returns {Promise<boolean>} - True if Cloudflare block is detected, false otherwise.
 */
async function isCloudflareBlocked(page) {
  try {
    const title = await page.title();
    const content = await page.content();

    // Common Cloudflare challenge titles
    if (title.includes('Just a moment...') || 
        title.includes('Checking your browser') || 
        title.includes('Attention Required') || 
        title.includes('Access denied')) {
      console.warn('Cloudflare challenge page detected by title.');
      return true;
    }

    // Cloudflare specific selectors/text
    if (content.includes('cf-challenge-running') || 
        content.includes('cf-spinner') || 
        content.includes('Verifying you are human') || 
        content.includes('Ray ID') || 
        content.includes('cf-error-code')) {
       console.warn('Cloudflare challenge page detected by content.');
       return true;
    }

    // Check for common Cloudflare and other anti-bot response status codes
    const response = page.mainFrame().url() && await page.goto(page.mainFrame().url(), { waitUntil: 'domcontentloaded' }); 
    if (response && [403, 503, 429, 520, 521, 522].includes(response.status())) {
        console.warn(`Anti-bot protection detected by status code: ${response.status()}`);
        return true;
    }

  } catch (error) {
    // Ignore errors during detection (e.g., page closed)
    console.error('Error during Cloudflare detection:', error.message);
  }
  return false;
}

/**
 * Adds random delays between actions to mimic human behavior
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 * @returns {Promise<void>}
 */
async function randomDelay(min = 500, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Launches a browser using regular puppeteer
 * @param {object} options - Launch options
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page, browserType: string}>}
 */
async function launchRegularPuppeteer(options) {
  const { 
    headless = 'new', 
    args = [], 
    timeout = 90000, 
    proxy = null 
  } = options;
  
  if (!regularPuppeteer) {
    throw new Error('Regular puppeteer is not available. Run: npm install puppeteer');
  }
  
  // Ensure we correctly interpret headless mode
  const headlessValue = headless === 'new' ? 'new' : 
                        headless === true ? 'new' : 
                        headless === false ? false : 'new';
  
  console.log(`Launching browser with regular puppeteer (headless: ${headlessValue === false ? 'false (non-headless)' : headlessValue})...`);
  
  const launchArgs = [...DEFAULT_ARGS, ...args];
  
  // Add proxy if specified
  if (proxy) {
    launchArgs.push(`--proxy-server=${proxy.server}`);
    console.log(`Using proxy: ${proxy.server}`);
  }
  
  // Ensure window size is set for non-headless mode
  if (headlessValue === false) {
    launchArgs.push('--window-size=1920,1080');
    launchArgs.push('--start-maximized');
  }
  
  const browser = await regularPuppeteer.launch({
    headless: headlessValue, 
    args: launchArgs,
    ignoreHTTPSErrors: true,
    defaultViewport: null // Use window viewport in non-headless mode
  });
  
  const page = await browser.newPage();
  
  // Set proxy authentication if needed
  if (proxy && proxy.username && proxy.password) {
    await page.authenticate({
      username: proxy.username,
      password: proxy.password
    });
  }
  
  const userAgent = getRandomUserAgent();
  console.log(`Using user agent: ${userAgent}`);
  await page.setUserAgent(userAgent);
  
  // Only set viewport in headless mode, otherwise use window size
  if (headlessValue !== false) {
    await page.setViewport({ width: 1920, height: 1080 });
  }
  
  // Set additional headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'DNT': '1'
  });
  
  // Mask WebDriver usage
  await page.evaluateOnNewDocument(() => {
    delete Object.getPrototypeOf(navigator).webdriver;
    
    // Overwrite the plugins property to use a custom getter
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        return [1, 2, 3, 4, 5].map(i => {
          return {
            name: `Plugin ${i}`,
            description: `Description ${i}`,
            filename: `plugin${i}.dll`
          };
        });
      }
    });

    // Overwrite the languages property
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'es'],
    });
  });
  
  return { browser, page, browserType: 'regular' };
}

/**
 * Launches a browser using puppeteer-core with Chrome (real browser mode)
 * @param {object} options - Launch options
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page, browserType: string}>}
 */
async function launchRealBrowser(options) {
  const { 
    headless = 'new', 
    args = [], 
    timeout = 90000, 
    proxy = null 
  } = options;
  
  if (!puppeteerCore && !connectRealBrowser) {
    throw new Error('Neither puppeteer-core nor puppeteer-real-browser is available');
  }
  
  // Ensure we correctly interpret headless mode
  const headlessValue = headless === 'new' ? 'new' : 
                        headless === true ? 'new' : 
                        headless === false ? false : 'new';
  
  console.log(`Launching browser in real browser mode (headless: ${headlessValue === false ? 'false (non-headless)' : headlessValue})...`);
  
  // First try puppeteer-real-browser if available
  if (connectRealBrowser) {
    try {
      const connectOptions = {
        headless: headlessValue,
        turnstile: true,
        args: [...DEFAULT_ARGS, ...args],
        connectOption: {
          defaultViewport: headlessValue !== false ? { width: 1920, height: 1080 } : null,
        },
      };
      
      // Add window size for non-headless mode
      if (headlessValue === false) {
        connectOptions.args.push('--window-size=1920,1080');
        connectOptions.args.push('--start-maximized');
      }
      
      // Add proxy if specified
      if (proxy) {
        connectOptions.args.push(`--proxy-server=${proxy.server}`);
        connectOptions.proxyAuth = proxy.username && proxy.password ? 
          { username: proxy.username, password: proxy.password } : undefined;
        console.log(`Using proxy with real-browser: ${proxy.server}`);
      }
      
      const result = await connectRealBrowser(connectOptions);
      
      return { 
        browser: result.browser, 
        page: result.page, 
        browserType: 'real-browser'
      };
    } catch (error) {
      console.error('Failed to launch with puppeteer-real-browser:', error.message);
      // Fall through to try puppeteer-core
    }
  }
  
  // Fallback to puppeteer-core if available
  if (puppeteerCore) {
    try {
      const launchArgs = [...DEFAULT_ARGS, ...args];
      
      // Add window size for non-headless mode
      if (headlessValue === false) {
        launchArgs.push('--window-size=1920,1080');
        launchArgs.push('--start-maximized');
      }
      
      // Add proxy if specified
      if (proxy) {
        launchArgs.push(`--proxy-server=${proxy.server}`);
        console.log(`Using proxy with puppeteer-core: ${proxy.server}`);
      }
      
      // Find Chrome executable path based on OS
      const os = require('os');
      const platform = os.platform();
      let executablePath;
      
      if (platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else if (platform === 'win32') {
        executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        if (!require('fs').existsSync(executablePath)) {
          executablePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
        }
      } else if (platform === 'linux') {
        executablePath = '/usr/bin/google-chrome';
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
      
      console.log(`Using Chrome executable: ${executablePath}`);
      
      const browser = await puppeteerCore.launch({
        headless: headlessValue,
        executablePath: executablePath,
        args: launchArgs,
        ignoreHTTPSErrors: true,
        defaultViewport: headlessValue !== false ? { width: 1920, height: 1080 } : null
      });
      
      const page = await browser.newPage();
      
      // Set proxy authentication if needed
      if (proxy && proxy.username && proxy.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password
        });
      }
      
      const userAgent = getRandomUserAgent();
      console.log(`Using user agent: ${userAgent}`);
      await page.setUserAgent(userAgent);
      
      // Only set viewport in headless mode, otherwise use window size
      if (headlessValue !== false) {
        await page.setViewport({ width: 1920, height: 1080 });
      }
      
      return { browser, page, browserType: 'puppeteer-core' };
    } catch (error) {
      console.error('Failed to launch with puppeteer-core:', error.message);
      throw error;
    }
  }
  
  throw new Error('Unable to launch browser in real browser mode');
}

/**
 * Launches a browser using puppeteer-extra with stealth plugin
 * @param {object} options - Launch options
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page, browserType: string}>}
 */
async function launchStealthBrowser(options) {
  const { 
    headless = 'new', 
    args = [], 
    timeout = 90000, 
    proxy = null 
  } = options;
  
  if (!puppeteer || !StealthPlugin) {
    throw new Error('Puppeteer-extra or stealth plugin is not available');
  }
  
  // Ensure we correctly interpret headless mode
  const headlessValue = headless === 'new' ? 'new' : 
                        headless === true ? 'new' : 
                        headless === false ? false : 'new';
  
  console.log(`Launching browser with stealth plugin (headless: ${headlessValue === false ? 'false (non-headless)' : headlessValue})...`);
  
  const launchArgs = [...DEFAULT_ARGS, ...args];
  
  // Add window size for non-headless mode
  if (headlessValue === false) {
    launchArgs.push('--window-size=1920,1080');
    launchArgs.push('--start-maximized');
  }
  
  // Add proxy if specified
  if (proxy) {
    launchArgs.push(`--proxy-server=${proxy.server}`);
    console.log(`Using proxy with stealth: ${proxy.server}`);
  }
  
  const browser = await puppeteer.launch({
    headless: headlessValue,
    args: launchArgs,
    ignoreHTTPSErrors: true,
    defaultViewport: headlessValue !== false ? { width: 1920, height: 1080 } : null
  });
  
  const page = await browser.newPage();
  
  // Set proxy authentication if needed
  if (proxy && proxy.username && proxy.password) {
    await page.authenticate({
      username: proxy.username,
      password: proxy.password
    });
  }
  
  const userAgent = getRandomUserAgent();
  console.log(`Using user agent: ${userAgent}`);
  await page.setUserAgent(userAgent);
  
  // Only set viewport in headless mode, otherwise use window size
  if (headlessValue !== false) {
    await page.setViewport({ width: 1920, height: 1080 });
  }
  
  // Add a fake notification permission API
  await page.evaluateOnNewDocument(() => {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' 
        ? Promise.resolve({state: Notification.permission}) 
        : originalQuery(parameters)
    );
    
    // Add some plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => Array(5).fill().map((_, i) => ({
        name: `Plugin ${i}`,
        description: `Plugin ${i} Description`,
        filename: `plugin${i}.dll`
      }))
    });
  });
  
  return { browser, page, browserType: 'stealth' };
}

/**
 * Sets up advanced request interception to modify headers and mimic real browser behavior.
 * @param {import('puppeteer').Page} page
 */
async function setupRequestInterception(page) {
    console.log('Setting up advanced request interception...');
    try {
        await page.setRequestInterception(true);
        page.on('request', request => {
            // Skip intercepting certain resource types for better performance
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.continue();
                return;
            }
            
            // Get the original headers
            const headers = {
                ...request.headers(),
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': resourceType === 'document' ? 'document' : 'empty',
                'Sec-Fetch-Mode': resourceType === 'document' ? 'navigate' : 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': resourceType === 'document' ? '?1' : undefined,
                'DNT': '1',
            };
            
            // Always include a proper referer when possible
            const referer = request.headers().referer || page.url();
            if (referer && referer !== 'about:blank') {
                headers['Referer'] = referer;
            }

            request.continue({ headers });
        });
        console.log('Advanced request interception enabled.');
    } catch (error) {
        console.error('Failed to set up request interception:', error.message);
        // Non-critical error, continue without interception
    }
}

/**
 * Solves a captcha using 2Captcha service
 * @param {import('puppeteer').Page} page - Puppeteer page
 * @param {string} type - Type of captcha ('recaptcha', 'hcaptcha', 'turnstile')
 * @returns {Promise<boolean>} - Success flag
 */
async function solveCaptcha(page, type = 'auto') {
  if (!TwoCaptchaSolver || !CAPTCHA_API_KEY) {
    console.warn('Captcha solving not available. Missing 2captcha-ts or API key.');
    return false;
  }

  try {
    console.log(`Attempting to solve ${type} captcha...`);
    
    // Initialize 2Captcha solver
    const solver = new TwoCaptchaSolver(CAPTCHA_API_KEY);
    
    // Get the site key from the page
    let siteKey;
    
    if (type === 'auto') {
      // Try to determine the captcha type automatically
      const recaptchaKey = await page.evaluate(() => {
        const recaptchaEl = document.querySelector('.g-recaptcha');
        return recaptchaEl ? recaptchaEl.getAttribute('data-sitekey') : null;
      });
      
      const hcaptchaKey = await page.evaluate(() => {
        const hcaptchaEl = document.querySelector('.h-captcha');
        return hcaptchaEl ? hcaptchaEl.getAttribute('data-sitekey') : null;
      });
      
      const turnstileKey = await page.evaluate(() => {
        const turnstileEl = document.querySelector('.cf-turnstile');
        return turnstileEl ? turnstileEl.getAttribute('data-sitekey') : null;
      });
      
      if (recaptchaKey) {
        type = 'recaptcha';
        siteKey = recaptchaKey;
      } else if (hcaptchaKey) {
        type = 'hcaptcha';
        siteKey = hcaptchaKey;
      } else if (turnstileKey) {
        type = 'turnstile';
        siteKey = turnstileKey;
      } else {
        console.warn('No recognized captcha found on page');
        return false;
      }
    } else {
      // Get site key for specified captcha type
      const selector = type === 'recaptcha' 
        ? '.g-recaptcha' 
        : (type === 'hcaptcha' ? '.h-captcha' : '.cf-turnstile');
      
      siteKey = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.getAttribute('data-sitekey') : null;
      }, selector);
    }
    
    if (!siteKey) {
      console.warn(`No site key found for ${type} captcha`);
      return false;
    }
    
    console.log(`Found ${type} captcha with site key: ${siteKey}`);
    
    // Get the page URL
    const pageUrl = page.url();
    
    // Solve the captcha
    let solution;
    if (type === 'recaptcha' || type === 'recaptchav2') {
      solution = await solver.recaptcha(siteKey, pageUrl);
    } else if (type === 'hcaptcha') {
      solution = await solver.hcaptcha(siteKey, pageUrl);
    } else if (type === 'turnstile') {
      solution = await solver.turnstile(siteKey, pageUrl);
    } else {
      throw new Error(`Unsupported captcha type: ${type}`);
    }
    
    if (!solution) {
      throw new Error('Failed to get captcha solution');
    }
    
    console.log('Captcha solved, applying solution...');
    
    // Apply the solution to the page
    if (type === 'recaptcha' || type === 'recaptchav2') {
      await page.evaluate((token) => {
        window.grecaptcha.enterprise?.reset();
        window.grecaptcha.enterprise?.execute();
        
        // Try different ways to apply the token
        try {
          document.getElementById('g-recaptcha-response').innerHTML = token;
        } catch (e) {
          // If that fails, try to set it as a value
          try {
            document.getElementById('g-recaptcha-response').value = token;
          } catch (e2) {
            // If that fails, try to find it by name
            try {
              document.querySelector('[name="g-recaptcha-response"]').value = token;
            } catch (e3) {
              console.error('Failed to apply reCAPTCHA token:', e3);
              return false;
            }
          }
        }
        return true;
      }, solution);
    } else if (type === 'hcaptcha') {
      await page.evaluate((token) => {
        try {
          document.querySelector('textarea[name="h-captcha-response"]').innerHTML = token;
        } catch (e) {
          try {
            document.querySelector('[name="h-captcha-response"]').value = token;
          } catch (e2) {
            console.error('Failed to apply hCaptcha token:', e2);
            return false;
          }
        }
        return true;
      }, solution);
    } else if (type === 'turnstile') {
      await page.evaluate((token) => {
        try {
          document.querySelector('[name="cf-turnstile-response"]').innerHTML = token;
        } catch (e) {
          try {
            document.querySelector('[name="cf-turnstile-response"]').value = token;
          } catch (e2) {
            console.error('Failed to apply Turnstile token:', e2);
            return false;
          }
        }
        return true;
      }, solution);
    }
    
    // Extra waiting for site to process the captcha
    await randomDelay(1000, 3000);
    
    // Try to find and click the submit button if available
    const buttonClicked = await page.evaluate(() => {
      const submitBtn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
        .find(el => 
          el.textContent?.toLowerCase().includes('submit') || 
          el.textContent?.toLowerCase().includes('verify') ||
          el.value?.toLowerCase().includes('submit') ||
          el.value?.toLowerCase().includes('verify') ||
          el.id?.toLowerCase().includes('submit') ||
          el.name?.toLowerCase().includes('submit')
        );
      
      if (submitBtn) {
        submitBtn.click();
        return true;
      }
      return false;
    });
    
    if (buttonClicked) {
      console.log('Clicked submit button after captcha solve');
    } else {
      console.log('No submit button found after captcha solve');
    }
    
    // Wait for potential navigation or page changes
    console.log('Waiting after captcha solve...');
    await randomDelay(10000, 10000);
    
    // Check if we're still on a challenge page
    const stillChallenge = await page.evaluate(() => {
      return document.title.includes('Cloudflare') || 
             document.title.includes('Just a moment') ||
             document.title.includes('Checking your browser') ||
             document.querySelector('.g-recaptcha') !== null ||
             document.querySelector('.h-captcha') !== null ||
             document.querySelector('.cf-turnstile') !== null;
    });
    
    if (!stillChallenge) {
      console.log('Successfully passed challenge after captcha solve');
    } else {
      console.log('Still on challenge page after captcha solve');
    }
    
    return !stillChallenge;
  } catch (error) {
    console.error('Error solving captcha:', error.message);
    return false;
  }
}

/**
 * Detects and solves captchas on a page
 * @param {import('puppeteer').Page} page - Puppeteer page
 * @returns {Promise<boolean>} - Success flag
 */
async function handleCaptchas(page) {
  try {
    // Check if there's a captcha on the page
    const hasCaptcha = await page.evaluate(() => {
      return !!(
        document.querySelector('.g-recaptcha') ||
        document.querySelector('.h-captcha') ||
        document.querySelector('.cf-turnstile') ||
        document.querySelector('#captcha') ||
        document.querySelector('[data-hcaptcha-widget-id]') ||
        document.querySelector('[data-sitekey]') ||
        document.querySelector('iframe[src*="captcha"]') ||
        document.querySelector('iframe[src*="challenge"]') ||
        document.querySelector('iframe[src*="turnstile"]')
      );
    });
    
    if (hasCaptcha) {
      console.log('Captcha detected, attempting to solve...');
      return await solveCaptcha(page, 'auto');
    }
    
    return false;
  } catch (error) {
    console.error('Error handling captchas:', error.message);
    return false;
  }
}

/**
 * Handle Cloudflare challenges by waiting and potentially solving captchas
 * @param {import('puppeteer').Page} page - Puppeteer page
 * @returns {Promise<boolean>} - Success flag
 */
async function handleCloudflareChallenge(page) {
  try {
    console.log('Handling potential Cloudflare challenge...');
    
    // Wait for Cloudflare challenge to load fully - use our own delay function
    // instead of page.waitForTimeout which may not be available in all Puppeteer versions
    await randomDelay(5000, 5000);
    
    // Check if we're on a Cloudflare challenge page
    const isCloudflare = await page.evaluate(() => {
      return document.title.includes('Cloudflare') || 
             document.title.includes('Just a moment') ||
             document.title.includes('Checking your browser') ||
             document.title.includes('Attention Required') ||
             document.body.textContent.includes('Cloudflare') ||
             document.body.textContent.includes('checking your browser') ||
             document.body.textContent.includes('Ray ID') ||
             !!document.querySelector('#challenge-running') ||
             !!document.querySelector('#cf-challenge-running');
    });
    
    if (!isCloudflare) {
      console.log('Not on a Cloudflare challenge page');
      return false;
    }
    
    console.log('Detected Cloudflare challenge page, waiting...');
    
    // First try waiting for automatic passage (15 seconds)
    await randomDelay(15000, 15000);
    
    // Check if we're still on a challenge page
    const stillChallenge = await page.evaluate(() => {
      return document.title.includes('Cloudflare') || 
             document.title.includes('Just a moment') ||
             document.title.includes('Checking your browser');
    });
    
    if (!stillChallenge) {
      console.log('Cloudflare challenge passed automatically');
      return true;
    }
    
    // Try to solve any captchas
    const captchaSolved = await handleCaptchas(page);
    
    if (captchaSolved) {
      console.log('Captcha solved, waiting for final redirect...');
      await randomDelay(5000, 5000);
      return true;
    }
    
    // Try clicking the "I'm human" verification when available
    const clicked = await page.evaluate(() => {
      const verifyButton = document.querySelector('input[type="button"][value*="Verify"]') ||
                          document.querySelector('input[type="button"][value*="human"]') ||
                          document.querySelector('button:not([disabled]):not([aria-disabled="true"]):not([style*="display: none"]):not([style*="visibility: hidden"])');
      
      if (verifyButton) {
        verifyButton.click();
        return true;
      }
      return false;
    });
    
    if (clicked) {
      console.log('Clicked verification button, waiting...');
      await randomDelay(10000, 10000);
    }
    
    // If the Cloudflare page is still showing, try one more captcha solve attempt
    const finalCheck = await page.evaluate(() => {
      return document.title.includes('Cloudflare') || 
             document.title.includes('Just a moment') ||
             document.title.includes('Checking your browser');
    });
    
    if (finalCheck) {
      console.log('Still on Cloudflare challenge, trying one more captcha solve...');
      await handleCaptchas(page);
      await randomDelay(5000, 5000);
    }
    
    // Final verification
    const success = await page.evaluate(() => {
      return !(document.title.includes('Cloudflare') || 
              document.title.includes('Just a moment') ||
              document.title.includes('Checking your browser'));
    });
    
    return success;
  } catch (error) {
    console.error('Error handling Cloudflare challenge:', error.message);
    return false;
  }
}

/**
 * Main entry point for launching browser with progressive fallback strategy.
 * Tries multiple methods in sequence until successful access is achieved.
 * 
 * @param {string} initialUrl - The URL to navigate to and check access
 * @param {object} options - Browser launch options
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page}>}
 */
async function launchBrowser(initialUrl, options = {}) {
  const { 
    timeout = 90000,
    args = [],
    headless = undefined,
    useProxy = false,
    tryCloudflareBypass = true,
    solveCaptchas = true
  } = options;
  
  // Determine headless mode from options or environment variables
  let forcedHeadless = headless;
  if (forcedHeadless === undefined) {
    // Check environment variables
    if (process.env.BROWSER_HEADLESS === 'true' || process.env.PUPPETEER_HEADLESS === 'true') {
      forcedHeadless = 'new'; // Modern puppeteer uses 'new' for headless mode
    } else if (process.env.BROWSER_HEADLESS === 'false' || process.env.PUPPETEER_HEADLESS === 'false') {
      forcedHeadless = false;
    } else {
      forcedHeadless = 'new'; // Default to headless: 'new' if not specified
    }
  }
  
  console.log(`Starting browser launch sequence with initialUrl: ${initialUrl}`);
  console.log(`Initial headless setting: ${forcedHeadless}`);
  
  // Array of launch methods in order of preference
  const launchMethods = [
    // Headless modes first
    {
      name: 'Regular Puppeteer (Headless)',
      headless: 'new',
      launchFn: launchRegularPuppeteer
    },
    {
      name: 'Real Browser Mode (Headless)',
      headless: 'new',
      launchFn: launchRealBrowser
    },
    {
      name: 'Stealth Mode (Headless)',
      headless: 'new',
      launchFn: launchStealthBrowser
    },
    // Then non-headless modes
    {
      name: 'Regular Puppeteer (Non-Headless)',
      headless: false,
      launchFn: launchRegularPuppeteer
    },
    {
      name: 'Real Browser Mode (Non-Headless)',
      headless: false,
      launchFn: launchRealBrowser
    },
    {
      name: 'Stealth Mode (Non-Headless)',
      headless: false,
      launchFn: launchStealthBrowser
    }
  ];
  
  // First try without proxy
  console.log('Starting browser launch attempts without proxy...');
  let browser, page, browserType, methodName;
  let success = false;
  
  for (const method of launchMethods) {
    if (success) break;
    
    try {
      console.log(`Attempting ${method.name}...`);
      
      // Override headless setting if specified in options
      // If forcedHeadless is explicitly set, use that, otherwise use the method's default
      const effectiveHeadless = forcedHeadless !== undefined ? forcedHeadless : method.headless;
      
      console.log(`Using headless mode: ${effectiveHeadless === false ? 'false (non-headless)' : effectiveHeadless}`);
      
      const result = await method.launchFn({
        headless: effectiveHeadless,
        args: args,
        timeout: timeout
      });
      
      browser = result.browser;
      page = result.page;
      browserType = result.browserType;
      methodName = method.name;
      
      // Add a random delay before navigation to appear more human-like
      await randomDelay(1000, 3000);
      
      console.log(`Navigating to ${initialUrl} with ${method.name}`);
      await page.goto(initialUrl, { 
        waitUntil: 'networkidle2', 
        timeout: timeout 
      });
      
      await randomDelay(2000, 5000);
      
      // Check for Cloudflare or other protection
      if (await isCloudflareBlocked(page)) {
        console.warn(`${method.name} blocked by Cloudflare. ${tryCloudflareBypass ? 'Attempting bypass...' : 'Closing and trying next method...'}`);
        
        if (tryCloudflareBypass) {
          // Try to bypass Cloudflare challenge
          const bypassSuccess = await handleCloudflareChallenge(page);
          
          if (bypassSuccess) {
            console.log(`Successfully bypassed Cloudflare challenge with ${method.name}`);
            success = true;
          } else {
            console.warn(`Failed to bypass Cloudflare challenge with ${method.name}. Closing and trying next method...`);
            await browser.close();
            browser = null;
            page = null;
          }
        } else {
          await browser.close();
          browser = null;
          page = null;
        }
      } else {
        console.log(`Successfully accessed ${initialUrl} with ${method.name}`);
        success = true;
      }
      
      if (success) {
        // Try to detect and solve any captchas if they appear
        if (solveCaptchas) {
          await handleCaptchas(page);
        }
        
        await setupRequestInterception(page);
        break;
      }
    } catch (error) {
      console.error(`Error with ${method.name}:`, error.message);
      // Continue to next method
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error(`Error closing browser: ${closeError.message}`);
        }
        browser = null;
        page = null;
      }
    }
  }
  
  // If we succeeded without proxy, return the result
  if (success && browser && page) {
    return { 
      browser, 
      page,
      browserType: browserType,
      browserMethod: methodName
    };
  }
  
  // If we reach here, all methods failed without proxy
  // Try again with proxy if useProxy is true or wasn't explicitly set to false
  if (useProxy !== false) {
    console.log('All methods failed without proxy. Retrying with proxy...');
    const proxy = DEFAULT_PROXY;
    
    for (const method of launchMethods) {
      try {
        console.log(`Attempting ${method.name} with proxy...`);
        
        // Override headless setting if specified in options
        const effectiveHeadless = forcedHeadless !== undefined ? forcedHeadless : method.headless;
        
        console.log(`Using headless mode with proxy: ${effectiveHeadless === false ? 'false (non-headless)' : effectiveHeadless}`);
        
        // Fix for proxy authentication - properly format auth string
        const formattedProxy = {
          server: proxy.server,
          username: proxy.username,
          password: proxy.password
        };
        
        const result = await method.launchFn({
          headless: effectiveHeadless,
          args: args,
          timeout: timeout,
          proxy: formattedProxy
        });
        
        browser = result.browser;
        page = result.page;
        browserType = result.browserType;
        methodName = method.name;
        
        // Add a random delay before navigation
        await randomDelay(1000, 3000);
        
        console.log(`Navigating to ${initialUrl} with ${method.name} and proxy`);
        await page.goto(initialUrl, { 
          waitUntil: 'networkidle2', 
          timeout: timeout 
        });
        
        await randomDelay(2000, 5000);
        
        // Check for Cloudflare or other protection
        if (await isCloudflareBlocked(page)) {
          console.warn(`${method.name} with proxy blocked by Cloudflare. ${tryCloudflareBypass ? 'Attempting bypass...' : 'Closing and trying next method...'}`);
          
          if (tryCloudflareBypass) {
            // Try to bypass Cloudflare challenge
            const bypassSuccess = await handleCloudflareChallenge(page);
            
            if (bypassSuccess) {
              console.log(`Successfully bypassed Cloudflare challenge with ${method.name} and proxy`);
              success = true;
              break;
            } else {
              console.warn(`Failed to bypass Cloudflare challenge with ${method.name} and proxy. Closing and trying next method...`);
              await browser.close();
              browser = null;
              page = null;
            }
          } else {
            await browser.close();
            browser = null;
            page = null;
          }
        } else {
          console.log(`Successfully accessed ${initialUrl} with ${method.name} and proxy`);
          
          // Try to detect and solve any captchas if they appear
          if (solveCaptchas) {
            await handleCaptchas(page);
          }
          
          await setupRequestInterception(page);
          
          return { 
            browser, 
            page,
            browserType: browserType,
            browserMethod: `${method.name} with proxy`,
            usingProxy: true
          };
        }
      } catch (error) {
        console.error(`Error with ${method.name} and proxy:`, error.message);
        // Continue to next method
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.error(`Error closing browser: ${closeError.message}`);
          }
          browser = null;
          page = null;
        }
      }
    }
  }
  
  // If we succeeded with proxy in the loop above, return the result
  if (success && browser && page) {
    return { 
      browser, 
      page,
      browserType: browserType,
      browserMethod: `${methodName} with proxy`,
      usingProxy: true
    };
  }
  
  // If we reach here, all methods failed
  throw new Error('All browser launch methods failed. Unable to access the target URL.');
}

module.exports = { 
  launchBrowser, 
  randomDelay, 
  isCloudflareBlocked,
  launchRegularPuppeteer,
  launchRealBrowser,
  launchStealthBrowser,
  handleCaptchas,
  handleCloudflareChallenge,
  solveCaptcha
}; 