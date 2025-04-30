const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar'); // Make sure you have installed chokidar (npm install chokidar)

// --- Configuration ---
const INPUT_DIR = './ipo_data'; // Folder containing your raw JSON files
const OUTPUT_DIR = './output'; // Folder to store the generated JSON files
const RAW_DATA_SUBDIR = 'raw'; // Subfolder within OUTPUT_DIR for full raw files
const PERF_LIST_SIZE = 50; // Number of best/worst performers to list

// --- Global State (In-memory data) ---
// This array holds the comprehensive summary objects for all IPOs.
// It's updated when files are added or changed, and then used to regenerate output files.
let allIposMeta = [];

// --- Helper Functions ---

// Ensures a directory exists, creates it if not
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        // console.log(`Created directory: ${dirPath}`);
    }
}

// Reads and parses a JSON file
function readJsonFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // console.error(`Error reading or parsing file ${filePath}:`, error.message);
        return null;
    }
}

// Writes data to a JSON file with pretty printing
function writeJsonFile(filePath, data) {
    try {
        const jsonString = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonString, 'utf8');
        console.log(`Generated: ${filePath}`);
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error.message);
    }
}

// Extracts a clean, year-less IPO ID
function cleanIpoId(fullIpoId) {
    if (!fullIpoId || typeof fullIpoId !== 'string') {
        // console.warn(`Invalid ipo_id provided for cleaning: ${fullIpoId}`);
        return null;
    }
    // Assuming format is YYYY_rest_of_id or similar. Split by first underscore.
    const parts = fullIpoId.split('_');
    if (parts.length > 1) {
        // Join parts after the first underscore, ensuring lower case and web-friendly chars
        return parts.slice(1).join('_').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    }
    // Fallback for ids without underscore (sanitize)
    return fullIpoId.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

// Extracts comprehensive summary data for the meta file
function extractComprehensiveSummary(ipo, rawFilePathRelative) {
     // Use a robust check for a valid ipo_id before cleaning
     if (!ipo.ipo_id) {
         console.warn(`Missing ipo_id in raw data.`);
         return null;
     }
     const ipo_id_clean = cleanIpoId(ipo.ipo_id);
     if (!ipo_id_clean) {
         console.warn(`Could not generate clean ipo_id from "${ipo.ipo_id}". Skipping summary extraction.`);
         return null; // Should match validation in processFile
     }

     // Calculate listing gains for structured listingDayTrading data
     let listingGains = null;
     let listingGainsNumeric = null;
     let listingGainsByExchange = null;
     
     // Check for structured listingDayTrading data
     if (ipo.listingDayTrading && ipo.listingDayTrading.data) {
         const data = ipo.listingDayTrading.data;
         
         // Get listing prices from different exchanges
         if (data.final_issue_price && data.last_trade) {
             listingGainsByExchange = {};
             const exchangeKeys = Object.keys(data.final_issue_price);
             
             exchangeKeys.forEach(exchange => {
                 const issuePrice = parseFloat(data.final_issue_price[exchange]);
                 const lastTradePrice = parseFloat(data.last_trade[exchange]);
                 
                 if (!isNaN(issuePrice) && !isNaN(lastTradePrice) && issuePrice > 0) {
                     const listingGain = ((lastTradePrice - issuePrice) / issuePrice) * 100;
                     const roundedGain = Math.round(listingGain * 100) / 100;
                     
                     listingGainsByExchange[exchange] = {
                         issuePrice,
                         lastTradePrice,
                         gain: roundedGain,
                         gainFormatted: `${roundedGain > 0 ? '+' : ''}${roundedGain.toFixed(2)}%`
                     };
                 }
             });
             
             // Prioritize NSE over BSE if both are available for the main listing gain
             if (listingGainsByExchange.nse) {
                 listingGainsNumeric = listingGainsByExchange.nse.gain;
                 listingGains = listingGainsByExchange.nse.gainFormatted;
             } else if (listingGainsByExchange.bse) {
                 listingGainsNumeric = listingGainsByExchange.bse.gain;
                 listingGains = listingGainsByExchange.bse.gainFormatted;
             } else if (Object.keys(listingGainsByExchange).length > 0) {
                 // Use the first available exchange if neither NSE nor BSE
                 const firstExchange = Object.keys(listingGainsByExchange)[0];
                 listingGainsNumeric = listingGainsByExchange[firstExchange].gain;
                 listingGains = listingGainsByExchange[firstExchange].gainFormatted;
             }
         }
     }

     const summary = {
         // Core Identifiers
         ipo_id: ipo_id_clean, // Use the cleaned ID
         original_ipo_id: ipo.ipo_id || null, // Keep the original ID as reference if needed
         ipo_name: ipo.ipoName || null,
         company_name: ipo.ipoName ? ipo.ipoName.replace(/ IPO$/, '').trim() : null, // Basic attempt
         year: ipo.year || null,
         status: ipo.status || 'unknown',
         raw_data_path: rawFilePathRelative, // Path to the full raw file copy (relative)

         // Dates (as strings and temporary Date objects for sorting)
         opening_date: ipo.basicDetails?.ipoOpenDate || null,
         closing_date: ipo.basicDetails?.ipoCloseDate || null,
         listing_date: ipo.basicDetails?.ipoListingDate || null,
         _openingDateObj: null, // Temporary for sorting
         _closingDateObj: null, // Temporary for sorting
         _listingDateObj: null, // Temporary for sorting

         // Pricing & Issue Details
         issue_price: ipo.basicDetails?.issuePrice || null, // String e.g., "₹111.00"
         issue_price_numeric: ipo.issue_price_numeric || null, // Number e.g., 111
         face_value: ipo.basicDetails?.faceValue || null,
         issue_size: ipo.basicDetails?.issueSize || null, // String e.g., "54,03,600 shares (aggregating up to ₹59.98 Cr)"
         issue_size_numeric: ipo.issue_size_numeric || null, // Number e.g., 54 (from issue_size_numeric)
         fresh_issue: ipo.basicDetails?.freshIssue || null,
         offer_for_sale: ipo.basicDetails?.offerForSale || null,
         issue_type: ipo.basicDetails?.issueType || null,
         listing_at: ipo.basicDetails?.listingAt || null,
         lot_size: ipo.basicDetails?.lotSize || null, // String e.g., "1,200 Shares"
         // Attempt to extract minimum amount from FAQ if lot size string isn't enough
         minimum_amount_string: ipo.faqs?.find(faq => faq.question?.toLowerCase().includes('lot size'))?.answer?.match(/minimum amount required is <span>(₹[\d,]+)<\/span>/)?.[1] || null,
         // Add reservation details summary if needed? e.g., QIB %, NII %, Retail %

         // Subscription Status Summary
         overall_subscription: ipo.subscriptionStatus?.overall?.subscription_times || null,
         retail_subscription: ipo.subscriptionStatus?.retail?.subscription_times || null,
         nii_subscription: ipo.subscriptionStatus?.nii?.subscription_times || null,
         qib_subscription: ipo.subscriptionStatus?.qib?.subscription_times || null,
         employee_subscription: ipo.subscriptionStatus?.overall?.employee?.subscription_times || null,
         total_applications: ipo.subscriptionStatus?.total_applications || null,
         
         // Add NII subcategories if available
         nii_subcategories: {
             bnii_subscription: ipo.subscriptionStatus?.overall?.nii?.subcategories?.bnii?.subscription_times || null,
             snii_subscription: ipo.subscriptionStatus?.overall?.nii?.subcategories?.snii?.subscription_times || null
         },

         // Listing Performance Summary (for listed IPOs)
         listing_gains: listingGains || ipo.listing_gains || null, // String e.g., "-15.99%" 
         listing_gains_numeric: listingGainsNumeric || ipo.listing_gains_numeric || null, // Number e.g., -15.99
         listing_gains_by_exchange: listingGainsByExchange || null,
     };
     
     // Handle different listing data structures
     if (ipo.listingDayTrading && ipo.listingDayTrading.data) {
         // New structure with data.exchange.field
         const data = ipo.listingDayTrading.data;
         
         // Process each exchange's data
         if (data.open) {
             const exchanges = Object.keys(data.open);
             
             // Try to find a primary exchange (prefer NSE, then BSE, then others)
             const primaryExchange = exchanges.includes('nse') ? 'nse' : 
                                     (exchanges.includes('bse') ? 'bse' : 
                                     (exchanges.length > 0 ? exchanges[0] : null));
             
             if (primaryExchange) {
                 summary.listing_price_open = data.open[primaryExchange] || null;
                 summary.listing_price_high = data.high?.[primaryExchange] || null;
                 summary.listing_price_low = data.low?.[primaryExchange] || null;
                 summary.listing_price_last = data.last_trade?.[primaryExchange] || null;
                 
                 // Store all exchange data
                 summary.listing_day_trading_data = {};
                 exchanges.forEach(exchange => {
                     summary.listing_day_trading_data[exchange] = {
                         open: data.open?.[exchange] || null,
                         high: data.high?.[exchange] || null,
                         low: data.low?.[exchange] || null,
                         last_trade: data.last_trade?.[exchange] || null,
                         issue_price: data.final_issue_price?.[exchange] || null
                     };
                 });
             }
         }
     } else {
         // Legacy flat structure
         summary.listing_price_open = ipo.listingDayTrading?.openbse_sme || ipo.listingDayTrading?.open || null;
         summary.listing_price_high = ipo.listingDayTrading?.highbse_sme || ipo.listingDayTrading?.high || null;
         summary.listing_price_low = ipo.listingDayTrading?.lowbse_sme || ipo.listingDayTrading?.low || null;
         summary.listing_price_last = ipo.listingDayTrading?.last_tradebse_sme || ipo.listingDayTrading?.last_trade || null;
     }
     
     // Other Details
     summary.logo_url = ipo.logo_url || ipo.listingDetail?.logo || null;
     summary.market_maker = ipo.basicDetails?.maker_name || null;
     summary.registrar_name = ipo.registrarDetails?.name || null;

     // Attempt to parse string dates into Date objects for reliable sorting
     try {
        // Prioritize ISO dates if they exist, fallback to string parsing
        summary._openingDateObj = ipo.closing_date ? new Date(ipo.closing_date) : (summary.opening_date ? new Date(summary.opening_date) : null);
        summary._closingDateObj = ipo.closing_date ? new Date(ipo.closing_date) : (summary.closing_date ? new Date(summary.closing_date) : null); // Use the reliable closing_date ISO if available
        summary._listingDateObj = ipo.listingDetail?.listing_date ? new Date(ipo.listingDetail.listing_date) : (summary.listing_date ? new Date(summary.listing_date) : null);

        // Validate parsed dates - check if they resulted in a valid date
         if(summary._openingDateObj && isNaN(summary._openingDateObj.getTime())) summary._openingDateObj = null;
         if(summary._closingDateObj && isNaN(summary._closingDateObj.getTime())) summary._closingDateObj = null;
         if(summary._listingDateObj && isNaN(summary._listingDateObj.getTime())) summary._listingDateObj = null;
     } catch (e) {
         console.warn(`Could not parse date string for IPO "${ipo.ipo_id}" (${summary.ipo_id}): ${e.message}`);
         summary._openingDateObj = null;
         summary._closingDateObj = null;
         summary._listingDateObj = null;
     }

     return summary;
}

// Function to process a single raw file
function processFile(filePath) {
    console.log(`Processing: ${filePath}`);
    const ipoData = readJsonFile(filePath);

    if (!ipoData) {
        console.error(`SKIP: Failed to read or parse JSON.`);
        return null;
    }

    // Basic validation for essential fields
    if (!ipoData._id || !ipoData.ipo_id || !ipoData.ipoName || !ipoData.year || !ipoData.status) {
        console.warn(`SKIP: Missing essential fields (_id, ipo_id, ipoName, year, status) in ${filePath}.`);
        return null;
    }

    const ipo_id_clean = cleanIpoId(ipoData.ipo_id);
    if (!ipo_id_clean) {
         console.warn(`SKIP: Invalid or un-cleanable ipo_id "${ipoData.ipo_id}" in ${filePath}.`);
         return null;
    }

    const year = ipoData.year;
    if (!year || typeof year !== 'number') {
         console.warn(`SKIP: Missing or invalid year field in ${filePath}.`);
         return null;
    }

    // Ensure year directory exists for raw data
    const rawYearDir = path.join(OUTPUT_DIR, RAW_DATA_SUBDIR, String(year));
    ensureDir(rawYearDir);

    // --- Write the full raw data to the year-wise output directory ---
    const rawFileName = `${ipo_id_clean}.json`;
    const rawOutputPath = path.join(rawYearDir, rawFileName);
    const rawFilePathRelative = path.join(RAW_DATA_SUBDIR, String(year), rawFileName).replace(/\\/g, '/'); // Relative path for meta file

    // Check if writing the raw file fails
    try {
         const jsonString = JSON.stringify(ipoData, null, 2);
         fs.writeFileSync(rawOutputPath, jsonString, 'utf8');
         console.log(`Copied raw data to: ${rawOutputPath}`);
    } catch (error) {
         console.error(`SKIP: Failed to write raw data file ${rawOutputPath}: ${error.message}`);
         return null;
    }


    // --- Create and return comprehensive summary metadata ---
    const summary = extractComprehensiveSummary(ipoData, rawFilePathRelative);

    if (summary) {
        console.log(`Processed successfully: ${filePath} -> ${summary.ipo_id}`);
    } else {
        console.error(`SKIP: Failed to extract summary data for ${filePath}.`);
    }

    return summary; // Return the summary object (or null if extraction failed)
}

// Function to generate all output files from the in-memory meta array
function generateOutputFiles(metaData) {
    console.log('\n--- Generating Output Files ---');
    if (metaData.length === 0) {
        console.warn("No valid IPO data to generate output files.");
        // Consider writing empty arrays/objects for output files
         writeJsonFile(path.join(OUTPUT_DIR, 'all_ipos_meta.json'), []);
         ensureDir(path.join(OUTPUT_DIR, 'status'));
         writeJsonFile(path.join(OUTPUT_DIR, 'status', 'upcoming.json'), []);
         writeJsonFile(path.join(OUTPUT_DIR, 'status', 'open.json'), []);
         writeJsonFile(path.join(OUTPUT_DIR, 'status', 'closed.json'), []);
         writeJsonFile(path.join(OUTPUT_DIR, 'status', 'listed.json'), []);
         writeJsonFile(path.join(OUTPUT_DIR, 'status', 'unknown.json'), []);
         ensureDir(path.join(OUTPUT_DIR, 'performance'));
         writeJsonFile(path.join(OUTPUT_DIR, 'performance', 'best.json'), []);
         writeJsonFile(path.join(OUTPUT_DIR, 'performance', 'worst.json'), []);
         writeJsonFile(path.join(OUTPUT_DIR, 'stats.json'), { total_ipos: 0, current_year: { year: new Date().getFullYear(), count: 0 }, status: { upcoming: 0, open: 0, closed: 0, listed: 0, unknown: 0 }, best_performer: null });
         writeJsonFile(path.join(OUTPUT_DIR, 'ipo_ids.json'), []);
         writeJsonFile(path.join(OUTPUT_DIR, 'years.json'), []);
        return;
    }

    // Sort the main meta file by opening date descending
    const sortedAllIposMeta = [...metaData].sort((a, b) => {
        const dateA = a._openingDateObj;
        const dateB = b._openingDateObj;

        // Handle cases where dates are null or invalid Date objects
        const timeA = dateA instanceof Date && !isNaN(dateA.getTime()) ? dateA.getTime() : -Infinity; // Treat invalid/null as very old
        const timeB = dateB instanceof Date && !isNaN(dateB.getTime()) ? dateB.getTime() : -Infinity;

        return timeB - timeA; // Descending
    }).map(ipo => {
        // Remove temporary date objects before writing
        const { _openingDateObj, _closingDateObj, _listingDateObj, ...rest } = ipo;
        return rest;
    });

    writeJsonFile(path.join(OUTPUT_DIR, 'all_ipos_meta.json'), sortedAllIposMeta);

    // --- Generate Status-based Listings ---
    const statuses = ['upcoming', 'open', 'closed', 'listed', 'unknown'];
    ensureDir(path.join(OUTPUT_DIR, 'status'));
    for (const status of statuses) {
        const filteredIpos = metaData.filter(ipo => ipo.status === status);

        // Apply specific sorting for each status using temporary date objects
        if (status === 'upcoming' || status === 'open') {
            // Sort upcoming/open by opening date ascending
            filteredIpos.sort((a, b) => {
                 const dateA = a._openingDateObj;
                 const dateB = b._openingDateObj;
                 const timeA = dateA instanceof Date && !isNaN(dateA.getTime()) ? dateA.getTime() : Infinity; // Treat invalid/null as very new for ascending
                 const timeB = dateB instanceof Date && !isNaN(dateB.getTime()) ? dateB.getTime() : Infinity;
                 return timeA - timeB; // Ascending
            });
        } else { // closed, listed, unknown
             // Sort closed/listed by listing date (or closing date, or opening date) descending
             filteredIpos.sort((a, b) => {
                 const dateA = a._listingDateObj || a._closingDateObj || a._openingDateObj;
                 const dateB = b._listingDateObj || b._closingDateObj || b._openingDateObj;
                 const timeA = dateA instanceof Date && !isNaN(dateA.getTime()) ? dateA.getTime() : -Infinity; // Treat invalid/null as very old for descending
                 const timeB = dateB instanceof Date && !isNaN(dateB.getTime()) ? dateB.getTime() : -Infinity;
                 return timeB - timeA; // Descending
             });
        }

        // Remove temporary date objects before writing status files
        const statusData = filteredIpos.map(ipo => {
            const { _openingDateObj, _closingDateObj, _listingDateObj, ...rest } = ipo;
            return rest;
        });
        writeJsonFile(path.join(OUTPUT_DIR, 'status', `${status}.json`), statusData);
    }

    // --- Generate Performance Listings (Best and Worst) ---
    ensureDir(path.join(OUTPUT_DIR, 'performance'));
    const listedIposWithGains = metaData.filter(ipo =>
        ipo.status === 'listed' && ipo.listing_gains_numeric !== null && !isNaN(ipo.listing_gains_numeric)
    );

    // Sort by listing_gains_numeric descending for best
    const bestPerformers = [...listedIposWithGains]
        .sort((a, b) => b.listing_gains_numeric - a.listing_gains_numeric)
        .slice(0, PERF_LIST_SIZE) // Get top N
        .map(ipo => { // Select specific fields for the performance list view
            const { _openingDateObj, _closingDateObj, _listingDateObj, ...rest } = ipo;
            return {
                ipo_id: rest.ipo_id,
                ipo_name: rest.ipo_name,
                company_name: rest.company_name,
                year: rest.year,
                issue_price: rest.issue_price,
                listing_gains: rest.listing_gains,
                listing_gains_numeric: rest.listing_gains_numeric,
                logo_url: rest.logo_url,
                // raw_data_path is not typically needed in a performance list item
            };
        });
    writeJsonFile(path.join(OUTPUT_DIR, 'performance', 'best.json'), bestPerformers);


    // Sort by listing_gains_numeric ascending for worst
    const worstPerformers = [...listedIposWithGains]
        .sort((a, b) => a.listing_gains_numeric - b.listing_gains_numeric)
        .slice(0, PERF_LIST_SIZE) // Get top N
         .map(ipo => { // Select specific fields for the performance list view
            const { _openingDateObj, _closingDateObj, _listingDateObj, ...rest } = ipo;
             return {
                ipo_id: rest.ipo_id,
                ipo_name: rest.ipo_name,
                company_name: rest.company_name,
                year: rest.year,
                issue_price: rest.issue_price,
                listing_gains: rest.listing_gains,
                listing_gains_numeric: rest.listing_gains_numeric,
                logo_url: rest.logo_url,
            };
        });
    writeJsonFile(path.join(OUTPUT_DIR, 'performance', 'worst.json'), worstPerformers);


    // --- Generate Statistics File ---
    const statusCounts = metaData.reduce((acc, ipo) => {
        acc[ipo.status] = (acc[ipo.status] || 0) + 1;
        return acc;
    }, { upcoming: 0, open: 0, closed: 0, listed: 0, unknown: 0 });

    const yearCountsMap = metaData.reduce((acc, ipo) => {
        if (ipo.year) {
             acc[ipo.year] = (acc[ipo.year] || 0) + 1;
        }
        return acc;
    }, {});

    const yearCountsArray = Object.keys(yearCountsMap)
        .map(year => ({ year: parseInt(year), count: yearCountsMap[year] }))
        .sort((a, b) => b.year - a.year); // Sort years descending

    const bestPerformerOverall = bestPerformers.length > 0 ? bestPerformers[0] : null;

    const stats = {
        total_ipos: metaData.length,
        current_year: yearCountsArray.length > 0 ? yearCountsArray[0] : { year: new Date().getFullYear(), count: 0 },
        status: statusCounts,
        best_performer: bestPerformerOverall ? {
             ipo_id: bestPerformerOverall.ipo_id,
             ipo_name: bestPerformerOverall.ipo_name,
             company_name: bestPerformerOverall.company_name,
             listing_gain: bestPerformerOverall.listing_gains_numeric
         } : null,
    };
    writeJsonFile(path.join(OUTPUT_DIR, 'stats.json'), stats);

    // --- Generate IPO IDs file ---
     const ipoIds = metaData.map(ipo => ({
         ipo_id: ipo.ipo_id, // Use cleaned ID
         ipo_name: ipo.ipo_name,
         year: ipo.year
     }));
     writeJsonFile(path.join(OUTPUT_DIR, 'ipo_ids.json'), ipoIds);


    // --- Generate Years file ---
    writeJsonFile(path.join(OUTPUT_DIR, 'years.json'), yearCountsArray);

    console.log('--- Output Files Generation Complete ---');
}


// --- Main Processing Logic ---

// Function to process a single file and update the in-memory meta array
function processAndUpdateMeta(filePath) {
    const summary = processFile(filePath); // Process the file, copy raw, get summary

    if (summary) {
        // Find if this IPO already exists in our in-memory meta array by its cleaned ID
        const existingIndex = allIposMeta.findIndex(ipo => ipo.ipo_id === summary.ipo_id);

        if (existingIndex > -1) {
            // Update existing entry
            console.log(`Updating meta data for existing IPO: ${summary.ipo_id}`);
            allIposMeta[existingIndex] = summary;
        } else {
            // Add new entry
            console.log(`Adding meta data for new IPO: ${summary.ipo_id}`);
            allIposMeta.push(summary);
        }

        // Re-generate all output files based on the updated meta array
        // NOTE: This can be resource intensive if allIposMeta is very large.
        // For very large datasets, consider optimizing generateOutputFiles or using a real database.
        generateOutputFiles(allIposMeta);

    } // else: processFile already logged an error and returned null
}

// --- Initial Scan and Setup Watcher ---

// Function to perform the initial scan of the input directory
async function initialScan() {
    console.log(`Performing initial scan of ${INPUT_DIR}...`);
    ensureDir(path.join(OUTPUT_DIR, RAW_DATA_SUBDIR)); // Ensure raw data dir exists early

    const files = fs.readdirSync(INPUT_DIR);
    // Use a Map to avoid duplicates based on cleaned ID during initial scan
    const tempMetaMap = new Map();

    for (const file of files) {
        if (file.endsWith('.json')) {
            const filePath = path.join(INPUT_DIR, file);
            const summary = processFile(filePath); // Process the file

            if (summary) {
                // Add or update in the temporary map (last one processed wins for a given ID)
                tempMetaMap.set(summary.ipo_id, summary);
            }
        }
    }

    // Convert map values to array for global state and further processing
    allIposMeta = Array.from(tempMetaMap.values());

    console.log(`Initial scan complete. Found ${allIposMeta.length} valid IPOs.`);

    // Generate initial output files based on the scanned data
    generateOutputFiles(allIposMeta);

    // Start watching the directory
    startWatching();
}

// Function to start watching the input directory for changes
function startWatching() {
    console.log(`\nWatching directory ${INPUT_DIR} for changes (.json files)...`);

    const watcher = chokidar.watch(path.join(INPUT_DIR, '*.json'), {
        persistent: true,
        ignoreInitial: true, // Don't trigger 'add' for files already present on start (handled by initialScan)
        awaitWriteFinish: { // Wait for files to be fully written before processing
            stabilityThreshold: 500, // milliseconds
            pollInterval: 100 // milliseconds
        },
        // Add ignored patterns if needed (e.g., temporary files created during scraping)
        // ignored: ['*.tmp', '*.partial']
    });

    watcher
        .on('add', filePath => {
            console.log(`Watcher detected new file: ${filePath}`);
            processAndUpdateMeta(filePath);
        })
        .on('change', filePath => {
             console.log(`Watcher detected changed file: ${filePath}`);
             processAndUpdateMeta(filePath);
        })
        .on('error', error => console.error(`Watcher error: ${error}`));

    // Optional: Handle 'unlink' if files are deleted and you want to remove them from meta/output
    // watcher.on('unlink', filePath => {
    //     console.log(`Watcher detected removed file: ${filePath}`);
    //     // To handle unlink robustly:
    //     // 1. Determine the cleaned ID from the deleted filePath (might require parsing filename)
    //     // 2. Find and remove the corresponding entry from allIposMeta
    //     // 3. Remove the raw data file from the output/raw folder
    //     // 4. Re-generate all output files
    //     // This adds significant complexity, so it's commented out by default.
    // });
}

// --- Execute the setup process ---
// This function starts the initial scan and then sets up the watcher.
function setupProcessingAndWatching() {
    ensureDir(OUTPUT_DIR); // Ensure the main output directory exists before anything else
    initialScan();
}

// Run the main setup function
setupProcessingAndWatching();