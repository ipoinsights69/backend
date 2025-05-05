const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
// Remove MongoDB connection import
// const { connectToDatabase } = require('./utils/dbConnect');
const ipoRoutes = require('./routes/ipoRoutes');
const validateRequest = require('./middlewares/validateRequest');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Create Express app
const app = express();

// Set port
const PORT = process.env.API_PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// API Routes
app.use('/api/ipos', validateRequest, ipoRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the IPO API',
    version: '1.0',
    documentation: '/api-docs'
  });
});

// Swagger documentation
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'IPO API',
    version: '1.0.0',
    description: 'API for accessing IPO data'
  },
  servers: [
    {
      url: '/api',
      description: 'API Server'
    }
  ],
  paths: {
    '/ipos/homepage': {
      get: {
        summary: 'Get comprehensive data for homepage display',
        description: 'Returns detailed data for the homepage including current IPOs, upcoming IPOs, recently listed IPOs, featured IPOs, top listing gains IPOs, latest news, and educational content',
        responses: {
          '200': {
            description: 'Homepage data retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    hero_section: {
                      type: 'object',
                      description: 'Hero section data including value proposition'
                    },
                    current_year_summary: {
                      type: 'object',
                      description: 'Summary statistics for the current year including IPO counts, performance metrics, and top sectors',
                      properties: {
                        year: {
                          type: 'integer',
                          description: 'Current year'
                        },
                        total_ipos: {
                          type: 'integer',
                          description: 'Total number of IPOs in the current year'
                        },
                        open_ipos: {
                          type: 'integer',
                          description: 'Number of currently open IPOs'
                        },
                        upcoming_ipos: {
                          type: 'integer',
                          description: 'Number of upcoming IPOs'
                        },
                        listed_ipos: {
                          type: 'integer',
                          description: 'Number of listed IPOs'
                        },
                        closed_ipos: {
                          type: 'integer',
                          description: 'Number of closed IPOs'
                        },
                        total_raised_crore: {
                          type: 'number',
                          description: 'Total amount raised in crores'
                        },
                        avg_listing_gain: {
                          type: 'string',
                          description: 'Average listing gain formatted as a percentage'
                        },
                        successful_ipos: {
                          type: 'integer',
                          description: 'Number of IPOs with positive listing gains'
                        },
                        top_sectors: {
                          type: 'array',
                          description: 'Top sectors by number of IPOs'
                        },
                        highest_gain: {
                          type: 'object',
                          description: 'IPO with the highest listing gain'
                        },
                        lowest_gain: {
                          type: 'object',
                          description: 'IPO with the lowest listing gain'
                        }
                      }
                    },
                    current_ipos: {
                      type: 'array',
                      description: 'List of currently open IPOs'
                    },
                    upcoming_ipos: {
                      type: 'array',
                      description: 'List of upcoming IPOs'
                    },
                    recent_ipos: {
                      type: 'array',
                      description: 'List of recently listed IPOs'
                    },
                    featured_ipos: {
                      type: 'array',
                      description: 'Featured IPOs with detailed information'
                    },
                    top_listing_gains: {
                      type: 'object',
                      description: 'IPOs with highest listing day gains, including all-time and current year (2025)',
                      properties: {
                        all_time: {
                          type: 'array',
                          description: 'All-time top-performing IPOs by listing gains'
                        },
                        current_year: {
                          type: 'array',
                          description: 'Current year (2025) top-performing IPOs by listing gains'
                        }
                      }
                    },
                    latest_news: {
                      type: 'array',
                      description: 'Latest IPO news and updates'
                    },
                    quick_links: {
                      type: 'object',
                      description: 'Quick links to important sections'
                    },
                    educational_snippets: {
                      type: 'array',
                      description: 'Educational content about IPO investing'
                    },
                    meta: {
                      type: 'object',
                      description: 'Metadata about the API response'
                    }
                  }
                }
              }
            }
          },
          '500': {
            description: 'Server error while fetching homepage data'
          }
        }
      }
    },
    '/ipos': {
      get: {
        summary: 'Get paginated list of IPOs with filtering and sorting options',
        parameters: [
          {
            name: 'page',
            in: 'query',
            description: 'Page number',
            schema: { type: 'integer', default: 1 }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Results per page (max 100)',
            schema: { type: 'integer', default: 10 }
          },
          {
            name: 'sort',
            in: 'query',
            description: 'Sort field with direction',
            schema: { 
              type: 'string',
              default: '-opening_date',
              enum: [
                'opening_date', '-opening_date',
                'year', '-year',
                'issue_price_numeric', '-issue_price_numeric',
                'performance_score', '-performance_score'
              ]
            }
          },
          {
            name: 'year',
            in: 'query',
            description: 'Filter by year',
            schema: { type: 'integer' }
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filter by status',
            schema: { 
              type: 'string',
              enum: ['upcoming', 'open', 'closed', 'listed']
            }
          },
          {
            name: 'minPrice',
            in: 'query',
            description: 'Minimum issue price',
            schema: { type: 'number' }
          },
          {
            name: 'maxPrice',
            in: 'query',
            description: 'Maximum issue price',
            schema: { type: 'number' }
          }
        ],
        responses: {
          '200': {
            description: 'List of IPOs with pagination information'
          }
        }
      }
    },
    '/ipos/search': {
      get: {
        summary: 'Search IPOs by keyword',
        parameters: [
          {
            name: 'q',
            in: 'query',
            description: 'Search query (min 2 characters)',
            required: true,
            schema: { type: 'string', minLength: 2 }
          },
          {
            name: 'page',
            in: 'query',
            description: 'Page number',
            schema: { type: 'integer', default: 1 }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Results per page (max 100)',
            schema: { type: 'integer', default: 10 }
          }
        ],
        responses: {
          '200': {
            description: 'Search results'
          }
        }
      }
    },
    '/ipos/performance': {
      get: {
        summary: 'Get IPOs sorted by performance metrics',
        parameters: [
          {
            name: 'type',
            in: 'query',
            description: 'Performance type',
            schema: { 
              type: 'string',
              enum: ['best', 'worst'],
              default: 'best'
            }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Number of results (max 100)',
            schema: { type: 'integer', default: 10 }
          },
          {
            name: 'year',
            in: 'query',
            description: 'Filter by year',
            schema: { type: 'integer' }
          }
        ],
        responses: {
          '200': {
            description: 'IPOs sorted by performance'
          }
        }
      }
    }
    // More paths would be defined here
  }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: 'API endpoint not found',
    path: req.path
  });
});

// Start server without MongoDB connection
const startServer = async () => {
  try {
    // Start Express server directly without MongoDB connection
    app.listen(PORT, () => {
      console.log(`API Server running on port ${PORT}`);
      console.log(`Documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if this file is executed directly
if (require.main === module) {
  startServer();
}

// Export for testing
module.exports = app; 