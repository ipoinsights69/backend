const mongoose = require('mongoose');
const IpoModel = require('../models/IpoModel');

/**
 * Smart update function that only updates fields that have changed
 * @param {Object} newData - New IPO data to be saved
 * @returns {Promise<Object>} - Updated IPO document or null if no changes
 */
async function smartUpdateIpo(newData) {
  // Ensure ipo_id exists
  if (!newData.ipo_id) {
    throw new Error('IPO ID is required for smart updates');
  }

  try {
    // First, get the existing document
    const existingIpo = await IpoModel.findOne({ ipo_id: newData.ipo_id }).lean();
    
    // If no document exists, create a new one
    if (!existingIpo) {
      console.log(`Creating new IPO document for ${newData.ipo_id}`);
      return await IpoModel.upsertIpo(newData);
    }
    
    // Calculate modified fields by comparing objects
    const updates = {};
    let hasChanges = false;
    
    // Compare and collect only changed fields
    Object.keys(newData).forEach(key => {
      // Skip special fields like _id that shouldn't be compared
      if (key === '_id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') {
        return;
      }
      
      // Compare values - handle nested objects with JSON.stringify
      const existingValue = existingIpo[key];
      const newValue = newData[key];
      
      // Simple comparison for primitive types
      if (typeof newValue !== 'object' || newValue === null) {
        if (existingValue !== newValue) {
          updates[key] = newValue;
          hasChanges = true;
          console.log(`Field '${key}' changed from '${existingValue}' to '${newValue}'`);
        }
      } 
      // Deep comparison for objects using JSON.stringify
      else if (JSON.stringify(existingValue) !== JSON.stringify(newValue)) {
        updates[key] = newValue;
        hasChanges = true;
        console.log(`Object field '${key}' changed`);
      }
    });
    
    // If no changes detected, return existing document
    if (!hasChanges) {
      console.log(`No changes detected for IPO ${newData.ipo_id}`);
      return existingIpo;
    }
    
    // Add update timestamp
    updates.updated_at = new Date();
    
    console.log(`Updating ${Object.keys(updates).length} fields for IPO ${newData.ipo_id}`);
    
    // Update only the changed fields
    return await IpoModel.findOneAndUpdate(
      { ipo_id: newData.ipo_id },
      { $set: updates },
      { new: true }
    );
  } catch (error) {
    console.error(`Error in smart update for IPO ${newData.ipo_id}:`, error);
    throw error;
  }
}

/**
 * Batch process multiple IPOs with smart updates
 * @param {Array} iposData - Array of IPO data objects
 * @returns {Promise<Object>} - Summary of update operations
 */
async function batchSmartUpdate(iposData) {
  if (!Array.isArray(iposData)) {
    throw new Error('Expected an array of IPO data objects');
  }
  
  const results = {
    total: iposData.length,
    updated: 0,
    created: 0,
    unchanged: 0,
    failed: 0,
    errors: []
  };
  
  // Process each IPO
  for (const ipoData of iposData) {
    try {
      // Skip invalid data
      if (!ipoData || !ipoData.ipo_id) {
        results.failed++;
        results.errors.push(`Missing ipo_id in data: ${JSON.stringify(ipoData).substring(0, 100)}...`);
        continue;
      }
      
      const existingIpo = await IpoModel.findOne({ ipo_id: ipoData.ipo_id }).lean();
      
      if (!existingIpo) {
        // Create new document
        await IpoModel.upsertIpo(ipoData);
        results.created++;
      } else {
        // Apply smart update
        const updated = await smartUpdateIpo(ipoData);
        
        // Check if any fields were actually updated
        if (updated.updated_at > existingIpo.updated_at) {
          results.updated++;
        } else {
          results.unchanged++;
        }
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Error processing ${ipoData.ipo_id}: ${error.message}`);
      console.error(`Failed to process IPO ${ipoData.ipo_id}:`, error);
    }
  }
  
  return results;
}

module.exports = {
  smartUpdateIpo,
  batchSmartUpdate
}; 