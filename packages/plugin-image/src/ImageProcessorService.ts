import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export interface ImageMetadata {
  width: number | null;
  height: number | null;
  format: string;
  size: number;
  aspectRatio: number | null;
}

export interface ThumbnailOptions {
  width?: number;
  height?: number | null;
  quality?: number;
  format?: 'jpeg' | 'webp' | 'png';
  overwrite?: boolean;
}

export interface ProcessedImageResult {
  inputPath: string;
  outputPath: string;
  width: number | null;
  height: number | null;
  format: string;
  size: number;
  usedSharp: boolean;
  skipped?: boolean;
}

export interface BatchThumbnailSummary {
  total: number;
  processed: number;
  skipped: number;
  errors: number;
  items: ProcessedImageResult[];
}

/**
 * Pure Node header parser fallback for PNG, JPEG, GIF, WebP dimensions
 * when sharp is not installed on constrained hosts.
 */
export function parseImageDimensionsFromBuffer(buf: Buffer, ext = ''): {
  width: number | null;
  height: number | null;
  format: string;
} {
  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  if (buf.length < 24) {
    return { width: null, height: null, format: cleanExt || 'unknown' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR at offset 16
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      format: 'png',
    };
  }

  // GIF: GIF87a or GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return {
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
      format: 'gif',
    };
  }

  // WebP: RIFF....WEBP
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP' &&
    buf.length >= 30
  ) {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && buf.length >= 30) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
        format: 'webp',
      };
    }
    if (chunk === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        format: 'webp',
      };
    }
  }

  // JPEG: FF D8
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
          format: 'jpeg',
        };
      }
      const segLen = buf.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
    return { width: null, height: null, format: 'jpeg' };
  }

  return { width: null, height: null, format: cleanExt || 'unknown' };
}

export class ImageProcessorService {
  private sharpModule: any | null | undefined = undefined;

  private async getSharp(): Promise<any | null> {
    if (this.sharpModule !== undefined) return this.sharpModule;
    try {
      const mod: any = await import('sharp');
      this.sharpModule = mod.default || mod;
    } catch {
      this.sharpModule = null;
    }
    return this.sharpModule;
  }

  public async inspectImage(filePath: string): Promise<ImageMetadata> {
    const stat = await fsp.stat(filePath);
    const sharp = await this.getSharp();
    if (sharp) {
      try {
        const meta = await sharp(filePath).metadata();
        const width = meta.width ?? null;
        const height = meta.height ?? null;
        return {
          width,
          height,
          format: meta.format || path.extname(filePath).replace(/^\./, '').toLowerCase(),
          size: stat.size,
          aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
        };
      } catch {}
    }

    const handle = await fsp.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(Math.min(stat.size, 65536));
      await handle.read(buf, 0, buf.length, 0);
      const parsed = parseImageDimensionsFromBuffer(buf, path.extname(filePath));
      return {
        width: parsed.width,
        height: parsed.height,
        format: parsed.format,
        size: stat.size,
        aspectRatio:
          parsed.width && parsed.height ? Number((parsed.width / parsed.height).toFixed(4)) : null,
      };
    } finally {
      await handle.close();
    }
  }

  public async generateThumbnail(
    inputPath: string,
    outputPath: string,
    options: ThumbnailOptions = {}
  ): Promise<ProcessedImageResult> {
    const width = options.width ?? 250;
    const height = options.height ?? null;
    const quality = options.quality ?? 80;
    const format = options.format ?? 'jpeg';

    if (!options.overwrite && fs.existsSync(outputPath)) {
      const meta = await this.inspectImage(outputPath);
      return {
        inputPath,
        outputPath,
        width: meta.width,
        height: meta.height,
        format: meta.format,
        size: meta.size,
        usedSharp: false,
        skipped: true,
      };
    }

    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    const sharp = await this.getSharp();

    if (sharp) {
      try {
        let pipeline = sharp(inputPath).resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        if (format === 'webp') {
          pipeline = pipeline.webp({ quality });
        } else if (format === 'png') {
          pipeline = pipeline.png({ quality });
        } else {
          pipeline = pipeline.jpeg({ quality });
        }
        const info = await pipeline.toFile(outputPath);
        return {
          inputPath,
          outputPath,
          width: info.width ?? width,
          height: info.height ?? null,
          format: info.format || format,
          size: info.size,
          usedSharp: true,
        };
      } catch {
        // Fallback to copy if sharp fails on a specific file
      }
    }

    // Graceful fallback: copy original as thumbnail so app works even without native libvips
    await fsp.copyFile(inputPath, outputPath);
    const meta = await this.inspectImage(outputPath);
    return {
      inputPath,
      outputPath,
      width: meta.width,
      height: meta.height,
      format: meta.format,
      size: meta.size,
      usedSharp: false,
    };
  }

  public async resizeImage(
    inputPath: string,
    outputPath: string,
    options: ThumbnailOptions = {}
  ): Promise<ProcessedImageResult> {
    return this.generateThumbnail(inputPath, outputPath, {
      ...options,
      overwrite: options.overwrite ?? true,
    });
  }

  public async processBatchThumbnails(
    photosDir: string,
    thumbnailsDir: string,
    options: ThumbnailOptions = {}
  ): Promise<BatchThumbnailSummary> {
    await fsp.mkdir(thumbnailsDir, { recursive: true });
    if (!fs.existsSync(photosDir)) {
      return { total: 0, processed: 0, skipped: 0, errors: 0, items: [] };
    }

    const files = await fsp.readdir(photosDir);
    const imageFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    });

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const items: ProcessedImageResult[] = [];

    for (const file of imageFiles) {
      const photoPath = path.join(photosDir, file);
      const ext = options.format === 'webp' ? '.webp' : options.format === 'png' ? '.png' : '.jpg';
      const thumbName = path.parse(file).name + ext;
      const thumbPath = path.join(thumbnailsDir, thumbName);
      try {
        const res = await this.generateThumbnail(photoPath, thumbPath, options);
        items.push(res);
        if (res.skipped) {
          skipped++;
        } else {
          processed++;
        }
      } catch {
        errors++;
      }
    }

    return {
      total: imageFiles.length,
      processed,
      skipped,
      errors,
      items,
    };
  }
}

