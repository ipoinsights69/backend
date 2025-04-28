const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const ipoController = require('../controllers/ipoController');

/**
 * @route   GET /api/ipos
 * @desc    Get paginated list of IPOs with filtering and sorting options
 * @access  Public
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isString(),
  query('year').optional().isInt().toInt(),
  query('status').optional().isIn(['upcoming', 'open', 'closed', 'listed']),
  query('minPrice').optional().isFloat().toFloat(),
  query('maxPrice').optional().isFloat().toFloat()
], ipoController.getIpos);

/**
 * @route   GET /api/ipos/search
 * @desc    Search IPOs by keyword
 * @access  Public
 */
router.get('/search', [
  query('q').isString().isLength({ min: 2 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], ipoController.searchIpos);

/**
 * @route   GET /api/ipos/performance
 * @desc    Get IPOs sorted by performance metrics
 * @access  Public
 */
router.get('/performance', [
  query('type').optional().isIn(['best', 'worst']),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('year').optional().isInt().toInt()
], ipoController.getPerformance);

/**
 * @route   GET /api/ipos/categories
 * @desc    Get IPOs categorized by sector
 * @access  Public
 */
router.get('/categories', [
  query('category').optional().isString(),
  query('year').optional().isInt().toInt()
], ipoController.getCategories);

/**
 * @route   GET /api/ipos/stats
 * @desc    Get IPO statistics
 * @access  Public
 */
router.get('/stats', [
  query('year').optional().isInt().toInt()
], ipoController.getStats);

/**
 * @route   GET /api/ipos/status/:status
 * @desc    Get IPOs by status
 * @access  Public
 */
router.get('/status/:status', [
  param('status').isIn(['upcoming', 'open', 'closed', 'listed']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('year').optional().isInt().toInt()
], ipoController.getIposByStatus);

/**
 * @route   GET /api/ipos/ids
 * @desc    Get all IPO IDs
 * @access  Public
 */
router.get('/ids', ipoController.getIpoIds);

/**
 * @route   GET /api/ipos/years
 * @desc    Get years with IPO data
 * @access  Public
 */
router.get('/years', ipoController.getIpoYears);

/**
 * @route   GET /api/ipos/:id
 * @desc    Get basic IPO information by ID
 * @access  Public
 */
router.get('/:id', [
  param('id').isString().notEmpty()
], ipoController.getIpoById);

/**
 * @route   GET /api/ipos/:id/detail
 * @desc    Get enhanced IPO information with additional calculated fields
 * @access  Public
 */
router.get('/:id/detail', [
  param('id').isString().notEmpty()
], ipoController.getIpoDetail);

/**
 * @route   GET /api/ipos/:id/sections
 * @desc    Get available sections for an IPO
 * @access  Public
 */
router.get('/:id/sections', [
  param('id').isString().notEmpty()
], ipoController.getIpoSections);

/**
 * @route   GET /api/ipos/:id/section
 * @desc    Get a specific section of IPO data
 * @access  Public
 */
router.get('/:id/section', [
  param('id').isString().notEmpty(),
  query('name').isIn(['basic', 'about', 'financials', 'faqs', 'promoters', 'listing', 'subscription'])
], ipoController.getIpoSection);

module.exports = router; 