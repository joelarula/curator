import fs from 'node:fs';
import { Router, type Request, type Response } from 'express';
import { StorageService, inferMimeType } from './StorageService.js';

export interface CreateStorageRouterOptions {
  storage: StorageService;
  onFileUploaded?: (file: any, req: Request) => Promise<void> | void;
}

export function createStorageRouter(options: CreateStorageRouterOptions): Router {
  const { storage, onFileUploaded } = options;
  const router = Router();

  // 1. Upload endpoint supporting JSON base64 batch/single uploads
  router.post('/api/curator/upload', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const defaultProject =
        (req.headers['x-project-id'] as string) || body.projectId || storage.defaultProjectId;
      const defaultBucket = body.bucket || 'photos';

      const incomingFiles: Array<{
        filename: string;
        data: string;
        mimeType?: string;
        bucket?: string;
        projectId?: string;
        resourceId?: number;
      }> = Array.isArray(body.files)
        ? body.files
        : body.filename && (body.data || body.contentBase64)
          ? [
              {
                filename: body.filename,
                data: body.data || body.contentBase64,
                mimeType: body.mimeType,
                bucket: body.bucket,
                projectId: body.projectId,
                resourceId: body.resourceId,
              },
            ]
          : [];

      if (incomingFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files provided. Supply { files: [{ filename, data (base64), mimeType }] }.',
        });
      }

      const uploaded = [];
      for (const item of incomingFiles) {
        const saved = await storage.saveFile({
          projectId: item.projectId || defaultProject,
          bucket: item.bucket || defaultBucket,
          filename: item.filename,
          data: item.data,
          encoding: 'base64',
          mimeType: item.mimeType,
          resourceId: item.resourceId ? Number(item.resourceId) : undefined,
        });
        if (onFileUploaded) {
          await onFileUploaded(saved, req);
        }
        uploaded.push(saved);
      }

      return res.json({
        success: true,
        files: uploaded,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'File upload failed',
      });
    }
  });

  // 2. Static VM file serving under configured baseUrlPrefix (and /media fallback)
  // Resolves files by exact filename (`101_a.png`) OR by SEO-friendly slug (`101-a` / `101-a.png`).
  const serveMediaHandler = (req: Request, res: Response) => {
    try {
      const { projectId, bucket, filename } = req.params;
      const found = storage.findFileBySlugOrFilename(
        String(projectId),
        String(bucket),
        String(filename)
      );
      if (!found || !fs.existsSync(found.diskPath)) {
        return res.status(404).json({ error: 'Media file not found' });
      }
      res.setHeader('Content-Type', inferMimeType(found.filename));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(found.diskPath);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Invalid media path' });
    }
  };

  const routePrefixes = new Set<string>(['/media']);
  if (storage.baseUrlPrefix && storage.baseUrlPrefix.startsWith('/')) {
    routePrefixes.add(storage.baseUrlPrefix.replace(/\/+$/, ''));
  }
  for (const prefix of routePrefixes) {
    router.get(`${prefix}/:projectId/:bucket/:filename`, serveMediaHandler);
  }

  return router;
}

