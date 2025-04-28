const mongoose = require('mongoose');

const IpoSchema = new mongoose.Schema({
  company_name: { type: String, required: true },
  ipo_name: { type: String },
  year: { type: Number, required: true },
  detail_url: { type: String },
  opening_date: { type: String },
  closing_date: { type: String },
  listing_date: { type: String },
  issue_price: { type: String },
  issue_amount: { type: String },
  listing_at: { type: String },
  lead_manager: { type: String },
  _fetched_at: { type: Date },
  uploaded_at: { type: Date },
  
  // Computed/normalized fields for API
  ipo_id: { type: String },
  issue_price_numeric: { type: Number },
  performance_score: { type: Number },
  listing_gains: { type: String },
  status: { type: String },
  logo_url: { type: String },
  category: { type: String }
}, {
  // Allow undefined fields to support varying data
  strict: false,
  // Enable virtual getters in JSON output
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create a virtual field for ipo_id if not set directly
IpoSchema.virtual('computed_ipo_id').get(function() {
  if (this.ipo_id) return this.ipo_id;
  
  // Create an ID from company name and year
  return `${this.year}_${this.company_name.toLowerCase().replace(/\s+/g, '_')}`;
});

// Pre-save middleware to set ipo_id
IpoSchema.pre('save', function(next) {
  if (!this.ipo_id) {
    this.ipo_id = this.computed_ipo_id;
  }
  
  // Extract numeric value from issue_price
  if (this.issue_price && !this.issue_price_numeric) {
    const priceMatch = this.issue_price.match(/\d+(?:\.\d+)?/);
    if (priceMatch) {
      this.issue_price_numeric = parseFloat(priceMatch[0]);
    }
  }
  
  // Determine IPO status based on dates
  if (!this.status) {
    this.status = this.determineStatus();
  }
  
  next();
});

// Method to determine IPO status based on dates
IpoSchema.methods.determineStatus = function() {
  const now = new Date();
  
  // Parse dates safely
  const openingDate = this.opening_date ? new Date(this.opening_date) : null;
  const closingDate = this.closing_date ? new Date(this.closing_date) : null;
  const listingDate = this.listing_date ? new Date(this.listing_date) : null;

  // Handle invalid dates
  if (openingDate && isNaN(openingDate.getTime())) return 'unknown';
  if (closingDate && isNaN(closingDate.getTime())) return 'unknown';
  if (listingDate && isNaN(listingDate.getTime())) return 'unknown';
  
  // Determine status based on dates
  if (openingDate && now < openingDate) {
    return 'upcoming';
  } else if (openingDate && closingDate && now >= openingDate && now <= closingDate) {
    return 'open';
  } else if (closingDate && listingDate && now > closingDate && now < listingDate) {
    return 'closed';
  } else if (listingDate && now >= listingDate) {
    return 'listed';
  }
  
  // Fallback if dates are missing or invalid
  return 'unknown';
};

// Static method to ensure indexes for performance
IpoSchema.statics.ensureIndexes = async function() {
  // Create indexes for common queries
  await this.collection.createIndex({ year: 1 });
  await this.collection.createIndex({ ipo_id: 1 }, { unique: true });
  await this.collection.createIndex({ status: 1 });
  await this.collection.createIndex({ company_name: 'text', ipo_name: 'text' });
  await this.collection.createIndex({ category: 1 });
  await this.collection.createIndex({ issue_price_numeric: 1 });
  await this.collection.createIndex({ performance_score: 1 });
};

// Create model from schema
const Ipo = mongoose.model('Ipo', IpoSchema, 'ipo_listings');

module.exports = Ipo; 