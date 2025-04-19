/**
 * IPO Model
 * MongoDB schema for IPO data
 * Optimized for performance with selective indexes and lean queries
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Regular expression for price validation
const priceRegex = /^(₹)?\s*\d+(,\d+)*(\.\d+)?(\s*-\s*(₹)?\s*\d+(,\d+)*(\.\d+)?)?$/;

// Define the IPO schema with optimized indexes for common queries
const ipoSchema = new Schema({
  // Unique identifier for the IPO
  ipo_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // IPO name (e.g. "Company XYZ IPO")
  ipo_name: {
    type: String,
    required: true,
    index: true
  },
  
  // Company name
  company_name: {
    type: String,
    required: true,
    index: true
  },
  
  // Year of the IPO
  year: {
    type: Number,
    required: true,
    index: true
  },
  
  // IPO status: upcoming, open, closed, listed
  status: {
    type: String,
    enum: ['upcoming', 'open', 'closed', 'listed', 'withdrawn', 'unknown'],
    default: 'unknown',
    index: true
  },
  
  // Important dates - only index the most queried fields
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
  
  allotment_date: {
    type: Date
  },
  
  // Price information
  issue_price: {
    type: String,
    validate: {
      validator: function(v) {
        return v === 'TBA' || v === 'N/A' || priceRegex.test(v);
      },
      message: props => `${props.value} is not a valid price format!`
    }
  },
  
  // Numeric value extracted from issue_price for sorting/filtering
  issue_price_numeric: {
    type: Number,
    index: true
  },
  
  face_value: {
    type: String
  },
  
  lot_size: {
    type: Number
  },
  
  issue_size: {
    type: String
  },
  
  listing_gains: {
    type: String
  },
  
  // Numeric value for listing gains for efficient sorting
  listing_gains_numeric: {
    type: Number,
    index: true
  },
  
  // Worst listing gains (based on day's lowest price)
  worst_listing_gains: {
    type: String
  },
  
  // Numeric value for worst listing gains
  worst_listing_gains_numeric: {
    type: Number,
    index: true
  },
  
  // Pre-computed performance score for faster queries
  performance_score: {
    type: Number,
    index: true,
    default: 0
  },
  
  // URLs and media
  source_url: {
    type: String
  },
  
  logo_url: {
    type: String
  },
  
  // Detailed information
  company_description: {
    type: String
  },
  
  // Additional structured details
  basicDetails: {
    type: Map,
    of: Schema.Types.Mixed
  },
  
  financials: {
    type: Map,
    of: Schema.Types.Mixed
  },
  
  subscription: {
    type: Map,
    of: Schema.Types.Mixed
  },
  
  // Metadata
  scrape_date: {
    type: Date,
    default: Date.now
  },
  
  // Trading data for performance calculations
  listingDayTrading: {
    type: Map,
    of: Schema.Types.Mixed
  },
  
  // When performance metrics were last updated
  last_performance_update: {
    type: Date
  }
}, {
  timestamps: true,
  
  // Optimize for MongoDB performance
  versionKey: false, // Don't track versions to reduce document size
  
  // Use selective text indexing for search
  // Remove weights to minimize index size
  index: {
    default_language: 'english'
  }
});

// Create a compound index for common query patterns
ipoSchema.index({ year: -1, status: 1 }); // Frequently queried together
ipoSchema.index({ status: 1, opening_date: -1 }); // For listings by status, sorted by date

// Create a text index only on the most important fields for search
ipoSchema.index({ 
  ipo_name: 'text', 
  company_name: 'text'
});

/**
 * Extract numeric price value from any exchange data
 * @param {Object} exchangeData - Data object with exchange keys
 * @returns {number} - Extracted numeric price or 0
 */
function extractPrice(exchangeData) {
  if (!exchangeData) return 0;

  // Try each exchange in priority order
  const exchanges = ['nse', 'bse', 'nse_sme', 'bse_sme'];
  
  for (const exchange of exchanges) {
    if (exchangeData[exchange] && !isNaN(parseFloat(exchangeData[exchange]))) {
      return parseFloat(exchangeData[exchange]);
    }
  }

  // If no matches in priority list, try any available exchange
  const anyExchange = Object.keys(exchangeData)[0];
  if (anyExchange && !isNaN(parseFloat(exchangeData[anyExchange]))) {
    return parseFloat(exchangeData[anyExchange]);
  }

  return 0;
}

/**
 * Calculate listing gain percentage using the formula:
 * Listing Gain (%) = ((Closing Price - Issue Price) / Issue Price) × 100
 * 
 * @param {number} closingPrice - Closing/last trade price
 * @param {number} issuePrice - Issue price
 * @returns {number|null} - Calculated gain percentage or null
 */
function calculateGainPercentage(closingPrice, issuePrice) {
  if (!issuePrice || issuePrice <= 0 || !closingPrice || closingPrice <= 0) {
    return null;
  }
  
  const gainPercentage = ((closingPrice - issuePrice) / issuePrice) * 100;
  return parseFloat(gainPercentage.toFixed(2));
}

// Pre-save middleware to extract numeric price and calculate performance score
ipoSchema.pre('save', function(next) {
  // Extract numeric value from issue_price for sorting
  if (this.issue_price && typeof this.issue_price === 'string') {
    // Extract first number from price range
    const match = this.issue_price.match(/\d+(,\d+)*(\.\d+)?/);
    if (match) {
      this.issue_price_numeric = parseFloat(match[0].replace(/,/g, ''));
    }
  }
  
  // Try to calculate listing gains directly if listingDayTrading data is available
  // This ensures performance metrics are always up-to-date even during direct model updates
  if (this.status === 'listed' && this.listingDayTrading && this.listingDayTrading.data) {
    const data = this.listingDayTrading.data;
    
    // Extract issue price - prefer from trading data, fallback to model
    let issuePrice = extractPrice(data.final_issue_price);
    if (issuePrice <= 0) {
      issuePrice = this.issue_price_numeric || 0;
    }
    
    // Extract closing and lowest prices
    const lastTradePrice = extractPrice(data.last_trade);
    const lowestPrice = extractPrice(data.low) || extractPrice(data.day_low);
    
    // Calculate both metrics if issue price is available
    if (issuePrice > 0) {
      // Calculate best listing gain (close price)
      const listingGain = calculateGainPercentage(lastTradePrice, issuePrice);
      if (listingGain !== null) {
        this.listing_gains = `${listingGain}%`;
        this.listing_gains_numeric = listingGain;
      }
      
      // Calculate worst listing gain (lowest price)
      const worstListingGain = calculateGainPercentage(lowestPrice || lastTradePrice, issuePrice);
      if (worstListingGain !== null) {
        this.worst_listing_gains = `${worstListingGain}%`;
        this.worst_listing_gains_numeric = worstListingGain;
      }
      
      // Add timestamp for when performance was last calculated
      this.last_performance_update = new Date();
    }
  }
  
  // Calculate performance score
  this.performance_score = calculatePerformanceScore(this);
  
  next();
});

/**
 * Calculate a performance score for the IPO
 * This avoids expensive calculations at query time
 */
function calculatePerformanceScore(ipo) {
  let score = 0;
  
  // Base score on listing gains if available
  if (ipo.listing_gains) {
    const gainsMatch = ipo.listing_gains.match(/(-?\d+(\.\d+)?)/);
    if (gainsMatch) {
      const gainsPct = parseFloat(gainsMatch[1]);
      if (!isNaN(gainsPct)) {
        // Scale to 0-100 range, where 20% gain = 70 points
        score += Math.min(100, 50 + gainsPct * 1);
      }
    }
  }
  
  // Consider worst listing gains in the score calculation
  if (ipo.worst_listing_gains) {
    const worstGainsMatch = ipo.worst_listing_gains.match(/(-?\d+(\.\d+)?)/);
    if (worstGainsMatch) {
      const worstGainsPct = parseFloat(worstGainsMatch[1]);
      if (!isNaN(worstGainsPct)) {
        // Add a smaller weight to worst gains (negative impact on score)
        score -= Math.min(25, Math.abs(worstGainsPct) * 0.25);
      }
    }
  }
  
  // Higher score for larger issues (if data available)
  if (ipo.issue_price_numeric && ipo.issue_price_numeric > 0) {
    score += Math.min(20, ipo.issue_price_numeric / 10);
  }
  
  // Small bonus for recent IPOs
  const currentYear = new Date().getFullYear();
  if (ipo.year && ipo.year >= currentYear - 3) {
    score += 5 * (1 - ((currentYear - ipo.year) / 3));
  }
  
  return Math.round(score);
}

// Instance method to get a simplified version of the IPO
// This helps generate smaller responses for lists
ipoSchema.methods.toSimple = function() {
  return {
    ipo_id: this.ipo_id,
    ipo_name: this.ipo_name,
    company_name: this.company_name,
    year: this.year,
    status: this.status,
    opening_date: this.opening_date,
    closing_date: this.closing_date,
    listing_date: this.listing_date,
    issue_price: this.issue_price,
    listing_gains: this.listing_gains,
    worst_listing_gains: this.worst_listing_gains,
    logo_url: this.logo_url,
    performance_score: this.performance_score
  };
};

// Static methods optimized for lean queries
ipoSchema.statics.findByYear = function(year, projection = {}) {
  return this.find({ year }, projection).lean();
};

ipoSchema.statics.findByStatus = function(status, projection = {}) {
  return this.find({ status }, projection).lean();
};

// Get upcoming IPOs with minimal fields for quick loading
ipoSchema.statics.getUpcomingIpos = function(limit = 10) {
  return this.find(
    { status: 'upcoming' },
    'ipo_id ipo_name company_name opening_date closing_date issue_price logo_url'
  )
    .sort({ opening_date: 1 })
    .limit(limit)
    .lean();
};

// Get top performing IPOs efficiently
ipoSchema.statics.getTopPerforming = function(limit = 5) {
  return this.find(
    { performance_score: { $gt: 50 } },
    'ipo_id ipo_name company_name year listing_gains worst_listing_gains performance_score logo_url'
  )
    .sort({ performance_score: -1 })
    .limit(limit)
    .lean();
};

// Add a static method to update performance metrics for a single IPO
ipoSchema.statics.updateIpoPerformance = async function(ipoId) {
  const ipo = await this.findOne({ ipo_id: ipoId });
  if (!ipo || ipo.status !== 'listed') return null;
  
  // Force recalculation by saving the document, which triggers the pre-save hook
  try {
    ipo.markModified('listingDayTrading');
    await ipo.save();
    return {
      ipo_id: ipo.ipo_id,
      listing_gains: ipo.listing_gains,
      worst_listing_gains: ipo.worst_listing_gains,
      updated_at: ipo.last_performance_update
    };
  } catch (error) {
    console.error(`Failed to update performance for IPO ${ipoId}:`, error);
    return null;
  }
};

// Check if model exists before creating it to prevent OverwriteModelError
const IpoModel = mongoose.models.Ipo || mongoose.model('Ipo', ipoSchema);

module.exports = IpoModel; 