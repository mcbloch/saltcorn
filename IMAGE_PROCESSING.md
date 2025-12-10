# Image Processing Pipeline for File Uploads

## Overview

Saltcorn now supports automatic image processing on upload through File type fields. This feature allows you to automatically resize, compress, and convert images to different formats when users upload them.

## Features

- **Automatic Resizing**: Set target width and/or height for uploaded images
- **Format Conversion**: Convert images to WebP, JPEG, or PNG formats
- **Compression**: Control image quality/compression ratio (1-100)
- **Original Preservation**: Optionally keep the original file alongside the processed version

## Configuration

### Setting up Image Processing for a Field

1. Navigate to the table configuration
2. Add or edit a File type field
3. In the field configuration, under "Attributes":
   - **Process images on upload**: Enable this checkbox to activate image processing
   - **Target width (pixels)**: Set the maximum width (leave empty to maintain original width)
   - **Target height (pixels)**: Set the maximum height (leave empty to maintain original height)
   - **Target format**: Choose output format (WebP, JPEG, PNG, or keep original)
   - **Compression quality (1-100)**: Set quality level (default: 85)
     - Higher values = better quality but larger files
     - Recommended range: 80-90 for good balance
   - **Keep original file**: Enable to store both original and processed versions

### Example Configurations

#### Profile Photo (Small, WebP)
- Process images: ✓
- Target width: 400
- Target height: 400
- Target format: WebP
- Compression quality: 85
- Keep original: ☐

#### Product Image (High Quality)
- Process images: ✓
- Target width: 1200
- Target height: (empty)
- Target format: JPEG
- Compression quality: 90
- Keep original: ✓

#### Document Scan (Compression Only)
- Process images: ✓
- Target width: (empty)
- Target height: (empty)
- Target format: (keep original)
- Compression quality: 75
- Keep original: ☐

## How It Works

1. User uploads an image through a form with a File field
2. The file is moved to the secure file store
3. If image processing is enabled for that field:
   - The original is optionally renamed with `_original_` prefix
   - Image is processed according to field configuration
   - Processed image is saved with the original filename (or new format extension)
   - File record is created pointing to the processed version
4. If processing fails, the original file is kept

## Technical Details

### Image Processing Library

The feature uses the existing `resize-with-sharp-or-jimp` dependency:
- Tries to use Sharp (fast, native) when available
- Falls back to Jimp (pure JavaScript) if Sharp can't be installed
- Supports common image formats: JPEG, PNG, WebP, GIF, TIFF

### File Storage

- Processed images replace the uploaded file at the original path
- Original files (when kept) are stored with `_original_` prefix
- A reference to the original path is stored in file extended attributes
- File size and MIME type are updated to reflect the processed version

### Performance

- Processing happens synchronously during upload
- Small to medium images (< 2MB) process quickly (< 1 second)
- Large images may take a few seconds to process
- Consider your server's CPU capacity when enabling for high-traffic sites

### Limitations

- Only processes image files (detected by MIME type)
- Does not process files uploaded directly through the file manager
- S3 storage is not currently supported for processing
- Format conversion depends on Sharp/Jimp capabilities

## Troubleshooting

### Images Not Being Processed

1. Check that "Process images on upload" is enabled for the field
2. Verify at least one processing option is set (width, height, or format)
3. Check server logs for processing errors
4. Ensure the file is actually an image (check MIME type)

### Processing Fails

If image processing fails, the system will:
- Log the error to console
- Keep the original uploaded file
- Continue with the normal upload flow

Common causes of processing failures:
- Sharp library not installed (falls back to Jimp)
- Corrupted image file
- Unsupported image format
- Insufficient server memory/resources

### Original Files Not Kept

If "Keep original file" is enabled but originals are not being saved:
- Check file system permissions
- Verify extended attributes are supported (Linux/macOS)
- Check server logs for errors

## API and Programmatic Usage

The image processing is integrated into `File.from_req_files()`:

```javascript
const file = await File.from_req_files(
  req.files.photo,
  userId,
  minRoleRead,
  folder,
  {
    process_images: true,
    target_width: 800,
    target_height: 600,
    target_format: 'webp',
    compression_quality: 85,
    keep_original: false
  }
);
```

## Security Considerations

- All image processing uses paths already validated by Saltcorn's file system security
- No user-provided paths are used in processing
- Processing failure falls back safely to original file
- Extended attributes for original path are only set on successful processing

## Future Enhancements

Potential future improvements:
- Batch processing of existing images
- Multiple size variants (thumbnails, previews, full-size)
- Custom processing profiles
- Background/async processing for large files
- S3 storage support
- Integration with CDN for optimized delivery
