import { mkdir, writeFile, unlink, readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export interface UploadedFile {
  filename: string;
  originalName: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(buffer: Buffer, filename: string, mimeType: string): Promise<UploadedFile>;
  delete(filename: string): Promise<void>;
  getUrl(filename: string): string;
  exists(filename: string): Promise<boolean>;
}

/**
 * Local file storage provider
 */
class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  private baseUrl: string;

  constructor() {
    this.baseDir = process.env.UPLOAD_DIR || './uploads';
    this.baseUrl = process.env.UPLOAD_BASE_URL || '/uploads';
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<UploadedFile> {
    // Generate unique filename
    const ext = originalName.split('.').pop() || '';
    const filename = `${uuidv4()}.${ext}`;

    // Determine subdirectory based on file type
    let subdir = 'misc';
    if (mimeType.startsWith('image/')) subdir = 'images';
    else if (mimeType === 'application/pdf') subdir = 'pdfs';

    const filePath = join(this.baseDir, subdir, filename);
    const dirPath = dirname(filePath);

    // Ensure directory exists
    await mkdir(dirPath, { recursive: true });

    // Write file
    await writeFile(filePath, buffer);

    logger.info({ filename, size: buffer.length, mimeType }, 'File uploaded');

    return {
      filename: `${subdir}/${filename}`,
      originalName,
      url: this.getUrl(`${subdir}/${filename}`),
      size: buffer.length,
      mimeType,
    };
  }

  async delete(filename: string): Promise<void> {
    const filePath = join(this.baseDir, filename);

    try {
      await unlink(filePath);
      logger.info({ filename }, 'File deleted');
    } catch (error) {
      logger.warn({ error, filename }, 'Failed to delete file');
    }
  }

  getUrl(filename: string): string {
    return `${this.baseUrl}/${filename}`;
  }

  async exists(filename: string): Promise<boolean> {
    const filePath = join(this.baseDir, filename);

    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getBuffer(filename: string): Promise<Buffer> {
    const filePath = join(this.baseDir, filename);
    return readFile(filePath);
  }
}

/**
 * S3 storage provider (for production)
 */
class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private region: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'egoli-link-uploads';
    this.region = process.env.AWS_REGION || 'af-south-1';
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<UploadedFile> {
    // Note: In production, implement actual S3 upload
    // This is a placeholder that would use @aws-sdk/client-s3

    const ext = originalName.split('.').pop() || '';
    const filename = `${uuidv4()}.${ext}`;

    let subdir = 'misc';
    if (mimeType.startsWith('image/')) subdir = 'images';
    else if (mimeType === 'application/pdf') subdir = 'pdfs';

    const key = `${subdir}/${filename}`;

    // In production:
    // const s3 = new S3Client({ region: this.region });
    // await s3.send(new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: key,
    //   Body: buffer,
    //   ContentType: mimeType,
    // }));

    logger.info({ key, size: buffer.length }, 'S3 upload (placeholder)');

    return {
      filename: key,
      originalName,
      url: this.getUrl(key),
      size: buffer.length,
      mimeType,
    };
  }

  async delete(filename: string): Promise<void> {
    // In production:
    // const s3 = new S3Client({ region: this.region });
    // await s3.send(new DeleteObjectCommand({
    //   Bucket: this.bucket,
    //   Key: filename,
    // }));

    logger.info({ filename }, 'S3 delete (placeholder)');
  }

  getUrl(filename: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${filename}`;
  }

  async exists(filename: string): Promise<boolean> {
    // In production:
    // try {
    //   await s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: filename }));
    //   return true;
    // } catch {
    //   return false;
    // }
    return false;
  }
}

// Create storage provider based on environment
const storageType = process.env.STORAGE_TYPE || 'local';

export const storage: StorageProvider =
  storageType === 's3' ? new S3StorageProvider() : new LocalStorageProvider();

// Export for direct local access when needed
export const localStorage = new LocalStorageProvider();

/**
 * Get file buffer from storage (for PDF processing)
 */
export async function getFileBuffer(filename: string): Promise<Buffer> {
  if (storageType === 'local') {
    return (localStorage as LocalStorageProvider).getBuffer(filename);
  }

  // For S3, download the file
  // const response = await s3.send(new GetObjectCommand({ ... }));
  // return Buffer.from(await response.Body.transformToByteArray());

  throw new Error('S3 getBuffer not implemented');
}
