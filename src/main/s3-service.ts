import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  DeleteBucketPolicyCommand,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  DeleteObjectTaggingCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, nativeImage } from 'electron';
import { pipeline } from 'stream/promises';
import mime from 'mime-types';
import { S3Profile, S3Bucket, ListObjectsResult, S3Item, TestConnectionResult, FilePreviewData, ScannedFile, S3ObjectSummary, DownloadResult, S3Tag } from '../common/types';

export class S3Service {
  private clientCache: Map<string, S3Client> = new Map();

  private getClient(profile: S3Profile): S3Client {
    const cacheKey = `${profile.id}_${profile.endpoint}_${profile.accessKey}`;
    if (this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey)!;
    }

    let endpoint = profile.endpoint.trim();
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      endpoint = (profile.useSSL ? 'https://' : 'http://') + endpoint;
    }
    if (endpoint.includes('//localhost')) {
      endpoint = endpoint.replace('//localhost', '//127.0.0.1');
    }

    // Configure dedicated HTTP/HTTPS agents with aggressive keepalive probing and idle socket recycling
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 3000,
      maxSockets: 64,
      maxTotalSockets: 128,
      timeout: 30000,
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 3000,
      maxSockets: 64,
      maxTotalSockets: 128,
      timeout: 30000,
      rejectUnauthorized: (profile as any).rejectUnauthorized ?? false,
    });

    const requestHandler = new NodeHttpHandler({
      httpAgent,
      httpsAgent,
      connectionTimeout: 15000, // 15s to establish connection
      requestTimeout: 30000,    // 30s to receive response headers
    });

    const client = new S3Client({
      endpoint: endpoint,
      region: profile.region || 'us-east-1',
      credentials: {
        accessKeyId: profile.accessKey,
        secretAccessKey: profile.secretKey,
      },
      forcePathStyle: profile.forcePathStyle ?? true,
      tls: profile.useSSL ?? false,
      requestHandler,
      maxAttempts: 3,
    });

    this.clientCache.set(cacheKey, client);
    return client;
  }

  public async testConnection(profile: S3Profile): Promise<TestConnectionResult> {
    try {
      const client = this.getClient(profile);
      const res = await client.send(new ListBucketsCommand({}));
      return {
        success: true,
        bucketsCount: res.Buckets?.length ?? 0,
      };
    } catch (err: any) {
      console.error('Test connection error:', err);
      return {
        success: false,
        message: err.message || 'Ошибка подключения к S3/MinIO',
      };
    }
  }

  public async listBuckets(profile: S3Profile): Promise<S3Bucket[]> {
    const client = this.getClient(profile);
    const res = await client.send(new ListBucketsCommand({}));
    return (
      res.Buckets?.map((b) => ({
        name: b.Name || '',
        creationDate: b.CreationDate ? b.CreationDate.toISOString() : undefined,
      })) || []
    );
  }

  public async createBucket(profile: S3Profile, bucketName: string): Promise<boolean> {
    const client = this.getClient(profile);
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    return true;
  }

  public async deleteBucket(profile: S3Profile, bucketName: string): Promise<boolean> {
    const client = this.getClient(profile);
    await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    return true;
  }

  public async renameBucket(
    profile: S3Profile,
    oldBucketName: string,
    newBucketName: string
  ): Promise<boolean> {
    if (oldBucketName === newBucketName) return true;
    const client = this.getClient(profile);

    // 1. Create the new bucket
    await client.send(new CreateBucketCommand({ Bucket: newBucketName }));

    try {
      // 2. Migrate all objects from oldBucket to newBucket
      let continuationToken: string | undefined = undefined;
      do {
        const listRes: ListObjectsV2CommandOutput = await client.send(
          new ListObjectsV2Command({
            Bucket: oldBucketName,
            ContinuationToken: continuationToken,
          })
        );

        if (listRes.Contents && listRes.Contents.length > 0) {
          const keysToDelete: { Key: string }[] = [];
          for (const obj of listRes.Contents) {
            if (!obj.Key) continue;
            const copySource = `${oldBucketName}/${encodeURIComponent(obj.Key).replace(/%2F/g, '/')}`;
            await client.send(
              new CopyObjectCommand({
                Bucket: newBucketName,
                Key: obj.Key,
                CopySource: copySource,
              })
            );
            keysToDelete.push({ Key: obj.Key });
          }

          for (let i = 0; i < keysToDelete.length; i += 1000) {
            const batch = keysToDelete.slice(i, i + 1000);
            await client.send(
              new DeleteObjectsCommand({
                Bucket: oldBucketName,
                Delete: { Objects: batch, Quiet: true },
              })
            );
          }
        }

        continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
      } while (continuationToken);

      // 3. Delete the old bucket
      await client.send(new DeleteBucketCommand({ Bucket: oldBucketName }));
      return true;
    } catch (err: any) {
      throw new Error(`Ошибка при переносе объектов бакета: ${err.message || err}`);
    }
  }

  public async getBucketPolicy(profile: S3Profile, bucket: string): Promise<string | null> {
    try {
      const client = this.getClient(profile);
      const res = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
      return res.Policy || null;
    } catch (err: any) {
      if (err.name === 'NoSuchBucketPolicy' || err.Code === 'NoSuchBucketPolicy' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  public async setBucketPolicy(profile: S3Profile, bucket: string, policyJson: string): Promise<boolean> {
    const client = this.getClient(profile);
    await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policyJson }));
    return true;
  }

  public async deleteBucketPolicy(profile: S3Profile, bucket: string): Promise<boolean> {
    const client = this.getClient(profile);
    await client.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));
    return true;
  }

  public async getBucketVersioning(profile: S3Profile, bucket: string): Promise<'Enabled' | 'Suspended' | 'None'> {
    try {
      const client = this.getClient(profile);
      const res = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
      if (res.Status === 'Enabled') return 'Enabled';
      if (res.Status === 'Suspended') return 'Suspended';
      return 'None';
    } catch {
      return 'None';
    }
  }

  public async setBucketVersioning(profile: S3Profile, bucket: string, enabled: boolean): Promise<boolean> {
    const client = this.getClient(profile);
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: {
          Status: enabled ? 'Enabled' : 'Suspended',
        },
      })
    );
    return true;
  }

  public async getObjectTags(profile: S3Profile, bucket: string, key: string): Promise<S3Tag[]> {
    try {
      const client = this.getClient(profile);
      const res = await client.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key }));
      if (!res.TagSet || res.TagSet.length === 0) return [];
      return res.TagSet.map((t) => ({
        key: t.Key || '',
        value: t.Value || '',
      })).filter((t) => t.key.length > 0);
    } catch (err: any) {
      // If object has no tags, S3 might throw NoSuchTagSet or 404
      return [];
    }
  }

  public async putObjectTags(
    profile: S3Profile,
    bucket: string,
    key: string,
    tags: S3Tag[]
  ): Promise<boolean> {
    const client = this.getClient(profile);
    const validTags = tags
      .map((t) => ({ Key: t.key.trim(), Value: t.value.trim() }))
      .filter((t) => t.Key.length > 0);

    if (validTags.length === 0) {
      try {
        await client.send(new DeleteObjectTaggingCommand({ Bucket: bucket, Key: key }));
      } catch (err: any) {
        console.warn(`[Tags] DeleteObjectTagging warning for ${bucket}/${key}:`, err?.message || err);
      }
      return true;
    }

    if (validTags.length > 10) {
      throw new Error('S3 поддерживает максимум 10 тегов на один объект');
    }

    const s3AllowedRegex = /^[a-zA-Z0-9 +=\._:/\-]+$/;
    for (const t of validTags) {
      if (t.Key.length > 128) {
        throw new Error(`Ключ тега "${t.Key}" превышает допустимую длину в 128 символов`);
      }
      if (t.Value.length > 256) {
        throw new Error(`Значение тега для "${t.Key}" превышает 256 символов`);
      }
      if (/[а-яА-ЯёЁ]/.test(t.Key) || !s3AllowedRegex.test(t.Key)) {
        throw new Error(
          `Ключ тега "${t.Key}" содержит недопустимые символы или кириллицу. Разрешены только латинские буквы (a-z, A-Z), цифры (0-9) и знаки: + - = . _ : / пробел`
        );
      }
      if (t.Value && (/[а-яА-ЯёЁ]/.test(t.Value) || !s3AllowedRegex.test(t.Value))) {
        throw new Error(
          `Значение тега "${t.Key}" содержит недопустимые символы или кириллицу. Разрешены только латинские буквы, цифры и знаки: + - = . _ : / пробел`
        );
      }
    }

    await client.send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
        Tagging: {
          TagSet: validTags,
        },
      })
    );
    return true;
  }

  public async deleteObjectTags(profile: S3Profile, bucket: string, key: string): Promise<boolean> {
    const client = this.getClient(profile);
    await client.send(new DeleteObjectTaggingCommand({ Bucket: bucket, Key: key }));
    return true;
  }

  public async getBatchObjectTags(
    profile: S3Profile,
    bucket: string,
    keys: string[]
  ): Promise<Record<string, S3Tag[]>> {
    const results: Record<string, S3Tag[]> = {};
    if (!keys || keys.length === 0) return results;

    const concurrency = 8;
    let idx = 0;

    const worker = async () => {
      while (idx < keys.length) {
        const currentKey = keys[idx++];
        try {
          const tags = await this.getObjectTags(profile, bucket, currentKey);
          if (tags && tags.length > 0) {
            results[currentKey] = tags;
          }
        } catch {
          // ignore error for individual key
        }
      }
    };

    const workerCount = Math.min(concurrency, keys.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }

  public async listObjects(
    profile: S3Profile,
    bucket: string,
    prefix: string = '',
    continuationToken?: string
  ): Promise<ListObjectsResult> {
    const client = this.getClient(profile);
    const normalizedPrefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizedPrefix,
      Delimiter: '/',
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const response = await client.send(command);

    const items: S3Item[] = [];

    // Add folders (common prefixes)
    if (response.CommonPrefixes) {
      for (const cp of response.CommonPrefixes) {
        if (!cp.Prefix) continue;
        const cleanName = cp.Prefix.slice(normalizedPrefix.length).replace(/\/$/, '');
        items.push({
          key: cp.Prefix,
          name: cleanName,
          isPrefix: true,
        });
      }
    }

    // Add files
    if (response.Contents) {
      for (const obj of response.Contents) {
        if (!obj.Key) continue;
        // Skip prefix folder marker itself if returned
        if (obj.Key === normalizedPrefix) continue;

        const name = obj.Key.slice(normalizedPrefix.length);
        if (!name) continue;

        const ext = path.extname(name).toLowerCase().replace('.', '');
        items.push({
          key: obj.Key,
          name: name,
          isPrefix: false,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ? obj.LastModified.toISOString() : undefined,
          eTag: obj.ETag?.replace(/"/g, ''),
          storageClass: obj.StorageClass,
          extension: ext,
        });
      }
    }

    return {
      items,
      commonPrefixes: (response.CommonPrefixes?.map((cp) => cp.Prefix!).filter(Boolean) as string[]) || [],
      isTruncated: response.IsTruncated ?? false,
      nextContinuationToken: response.NextContinuationToken,
      currentPrefix: normalizedPrefix,
    };
  }

  public async headObject(
    profile: S3Profile,
    bucket: string,
    key: string
  ): Promise<S3Item | null> {
    try {
      const client = this.getClient(profile);
      const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const name = key.split('/').filter(Boolean).pop() || key;
      const ext = path.extname(name).toLowerCase().replace('.', '');
      return {
        key,
        name,
        isPrefix: false,
        size: res.ContentLength || 0,
        lastModified: res.LastModified?.toISOString() || new Date().toISOString(),
        eTag: res.ETag?.replace(/"/g, ''),
        storageClass: res.StorageClass || 'STANDARD',
        extension: ext,
      };
    } catch {
      return null;
    }
  }

  public async createFolder(profile: S3Profile, bucket: string, folderKey: string): Promise<boolean> {
    const client = this.getClient(profile);
    const key = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.alloc(0),
      })
    );
    return true;
  }

  public async deleteObjects(profile: S3Profile, bucket: string, keys: string[]): Promise<boolean> {
    const client = this.getClient(profile);
    if (keys.length === 0) return true;

    // Handle keys and subfolder keys (recursively delete prefixes if a folder is selected)
    const allKeysToDelete: string[] = [];

    for (const key of keys) {
      if (key.endsWith('/')) {
        // It's a folder, find all nested items under this prefix
        let continuationToken: string | undefined = undefined;
        let isTruncated: boolean = true;
        while (isTruncated) {
          const listRes: ListObjectsV2CommandOutput = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: key,
              ContinuationToken: continuationToken,
            })
          );
          if (listRes.Contents) {
            for (const item of listRes.Contents) {
              if (item.Key) allKeysToDelete.push(item.Key);
            }
          }
          isTruncated = Boolean(listRes.IsTruncated);
          continuationToken = listRes.NextContinuationToken;
        }
      } else {
        allKeysToDelete.push(key);
      }
    }

    if (allKeysToDelete.length === 0) return true;

    // Batch delete in chunks of 1000
    for (let i = 0; i < allKeysToDelete.length; i += 1000) {
      const batch = allKeysToDelete.slice(i, i + 1000);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((k) => ({ Key: k })),
            Quiet: true,
          },
        })
      );
    }

    return true;
  }

  public async moveObject(
    profile: S3Profile,
    bucket: string,
    sourceKey: string,
    destKey: string
  ): Promise<boolean> {
    const client = this.getClient(profile);
    if (sourceKey === destKey) return true;

    const isFolder = sourceKey.endsWith('/');
    const normalizedSource = isFolder ? sourceKey : sourceKey;
    const normalizedDest = isFolder && !destKey.endsWith('/') ? `${destKey}/` : destKey;

    if (isFolder) {
      // 1. List all objects under source folder prefix
      const allObjects: string[] = [];
      let continuationToken: string | undefined = undefined;
      let isTruncated = true;

      while (isTruncated) {
        const listRes: ListObjectsV2CommandOutput = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: normalizedSource,
            ContinuationToken: continuationToken,
          })
        );

        if (listRes.Contents) {
          for (const item of listRes.Contents) {
            if (item.Key) allObjects.push(item.Key);
          }
        }

        isTruncated = Boolean(listRes.IsTruncated);
        continuationToken = listRes.NextContinuationToken;
      }

      // If folder was empty in S3 (e.g. purely virtual or 0 objects)
      if (allObjects.length === 0) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: normalizedDest,
            Body: Buffer.alloc(0),
          })
        );
        return true;
      }

      // 2. Copy each object to destination
      for (const oldKey of allObjects) {
        const subPath = oldKey.substring(normalizedSource.length);
        const newKey = `${normalizedDest}${subPath}`;
        const copySource = `${bucket}/${encodeURIComponent(oldKey).replace(/%2F/g, '/')}`;

        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: newKey,
            CopySource: copySource,
          })
        );
      }

      // 3. Delete old objects
      await this.deleteObjects(profile, bucket, allObjects);
    } else {
      // Single file move
      const copySource = `${bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, '/')}`;
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: normalizedDest,
          CopySource: copySource,
        })
      );

      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: sourceKey,
        })
      );
    }

    return true;
  }

  public async moveObjects(
    profile: S3Profile,
    bucket: string,
    items: { key: string; isPrefix: boolean }[],
    targetPrefix: string
  ): Promise<boolean> {
    const normalizedTarget = targetPrefix && !targetPrefix.endsWith('/') ? `${targetPrefix}/` : targetPrefix;

    for (const item of items) {
      if (item.isPrefix) {
        const folderName = item.key.replace(/\/+$/, '').split('/').pop() || 'folder';
        const newKey = `${normalizedTarget}${folderName}/`;
        if (item.key === newKey) continue;
        await this.moveObject(profile, bucket, item.key, newKey);
      } else {
        const fileName = item.key.split('/').pop() || 'file';
        const newKey = `${normalizedTarget}${fileName}`;
        if (item.key === newKey) continue;
        await this.moveObject(profile, bucket, item.key, newKey);
      }
    }

    return true;
  }

  public async renameObject(
    profile: S3Profile,
    bucket: string,
    oldKey: string,
    newName: string,
    isPrefix: boolean
  ): Promise<boolean> {
    const cleanName = newName.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanName) throw new Error('Имя объекта не может быть пустым');

    let newKey: string;
    if (isPrefix) {
      const parts = oldKey.replace(/\/+$/, '').split('/');
      parts.pop(); // remove old folder name
      const parent = parts.length > 0 ? `${parts.join('/')}/` : '';
      newKey = `${parent}${cleanName}/`;
    } else {
      const parts = oldKey.split('/');
      parts.pop(); // remove old file name
      const parent = parts.length > 0 ? `${parts.join('/')}/` : '';
      newKey = `${parent}${cleanName}`;
    }

    return await this.moveObject(profile, bucket, oldKey, newKey);
  }

  public async uploadFile(
    profile: S3Profile,
    bucket: string,
    key: string,
    localFilePath: string,
    onProgress?: (bytes: number, total: number) => void
  ): Promise<boolean> {
    const client = this.getClient(profile);
    const stats = await fs.promises.stat(localFilePath);
    const contentType = (mime.lookup(localFilePath) as string) || 'application/octet-stream';
    const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB threshold for S3 Multipart Upload

    if (stats.size > MULTIPART_THRESHOLD) {
      // S3 Multipart Upload via @aws-sdk/lib-storage for large files
      const fileStream = fs.createReadStream(localFilePath);
      try {
        const parallelUpload = new Upload({
          client,
          params: {
            Bucket: bucket,
            Key: key,
            Body: fileStream,
            ContentType: contentType,
          },
          partSize: 5 * 1024 * 1024, // 5MB parts
          queueSize: 4, // 4 parallel streams
          leavePartsOnError: false,
        });

        if (onProgress) {
          parallelUpload.on('httpUploadProgress', (progress) => {
            if (progress.loaded !== undefined && progress.total !== undefined) {
              onProgress(progress.loaded, progress.total);
            }
          });
        }

        await parallelUpload.done();
      } catch (uploadErr) {
        try {
          fileStream.destroy();
        } catch {}
        throw uploadErr;
      }
    } else {
      // Standard PutObject with Buffer for small files (<= 5MB)
      // Reading asynchronously into a Buffer prevents blocking Node.js event loop
      const buffer = await fs.promises.readFile(localFilePath);

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentLength: stats.size,
          ContentType: contentType,
        })
      );

      if (onProgress) {
        onProgress(stats.size, stats.size);
      }
    }

    return true;
  }

  public async uploadTextContent(
    profile: S3Profile,
    bucket: string,
    key: string,
    content: string
  ): Promise<boolean> {
    const client = this.getClient(profile);
    const buffer = Buffer.from(content, 'utf-8');
    const contentType = (mime.lookup(key) as string) || 'text/plain; charset=utf-8';

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: contentType,
      })
    );

    return true;
  }

  public async scanLocalPath(localPath: string): Promise<ScannedFile[]> {
    return this.scanLocalPaths([localPath]);
  }

  public async scanLocalPaths(localPaths: string[]): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    const visitedDirs = new Set<string>();
    let itemsCount = 0;

    for (const rootPath of localPaths) {
      if (!fs.existsSync(rootPath)) continue;

      try {
        const rootStats = await fs.promises.stat(rootPath);
        if (!rootStats.isDirectory()) {
          results.push({
            localPath: rootPath,
            relativePath: path.basename(rootPath),
            size: rootStats.size,
          });
          continue;
        }

        // Canonical real path to detect loops and duplicate visits
        let rootRealDir = rootPath;
        try {
          rootRealDir = await fs.promises.realpath(rootPath);
        } catch {}
        visitedDirs.add(rootRealDir);

        const rootDir = path.dirname(rootPath);
        const dirQueue: string[] = [rootPath];

        while (dirQueue.length > 0) {
          const currentDir = dirQueue.shift()!;
          let entries: fs.Dirent[];
          try {
            entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
          } catch (e) {
            console.warn(`[s3Service] Cannot read directory ${currentDir}:`, e);
            continue;
          }

          for (const entry of entries) {
            itemsCount++;
            // Yield every 200 items so Electron main process event loop never hangs
            if (itemsCount % 200 === 0) {
              await new Promise((resolve) => setImmediate(resolve));
            }

            const fullPath = path.join(currentDir, entry.name);
            try {
              if (entry.isDirectory()) {
                let realDir = fullPath;
                try {
                  realDir = await fs.promises.realpath(fullPath);
                } catch {}

                // Guard against circular links / junctions / infinite loops
                if (!visitedDirs.has(realDir)) {
                  visitedDirs.add(realDir);
                  dirQueue.push(fullPath);
                }
              } else if (entry.isFile()) {
                const stat = await fs.promises.stat(fullPath);
                const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                results.push({
                  localPath: fullPath,
                  relativePath: rel,
                  size: stat.size,
                });
              } else if (entry.isSymbolicLink()) {
                // Safely handle symlinks: inspect target without crashing on ELOOP or broken targets
                try {
                  const targetStat = await fs.promises.stat(fullPath);
                  if (targetStat.isFile()) {
                    const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                    results.push({
                      localPath: fullPath,
                      relativePath: rel,
                      size: targetStat.size,
                    });
                  } else if (targetStat.isDirectory()) {
                    let realDir = fullPath;
                    try {
                      realDir = await fs.promises.realpath(fullPath);
                    } catch {}

                    if (!visitedDirs.has(realDir)) {
                      visitedDirs.add(realDir);
                      dirQueue.push(fullPath);
                    }
                  }
                } catch (symlinkErr: any) {
                  // Broken symlink, ELOOP, or permission denied on symlink target -> safely ignore
                  console.warn(`[s3Service] Skipping unresolvable symlink ${fullPath}:`, symlinkErr?.message || symlinkErr);
                }
              }
            } catch (err: any) {
              console.warn(`[s3Service] Cannot process ${fullPath}:`, err?.message || err);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[s3Service] Error scanning root ${rootPath}:`, err?.message || err);
      }
    }

    return results;
  }

  public async listAllObjectsUnderPrefix(
    profile: S3Profile,
    bucket: string,
    prefix: string
  ): Promise<S3ObjectSummary[]> {
    const client = this.getClient(profile);
    const normalizedPrefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
    const results: S3ObjectSummary[] = [];

    let continuationToken: string | undefined = undefined;
    let isTruncated = true;

    while (isTruncated) {
      const res: ListObjectsV2CommandOutput = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalizedPrefix,
          ContinuationToken: continuationToken,
        })
      );

      if (res.Contents) {
        for (const item of res.Contents) {
          if (!item.Key) continue;
          if (item.Key === normalizedPrefix || item.Key.endsWith('/')) continue;
          results.push({
            key: item.Key,
            size: item.Size || 0,
          });
        }
      }

      isTruncated = Boolean(res.IsTruncated);
      continuationToken = res.NextContinuationToken;
    }

    return results;
  }

  public async streamObjectsUnderPrefix(
    profile: S3Profile,
    bucket: string,
    prefix: string,
    onBatch: (objects: S3ObjectSummary[], isTruncated: boolean) => void
  ): Promise<number> {
    const client = this.getClient(profile);
    const normalizedPrefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
    let totalCount = 0;
    let continuationToken: string | undefined = undefined;
    let isTruncated = true;

    while (isTruncated) {
      const res: ListObjectsV2CommandOutput = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalizedPrefix,
          ContinuationToken: continuationToken,
        })
      );

      const batch: S3ObjectSummary[] = [];
      if (res.Contents) {
        for (const item of res.Contents) {
          if (!item.Key) continue;
          if (item.Key === normalizedPrefix || item.Key.endsWith('/')) continue;
          batch.push({
            key: item.Key,
            size: item.Size || 0,
          });
        }
      }

      totalCount += batch.length;
      isTruncated = Boolean(res.IsTruncated);
      continuationToken = res.NextContinuationToken;
      onBatch(batch, isTruncated);
    }

    return totalCount;
  }

  public async downloadDirectory(
    profile: S3Profile,
    bucket: string,
    prefix: string,
    targetLocalDir: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<number> {
    const client = this.getClient(profile);
    const normalizedPrefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;

    // Determine the base folder name to create locally, preserving the root folder
    const folderSegments = normalizedPrefix.replace(/\/+$/, '').split('/').filter(Boolean);
    const folderName = folderSegments.length > 0 ? folderSegments[folderSegments.length - 1] : '';
    const rootDestDir = folderName ? path.join(targetLocalDir, folderName) : targetLocalDir;

    if (!fs.existsSync(rootDestDir)) {
      fs.mkdirSync(rootDestDir, { recursive: true });
    }

    // 1. Collect all objects under prefix
    const allObjects: string[] = [];
    let continuationToken: string | undefined = undefined;
    let isTruncated = true;

    while (isTruncated) {
      const res: ListObjectsV2CommandOutput = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalizedPrefix,
          ContinuationToken: continuationToken,
        })
      );
      if (res.Contents) {
        for (const item of res.Contents) {
          if (!item.Key) continue;
          // Skip if key is the prefix folder itself or ends with /
          if (item.Key === normalizedPrefix || item.Key.endsWith('/')) {
            continue;
          }
          allObjects.push(item.Key);
        }
      }
      isTruncated = Boolean(res.IsTruncated);
      continuationToken = res.NextContinuationToken;
    }

    // 2. Download each object
    let count = 0;
    for (const key of allObjects) {
      let relativePart = key.startsWith(normalizedPrefix)
        ? key.slice(normalizedPrefix.length)
        : key;

      relativePart = relativePart.replace(/^\/+/, '');
      if (!relativePart) continue;

      const targetFilePath = path.join(rootDestDir, relativePart);
      const parentDir = path.dirname(targetFilePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      await this.downloadFile(profile, bucket, key, targetFilePath);
      count++;
      if (onProgress) {
        onProgress(count, allObjects.length);
      }
    }

    return count;
  }

  public async downloadFile(
    profile: S3Profile,
    bucket: string,
    key: string,
    targetFilePath: string,
    onProgress?: (bytes: number, total: number) => void
  ): Promise<DownloadResult> {
    const startTime = Date.now();
    const dir = path.dirname(targetFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let lastError: any = null;
    const MAX_RETRIES = 1; // 2 attempts total (fast failover, eliminates long UI freezes)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.executeDownloadAttempt(
          profile,
          bucket,
          key,
          targetFilePath,
          startTime,
          onProgress
        );
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[Download] Error downloading "${key}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
          err?.message || err
        );

        if (attempt < MAX_RETRIES) {
          // Short backoff before retry (250ms)
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    throw lastError || new Error(`Не удалось скачать файл: ${key}`);
  }

  private async executeDownloadAttempt(
    profile: S3Profile,
    bucket: string,
    key: string,
    targetFilePath: string,
    startTime: number,
    onProgress?: (bytes: number, total: number) => void
  ): Promise<DownloadResult> {
    const client = this.getClient(profile);
    const abortController = new AbortController();
    let watchdogTimer: NodeJS.Timeout | null = null;
    let bodyStream: any = null;

    const clearWatchdog = () => {
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
    };

    const resetWatchdog = (timeoutMs = 25000) => {
      clearWatchdog();
      watchdogTimer = setTimeout(() => {
        const timeoutErr = new Error(
          `Таймаут передачи: нет ответа от сервера более ${timeoutMs / 1000} сек (${key})`
        );
        try {
          abortController.abort(timeoutErr);
        } catch {}
        if (bodyStream && typeof bodyStream.destroy === 'function') {
          try {
            bodyStream.destroy(timeoutErr);
          } catch {}
        }
      }, timeoutMs);
    };

    // 1. Arm watchdog for connection establishment and response headers
    resetWatchdog(25000);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    let response;
    try {
      response = await client.send(command, { abortSignal: abortController.signal });
    } catch (sendErr: any) {
      clearWatchdog();
      throw sendErr;
    }

    if (!response.Body) {
      clearWatchdog();
      throw new Error('S3 object body is empty');
    }

    bodyStream = response.Body as any;
    const totalBytes = response.ContentLength || 0;

    // Fast path for 0-byte file
    if (totalBytes === 0) {
      clearWatchdog();
      await fs.promises.writeFile(targetFilePath, Buffer.alloc(0));
      if (onProgress) onProgress(0, 0);
      return {
        targetPath: targetFilePath,
        durationMs: Math.max(1, Date.now() - startTime),
        averageSpeedBytesPerSec: 0,
      };
    }

    const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024; // 20MB

    if (totalBytes <= LARGE_FILE_THRESHOLD) {
      // Memory accumulation path for small/medium files (<= 20MB).
      // Eliminates disk stream backpressure deadlocks ('drain') during network packet reception!
      const chunks: Buffer[] = [];
      let transferred = 0;

      try {
        for await (const chunk of bodyStream as AsyncIterable<Buffer | Uint8Array>) {
          resetWatchdog(25000);
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buf);
          transferred += buf.length;
          if (onProgress) {
            onProgress(transferred, totalBytes);
          }
        }

        clearWatchdog();

        const fullBuffer = Buffer.concat(chunks);
        await fs.promises.writeFile(targetFilePath, fullBuffer);

        const durationMs = Math.max(1, Date.now() - startTime);
        const averageSpeedBytesPerSec = Math.round((transferred / durationMs) * 1000);

        return {
          targetPath: targetFilePath,
          durationMs,
          averageSpeedBytesPerSec,
        };
      } catch (err: any) {
        clearWatchdog();
        throw err;
      }
    } else {
      // Large file path (> 20MB): stream to disk using Node's native stream pipeline
      const tempFilePath = `${targetFilePath}.part_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const fileStream = fs.createWriteStream(tempFilePath);
      let transferred = 0;

      try {
        if (onProgress && typeof bodyStream.on === 'function') {
          bodyStream.on('data', (chunk: Buffer) => {
            resetWatchdog(25000);
            transferred += chunk.length;
            onProgress(transferred, totalBytes);
          });
        }

        await pipeline(bodyStream, fileStream, { signal: abortController.signal });
        clearWatchdog();

        if (fs.existsSync(targetFilePath)) {
          try {
            fs.unlinkSync(targetFilePath);
          } catch {}
        }
        fs.renameSync(tempFilePath, targetFilePath);

        const durationMs = Math.max(1, Date.now() - startTime);
        const averageSpeedBytesPerSec = Math.round((transferred / durationMs) * 1000);

        return {
          targetPath: targetFilePath,
          durationMs,
          averageSpeedBytesPerSec,
        };
      } catch (streamErr: any) {
        clearWatchdog();
        try {
          fileStream.destroy();
        } catch {}
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch {}
        throw streamErr;
      }
    }
  }

  public async generatePresignedUrl(
    profile: S3Profile,
    bucket: string,
    key: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    const client = this.getClient(profile);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  public async getObjectPreview(
    profile: S3Profile,
    bucket: string,
    key: string
  ): Promise<FilePreviewData> {
    const client = this.getClient(profile);
    const ext = path.extname(key).toLowerCase().replace('.', '');
    const detectedMime = (mime.lookup(key) as string) || '';

    // Check size first
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const size = head.ContentLength || 0;

    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
    const isText = [
      'txt',
      'log',
      'json',
      'xml',
      'yaml',
      'yml',
      'md',
      'csv',
      'ts',
      'tsx',
      'js',
      'jsx',
      'html',
      'css',
      'sh',
      'py',
      'sql',
      'env',
      'conf',
      'ini',
    ].includes(ext);
    const isPdf = ext === 'pdf';
    const isAudio = ['mp3', 'wav', 'ogg', 'aac'].includes(ext);
    const isVideo = ['mp4', 'webm', 'mov'].includes(ext);

    if (isImage || isPdf || isAudio || isVideo) {
      const presignedUrl = await this.generatePresignedUrl(profile, bucket, key, 3600);
      let type: FilePreviewData['type'] = 'binary';
      if (isImage) type = 'image';
      else if (isPdf) type = 'pdf';
      else if (isAudio) type = 'audio';
      else if (isVideo) type = 'video';

      return {
        type,
        url: presignedUrl,
        size,
        mimeType: detectedMime,
        name: path.basename(key),
      };
    }

    if (isText && size < 5 * 1024 * 1024) {
      // Load text content directly (up to 5MB)
      const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const text = await obj.Body?.transformToString('utf-8');
      return {
        type: 'text',
        text: text || '',
        size,
        mimeType: detectedMime || 'text/plain',
        name: path.basename(key),
      };
    }

    return {
      type: 'binary',
      size,
      mimeType: detectedMime,
      name: path.basename(key),
    };
  }

  private thumbnailCacheDir: string | null = null;
  private thumbnailQueue: Array<() => Promise<void>> = [];
  private activeThumbnailTasks = 0;
  private readonly MAX_CONCURRENT_THUMBNAILS = 4;

  private getThumbnailCacheDir(): string {
    if (!this.thumbnailCacheDir) {
      this.thumbnailCacheDir = path.join(app.getPath('userData'), 'thumbnails');
      if (!fs.existsSync(this.thumbnailCacheDir)) {
        fs.mkdirSync(this.thumbnailCacheDir, { recursive: true });
      }
    }
    return this.thumbnailCacheDir;
  }

  private processNextThumbnail(): void {
    if (this.activeThumbnailTasks >= this.MAX_CONCURRENT_THUMBNAILS) return;
    const nextTask = this.thumbnailQueue.shift();
    if (nextTask) {
      this.activeThumbnailTasks++;
      nextTask();
    }
  }

  public async getThumbnail(
    profile: S3Profile,
    bucket: string,
    key: string
  ): Promise<string | null> {
    const cacheDir = this.getThumbnailCacheDir();
    const hash = crypto
      .createHash('md5')
      .update(`${profile.endpoint}_${bucket}_${key}`)
      .digest('hex');
    const cacheFile = path.join(cacheDir, `${hash}.jpg`);

    // 1. Check local persistent disk cache first (0 network latency!)
    if (fs.existsSync(cacheFile)) {
      try {
        const buf = fs.readFileSync(cacheFile);
        return `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch {
        // if file corrupted, regenerate below
      }
    }

    // 2. Fetch and generate downscaled thumbnail via concurrency queue
    return new Promise<string | null>((resolve) => {
      const task = async () => {
        try {
          const client = this.getClient(profile);

          // HeadObject to verify size before fetching
          const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          const size = head.ContentLength || 0;

          // If file is excessively large (> 30MB), do not auto-download for thumbnail
          if (size > 30 * 1024 * 1024) {
            resolve(null);
            return;
          }

          const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          if (!res.Body) {
            resolve(null);
            return;
          }

          const chunks: Uint8Array[] = [];
          const stream = res.Body as any;
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          const fullBuffer = Buffer.concat(chunks);

          // Use Electron's nativeImage to decode & downscale to thumbnail resolution
          const image = nativeImage.createFromBuffer(fullBuffer);
          if (image.isEmpty()) {
            resolve(null);
            return;
          }

          const originalSize = image.getSize();
          const maxDimension = 220; // 220px is crisp for grid view while extremely lightweight
          let targetWidth = originalSize.width;
          let targetHeight = originalSize.height;

          if (originalSize.width > maxDimension || originalSize.height > maxDimension) {
            if (originalSize.width > originalSize.height) {
              targetWidth = maxDimension;
              targetHeight = Math.max(1, Math.round((originalSize.height / originalSize.width) * maxDimension));
            } else {
              targetHeight = maxDimension;
              targetWidth = Math.max(1, Math.round((originalSize.width / originalSize.height) * maxDimension));
            }
          }

          // Resized image
          const resized = image.resize({
            width: targetWidth,
            height: targetHeight,
            quality: 'better',
          });

          // Compress to JPEG 75% (~10-25 KB per thumbnail)
          const jpegBuffer = resized.toJPEG(75);
          fs.writeFileSync(cacheFile, jpegBuffer);

          resolve(`data:image/jpeg;base64,${jpegBuffer.toString('base64')}`);
        } catch (err) {
          console.error('Failed to generate thumbnail for', key, err);
          resolve(null);
        } finally {
          this.activeThumbnailTasks--;
          this.processNextThumbnail();
        }
      };

      this.thumbnailQueue.push(task);
      this.processNextThumbnail();
    });
  }
}
