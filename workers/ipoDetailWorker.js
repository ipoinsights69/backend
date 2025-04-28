const { workerThread } = require('../utils/threadManager');
const { fetchStructuredData, fetchCompleteIpoData } = require('../scraper/ipoDetailScraper');
const { saveToJson, sanitizeFilename } = require('../utils/helpers');
const { uploadIpoDetail } = require('../utils/mongoDbHelper');
const path = require('path');

/**
 * Process a single IPO in a worker thread
 * @param {Object} ipo - IPO listing data
 * @param {Object} options - Additional options
 */
async function processIpoInWorker(ipo, options) {
  const { threadId, year, dataDir, uploadToMongo, delay } = options;
  
  try {
    if (!ipo.detail_url) {
      console.log(`[Thread ${threadId}] Missing detail URL for IPO: ${ipo.company_name}`);
      return null;
    }

    // Full URL if it's a relative URL
    const fullUrl = ipo.detail_url.startsWith('http') 
      ? ipo.detail_url 
      : `https://www.chittorgarh.com${ipo.detail_url}`;

    console.log(`[Thread ${threadId}] Processing IPO: ${ipo.company_name}`);
    
    // Add delay to prevent overloading the server (staggered requests)
    if (delay) {
      await new Promise(resolve => setTimeout(resolve, delay * threadId));
    }
    
    // Use the comprehensive data fetching function
    const ipoData = await fetchCompleteIpoData(fullUrl);
    
    if (ipoData._error) {
      console.error(`[Thread ${threadId}] Error fetching data for ${ipo.company_name}: ${ipoData.message}`);
      return null;
    }

    // Save to file system (organized by year)
    const yearDir = path.join(dataDir, year.toString());
    const companyName = sanitizeFilename(ipo.company_name);
    const fileName = `${companyName}.json`;
    
    await saveToJson(yearDir, fileName, ipoData);
    console.log(`[Thread ${threadId}] Saved ${ipo.company_name} data to ${path.join(yearDir, fileName)}`);

    // Upload to MongoDB if enabled
    if (uploadToMongo) {
      try {
        const metadata = {
          company_name: ipo.company_name,
          year: year
        };
        await uploadIpoDetail(ipoData, metadata);
        console.log(`[Thread ${threadId}] Uploaded ${ipo.company_name} data to MongoDB`);
      } catch (mongoError) {
        console.error(`[Thread ${threadId}] MongoDB upload error for ${ipo.company_name}:`, mongoError.message);
      }
    }

    return {
      company_name: ipo.company_name,
      success: true,
      _id: companyName,
      year: year
    };
    
  } catch (error) {
    console.error(`[Thread ${threadId}] Error processing IPO ${ipo.company_name}:`, error.message);
    return {
      company_name: ipo.company_name,
      success: false,
      error: error.message,
      year: year
    };
  }
}

// Start worker processing if this is run as a worker thread
workerThread(processIpoInWorker); 