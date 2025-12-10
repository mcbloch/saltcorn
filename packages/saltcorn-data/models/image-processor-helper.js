/**
 * Image Processing Helper
 * Bridges the data layer with the server's image processor
 * @category saltcorn-data
 * @module models/image-processor-helper
 */

const path = require("path");
const fsp = require("fs").promises;

// Cache the processor module once loaded
let imageProcessorModule = null;
let processorLoadAttempted = false;

/**
 * Process uploaded image - uses dynamic require to avoid circular dependencies
 */
async function processUploadedImage(params) {
  // Only attempt to load once
  if (!processorLoadAttempted) {
    processorLoadAttempted = true;
    try {
      // Try to load the image processor from server package
      // This will only work when running in server context
      imageProcessorModule = require("@saltcorn/server/image-processor");
    } catch (err) {
      // Processor not available - this is okay for some contexts
      console.log("Image processor not available in this context");
    }
  }

  if (!imageProcessorModule) {
    // Return original file path if processor not available
    return {
      processedPath: params.filePath,
    };
  }

  try {
    return await imageProcessorModule.processUploadedImage(params);
  } catch (err) {
    console.error("Image processing error:", err);
    return {
      processedPath: params.filePath,
      error: err.message,
    };
  }
}

module.exports = {
  processUploadedImage,
};
