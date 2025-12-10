/**
 * Image Processing Tests
 */

const {
  processImage,
  processUploadedImage,
} = require("../image-processor");
const path = require("path");
const fs = require("fs").promises;
const os = require("os");

describe("Image Processing", () => {
  let tempDir;

  beforeAll(async () => {
    // Create a temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-test-"));
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
      await fs.rmdir(tempDir);
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe("processUploadedImage", () => {
    it("should return original path for non-image files", async () => {
      const filePath = path.join(tempDir, "test.txt");
      await fs.writeFile(filePath, "test content");

      const result = await processUploadedImage({
        filePath,
        mimetype: "text/plain",
        fieldAttributes: { process_images: true },
      });

      expect(result.processedPath).toBe(filePath);
      expect(result.originalPath).toBeUndefined();
    });

    it("should return original path when processing is disabled", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await fs.writeFile(filePath, "fake image content");

      const result = await processUploadedImage({
        filePath,
        mimetype: "image/jpeg",
        fieldAttributes: { process_images: false },
      });

      expect(result.processedPath).toBe(filePath);
      expect(result.originalPath).toBeUndefined();
    });

    it("should return original path when no processing options specified", async () => {
      const filePath = path.join(tempDir, "test2.jpg");
      await fs.writeFile(filePath, "fake image content");

      const result = await processUploadedImage({
        filePath,
        mimetype: "image/jpeg",
        fieldAttributes: {
          process_images: true,
          // No target_width, target_height, or target_format
        },
      });

      expect(result.processedPath).toBe(filePath);
      expect(result.originalPath).toBeUndefined();
    });

    it("should handle missing fieldAttributes", async () => {
      const filePath = path.join(tempDir, "test3.jpg");
      await fs.writeFile(filePath, "fake image content");

      const result = await processUploadedImage({
        filePath,
        mimetype: "image/jpeg",
        // No fieldAttributes
      });

      expect(result.processedPath).toBe(filePath);
      expect(result.originalPath).toBeUndefined();
    });
  });

  describe("processImage", () => {
    it("should handle missing source file", async () => {
      const result = await processImage({
        sourcePath: path.join(tempDir, "nonexistent.jpg"),
        targetPath: path.join(tempDir, "output.jpg"),
        width: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return original for no processing options", async () => {
      const filePath = path.join(tempDir, "test4.jpg");
      await fs.writeFile(filePath, "fake image content");

      const result = await processImage({
        sourcePath: filePath,
        targetPath: path.join(tempDir, "output.jpg"),
        // No width, height, or format
      });

      expect(result.success).toBe(true);
      expect(result.processedPath).toBe(filePath);
    });
  });
});
