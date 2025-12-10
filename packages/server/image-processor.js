/**
 * Image Processing Utility
 * Handles automatic image resizing, format conversion, and compression on upload
 * @category server
 * @module image-processor
 */

const path = require("path");
const fs = require("fs").promises;

// Lazy load resizer to avoid issues if sharp can't be installed
let resizer = null;
function getResizer() {
  if (!resizer) {
    resizer = require("resize-with-sharp-or-jimp");
  }
  return resizer;
}

/**
 * Process an image file according to the specified options
 * @param {Object} options - Processing options
 * @param {string} options.sourcePath - Path to the source image file
 * @param {string} options.targetPath - Path to save the processed image
 * @param {number} [options.width] - Target width in pixels
 * @param {number} [options.height] - Target height in pixels
 * @param {string} [options.format] - Target format (webp, jpeg, png, original)
 * @param {number} [options.quality] - Compression quality (1-100)
 * @returns {Promise<{success: boolean, processedPath: string, error?: string}>}
 */
async function processImage(options) {
  const {
    sourcePath,
    targetPath,
    width,
    height,
    format,
    quality = 85,
  } = options;

  try {
    // Check if source file exists
    try {
      await fs.access(sourcePath);
    } catch (err) {
      return {
        success: false,
        error: `Source file not found: ${sourcePath}`,
      };
    }

    // If no processing is needed, just return the original
    if (!width && !height && (!format || format === "original" || format === "")) {
      return {
        success: true,
        processedPath: sourcePath,
      };
    }

    // Determine output format and path
    let outputPath = targetPath;
    if (format && format !== "original" && format !== "") {
      const parsedPath = path.parse(targetPath);
      outputPath = path.join(
        parsedPath.dir,
        `${parsedPath.name}.${format}`
      );
    }

    // Prepare options for resizer
    const resizerOptions = {
      fromFileName: sourcePath,
      toFileName: outputPath,
    };

    // Add dimensions if specified
    if (width) resizerOptions.width = width;
    if (height) resizerOptions.height = height;

    // Use resize-with-sharp-or-jimp for processing
    const resizerFn = getResizer();
    await resizerFn(resizerOptions);

    return {
      success: true,
      processedPath: outputPath,
    };
  } catch (error) {
    console.error("Image processing error:", error);
    return {
      success: false,
      error: error.message || "Image processing failed",
      processedPath: sourcePath, // Fallback to original
    };
  }
}

/**
 * Process image on upload based on field attributes
 * @param {Object} params
 * @param {string} params.filePath - Path to the uploaded file
 * @param {string} params.mimetype - MIME type of the file
 * @param {Object} params.fieldAttributes - Field attributes containing processing options
 * @param {boolean} [params.fieldAttributes.process_images] - Whether to process images
 * @param {number} [params.fieldAttributes.target_width] - Target width
 * @param {number} [params.fieldAttributes.target_height] - Target height
 * @param {string} [params.fieldAttributes.target_format] - Target format
 * @param {number} [params.fieldAttributes.compression_quality] - Compression quality
 * @param {boolean} [params.fieldAttributes.keep_original] - Whether to keep the original file
 * @returns {Promise<{processedPath: string, originalPath?: string, error?: string}>}
 */
async function processUploadedImage(params) {
  const { filePath, mimetype, fieldAttributes = {} } = params;

  // Check if this is an image and processing is enabled
  if (!mimetype || !mimetype.startsWith("image/")) {
    return { processedPath: filePath };
  }

  if (!fieldAttributes.process_images) {
    return { processedPath: filePath };
  }

  const {
    target_width,
    target_height,
    target_format,
    compression_quality = 85,
    keep_original = false,
  } = fieldAttributes;

  // If no processing options are specified, return original
  if (!target_width && !target_height && (!target_format || target_format === "")) {
    return { processedPath: filePath };
  }

  let originalPath = null;

  // If we need to keep the original, rename it
  if (keep_original) {
    const parsedPath = path.parse(filePath);
    originalPath = path.join(
      parsedPath.dir,
      `_original_${parsedPath.base}`
    );
    try {
      await fs.rename(filePath, originalPath);
    } catch (err) {
      // If rename fails, log but continue with processing
      console.error("Failed to rename original file:", err);
      originalPath = null;
    }
  }

  const sourceForProcessing = originalPath || filePath;

  // Process the image
  const result = await processImage({
    sourcePath: sourceForProcessing,
    targetPath: filePath,
    width: target_width,
    height: target_height,
    format: target_format,
    quality: compression_quality,
  });

  if (!result.success) {
    // If processing failed and we moved the original, move it back
    if (originalPath) {
      try {
        await fs.rename(originalPath, filePath);
        originalPath = null;
      } catch (err) {
        console.error("Failed to restore original file:", err);
      }
    }
    return {
      processedPath: filePath,
      error: result.error,
    };
  }

  // If format changed, update the processed path
  const processedPath = result.processedPath;

  return {
    processedPath,
    originalPath: keep_original ? originalPath : undefined,
  };
}

module.exports = {
  processImage,
  processUploadedImage,
};
