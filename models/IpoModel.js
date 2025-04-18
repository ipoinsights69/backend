const mongoose = require('mongoose');

// Schema for IPO data
const ipoSchema = new mongoose.Schema({
  ipo_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Remove any conflicting ipoId field if it exists
  ipoId: {
    type: String,
    select: false // Exclude from queries
  },
  ipo_name: {
    type: String,
    required: true,
    index: true
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  company_name: {
    type: String,
    index: true
  },
  source_url: {
    type: String,
    required: true
  },
  data: {
    type: Object
  },
  opening_date: {
    type: Date,
    index: true
  },
  closing_date: {
    type: Date
  },
  listing_date: {
    type: Date
  },
  issue_price: {
    type: String
  },
  issue_price_numeric: {
    type: Number
  },
  issue_size: {
    type: String
  },
  issue_size_numeric: {
    type: Number
  },
  lot_size: {
    type: Number
  },
  allotment_status: {
    type: String
  },
  listing_gains: {
    type: String
  },
  listing_gains_numeric: {
    type: Number,
    index: true
  },
  status: {
    type: String,
    enum: ['upcoming', 'open', 'closed', 'listed', 'withdrawn'],
    default: 'upcoming',
    index: true
  },
  scraped_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  raw_data: {
    type: Object
  },
  logo_url: {
    type: String
  }
}, {
  timestamps: true,
  strict: false // Allows flexibility for additional fields
});

// Index for efficient searches
ipoSchema.index({ ipo_name: 'text', company_name: 'text' });

// Verify text index exists on startup
ipoSchema.statics.verifyIndexes = async function() {
  try {
    const indexes = await this.collection.getIndexes();
    let hasTextIndex = false;
    
    console.log('Current MongoDB indexes:');
    Object.keys(indexes).forEach(indexName => {
      // Properly stringify the index key
      const indexKey = JSON.stringify(indexes[indexName].key || {});
      console.log(` - ${indexName}: ${indexKey}`);
      
      // Check if we have a text index on the desired fields
      if (indexes[indexName].key && indexes[indexName].key._fts) {
        hasTextIndex = true;
        console.log(`   ✓ Text index found: ${indexName}`);
      }
    });
    
    if (hasTextIndex) {
      console.log('Text index already exists. Search functionality should work correctly.');
    } else {
      console.log('Warning: No text index found. Search performance may be degraded.');
    }
    
    return true;
  } catch (error) {
    console.error('Error checking MongoDB indexes:', error);
    return false;
  }
};

// Middleware to ensure proper ID fields before save
ipoSchema.pre('save', function(next) {
  // Make sure ipo_id exists and is not null/undefined
  if (!this.ipo_id) {
    if (this.ipoId) {
      this.ipo_id = this.ipoId;
    } else if (this.year && this.ipo_name) {
      // Generate an ID if needed
      const sanitizedName = this.ipo_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      this.ipo_id = `${this.year}_${sanitizedName}`;
    } else {
      return next(new Error('Cannot generate ipo_id: missing required fields'));
    }
  }
  // Remove ipoId to avoid conflicts
  this.ipoId = undefined;
  
  next();
});

// Create or update IPO data
ipoSchema.statics.upsertIpo = async function(ipoData) {
  // Ensure ipo_id exists
  if (!ipoData.ipo_id) {
    if (ipoData.ipoId) {
      ipoData.ipo_id = ipoData.ipoId;
      delete ipoData.ipoId; // Remove to avoid conflicts
    } else if (ipoData.year && (ipoData.ipo_name || ipoData.company_name)) {
      const name = ipoData.ipo_name || ipoData.company_name;
      const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      ipoData.ipo_id = `${ipoData.year}_${sanitizedName}`;
    } else {
      throw new Error('IPO ID is required for upserting and cannot be generated from available data');
    }
  }
  
  // Create a processed version with important fields extracted to top level
  const processedData = {
    ...ipoData,
    company_name: ipoData.metadata?.company_name || ipoData.ipo_name || ipoData.company_name,
    year: ipoData.metadata?.year || ipoData.year || new Date().getFullYear(),
    source_url: ipoData._source_url || ipoData.source_url || '',
    scraped_at: new Date(ipoData._scraped_at || Date.now()),
    updated_at: new Date(),
  };

  // Prioritize direct date fields first, then check in multiple possible locations
  processedData.opening_date = parseDate(
    ipoData.opening_date || 
    ipoData.basicDetails?.ipoOpenDate || 
    ipoData.data?.opening_date || 
    ipoData.data?.issue_opening_date ||
    // Extract from ipoDate format "January 7, 2025 to January 9, 2025"
    (ipoData.basicDetails?.ipoDate ? ipoData.basicDetails.ipoDate.split(' to ')[0] : null)
  );
  
  processedData.closing_date = parseDate(
    ipoData.closing_date || 
    ipoData.basicDetails?.ipoCloseDate || 
    ipoData.data?.closing_date || 
    ipoData.data?.issue_closing_date ||
    // Extract from ipoDate format "January 7, 2025 to January 9, 2025"
    (ipoData.basicDetails?.ipoDate ? ipoData.basicDetails.ipoDate.split(' to ')[1] : null)
  );
  
  processedData.listing_date = parseDate(
    ipoData.listing_date || 
    ipoData.basicDetails?.ipoListingDate || 
    ipoData.data?.listing_date
  );

  // Extract other key fields
  processedData.issue_price = ipoData.basicDetails?.issuePrice || ipoData.data?.issue_price || ipoData.data?.price_band || ipoData.issue_price;
  processedData.issue_size = ipoData.basicDetails?.issueSize || ipoData.data?.issue_size || ipoData.data?.issue_amount || ipoData.issue_size;
  processedData.lot_size = parseInt(ipoData.basicDetails?.lotSize || ipoData.data?.lot_size || ipoData.lot_size || '0', 10) || null;
  processedData.logo_url = ipoData.logo || null;

  // Extract numeric values for price and size for aggregation
  if (processedData.issue_price) {
    const priceMatch = processedData.issue_price.match(/\d+(\.\d+)?/);
    processedData.issue_price_numeric = priceMatch ? parseFloat(priceMatch[0]) : null;
  }
  
  if (processedData.issue_size) {
    const sizeMatch = processedData.issue_size.match(/\d+(\.\d+)?/);
    processedData.issue_size_numeric = sizeMatch ? parseFloat(sizeMatch[0]) : null;
  }

  // Extract listing gains percentage for performance tracking
  if (processedData.listing_gains) {
    const gainsMatch = processedData.listing_gains.match(/(-?\d+(\.\d+)?)\s*%/);
    processedData.listing_gains_numeric = gainsMatch ? parseFloat(gainsMatch[1]) : null;
  } else if (ipoData.listingDayTrading && ipoData.listingDayTrading.data) {
    // Calculate listing gains from listing day trading data
    const data = ipoData.listingDayTrading.data;
    const exchange = Object.keys(data.final_issue_price || {})[0];
    
    if (exchange && data.final_issue_price[exchange] && data.last_trade[exchange]) {
      const issuePrice = parseFloat(data.final_issue_price[exchange]);
      const lastTradePrice = parseFloat(data.last_trade[exchange]);
      
      if (!isNaN(issuePrice) && !isNaN(lastTradePrice) && issuePrice > 0) {
        const listingGain = ((lastTradePrice - issuePrice) / issuePrice) * 100;
        processedData.listing_gains = `${listingGain.toFixed(2)}%`;
        processedData.listing_gains_numeric = parseFloat(listingGain.toFixed(2));
      }
    }
  }

  // Determine status based on dates
  processedData.status = determineIpoStatus(processedData);

  // Upsert the document
  return this.findOneAndUpdate(
    { ipo_id: processedData.ipo_id },
    processedData,
    { 
      upsert: true, 
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

// Helper to parse dates
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  try {
    // Handle different date formats
    if (typeof dateStr === 'string') {
      // Format: "Tue, Jan 7, 2025"
      if (dateStr.includes(',')) {
        return new Date(dateStr);
      }
      
      // Format: "January 7, 2025"
      const parts = dateStr.split(' ');
      if (parts.length >= 3) {
        // Try to parse as is first
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
        
        // Try parsing with just month, day, year
        const monthIndex = [
          'january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december'
        ].indexOf(parts[0].toLowerCase());
        
        if (monthIndex !== -1) {
          // Parse day (remove comma if present)
          const day = parseInt(parts[1].replace(',', ''), 10);
          // Parse year
          const year = parseInt(parts[parts.length - 1], 10);
          
          return new Date(year, monthIndex, day);
        }
      }
    }
    
    // Default parsing
    return new Date(dateStr);
  } catch (e) {
    console.error(`Error parsing date: ${dateStr}`, e);
    return null;
  }
}

// Determine IPO status based on dates
function determineIpoStatus(ipo) {
  const now = new Date();
  
  if (!ipo.opening_date) return 'upcoming';
  
  if (ipo.listing_date && now >= ipo.listing_date) return 'listed';
  if (ipo.closing_date && now >= ipo.closing_date) return 'closed';
  if (now >= ipo.opening_date) return 'open';
  
  return 'upcoming';
}

// Check if the model already exists to prevent "OverwriteModelError"
const IpoModel = mongoose.models.Ipo || mongoose.model('Ipo', ipoSchema);

module.exports = IpoModel; 