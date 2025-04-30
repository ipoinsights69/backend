const mongoose = require('mongoose');

const IpoDetailSchema = new mongoose.Schema({
  company_name: { type: String, required: true },
  year: { type: Number, required: true },
  uploaded_at: { type: Date },
  
  // Basic details
  logo_url: { type: String },
  company_overview: { type: String },
  ipo_date: { type: String },
  price_band: { type: String },
  issue_size: { type: String },
  lot_size: { type: Number },
  listing_date: { type: String },
  
  // Detailed sections (may vary by IPO)
  about: { type: mongoose.Schema.Types.Mixed },
  timeline: { type: mongoose.Schema.Types.Mixed },
  financials: { type: mongoose.Schema.Types.Mixed },
  subscription_status: { type: mongoose.Schema.Types.Mixed },
  listing_details: { type: mongoose.Schema.Types.Mixed },
  objectives: { type: mongoose.Schema.Types.Mixed },
  promoter_holding: { type: mongoose.Schema.Types.Mixed },
  lead_managers: { type: mongoose.Schema.Types.Mixed },
  registrar: { type: mongoose.Schema.Types.Mixed },
  recommendation_summary: { type: mongoose.Schema.Types.Mixed },
  faqs: { type: mongoose.Schema.Types.Mixed },
  basicDetails: { type: mongoose.Schema.Types.Mixed },
  tentativeDetails: { type: mongoose.Schema.Types.Mixed },
  kpi: { type: mongoose.Schema.Types.Mixed },
  subscriptionDetails: { type: mongoose.Schema.Types.Mixed },
  contactDetails: { type: mongoose.Schema.Types.Mixed },
  registrarDetails: { type: mongoose.Schema.Types.Mixed },
  leadManagers: { type: mongoose.Schema.Types.Mixed },
  leadManagerReports: { type: mongoose.Schema.Types.Mixed },
  listingDayTrading: { type: mongoose.Schema.Types.Mixed },
  prospectusLinks: { type: mongoose.Schema.Types.Mixed },
  reservation: { type: mongoose.Schema.Types.Mixed },
  anchorInvestors: { type: mongoose.Schema.Types.Mixed },
  additionalTables: { type: mongoose.Schema.Types.Mixed },
  
  // API-specific fields
  ipo_id: { type: String },
  ipo_name: { type: String }
}, {
  // Allow schema less (unstructured) data due to varying fields
  strict: false,
  // Enable virtual fields in JSON
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field to compute ipo_id if not present
IpoDetailSchema.virtual('computed_ipo_id').get(function() {
  if (this.ipo_id) return this.ipo_id;
  
  // Create an ID from company name and year
  return `${this.year}_${this.company_name.toLowerCase().replace(/\s+/g, '_')}`;
});

// Virtual field to compute ipo_name if not present
IpoDetailSchema.virtual('computed_ipo_name').get(function() {
  if (this.ipo_name) return this.ipo_name;
  
  return `${this.company_name} IPO`;
});

// Pre-save middleware to set default fields
IpoDetailSchema.pre('save', function(next) {
  if (!this.ipo_id) {
    this.ipo_id = this.computed_ipo_id;
  }
  
  if (!this.ipo_name) {
    this.ipo_name = this.computed_ipo_name;
  }
  
  next();
});

// Method to get available sections for an IPO
IpoDetailSchema.methods.getAvailableSections = function() {
  const sections = {
    basic: true,  // Basic details are always available
    about: !!this.about,
    financials: !!this.financials,
    faqs: !!(this.faqs && Array.isArray(this.faqs) && this.faqs.length > 0),
    promoters: !!(this.promoter_holding || this.promoterHolding),
    listing: !!(this.listing_details || this.listingDetails || this.listingDayTrading),
    subscription: !!(this.subscription_status || this.subscriptionStatus || this.subscriptionDetails)
  };
  
  return sections;
};

// Method to get formatted data for a specific section
IpoDetailSchema.methods.getSectionData = function(sectionName) {
  switch(sectionName) {
    case 'basic':
      return {
        heading: `${this.company_name} IPO Details`,
        data: this.basicDetails || {}
      };
    case 'about':
      return {
        heading: `About ${this.company_name}`,
        data: this.about || { summary: '', details: '' }
      };
    case 'financials':
      return {
        heading: `${this.company_name} Financial Information (Restated)`,
        data: this.financials || {}
      };
    case 'faqs':
      return {
        heading: `${this.company_name} IPO FAQs`,
        data: this.faqs || []
      };
    case 'promoters':
      return {
        heading: `${this.company_name} Promoters & Holding`,
        data: this.promoter_holding || this.promoterHolding || {}
      };
    case 'listing':
      return {
        heading: `${this.company_name} Listing Details`,
        data: this.listing_details || this.listingDetails || this.listingDayTrading || {}
      };
    case 'subscription':
      return {
        heading: `${this.company_name} Subscription Status`,
        data: this.subscription_status || this.subscriptionStatus || this.subscriptionDetails || {}
      };
    default:
      return {
        heading: `${this.company_name} IPO Information`,
        data: {}
      };
  }
};

// Static method to ensure indexes
IpoDetailSchema.statics.ensureIndexes = async function() {
  // Create indexes for common queries
  await this.collection.createIndex({ year: 1 });
  await this.collection.createIndex({ company_name: 1, year: 1 }, { unique: true });
  await this.collection.createIndex({ ipo_id: 1 });
};

const IpoDetail = mongoose.model('IpoDetail', IpoDetailSchema, 'ipo_details');

module.exports = IpoDetail; 