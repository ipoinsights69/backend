const { validationResult } = require('express-validator');

/**
 * Middleware to validate request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Object|void} - Error response or next middleware
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation error',
      errors: errors.array().map(error => ({
        param: error.param,
        value: error.value,
        msg: error.msg
      })),
      request_parameters: req.method === 'GET' ? req.query : req.body
    });
  }
  
  next();
};

module.exports = validateRequest; 