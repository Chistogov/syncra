import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import chokidar, { FSWatcher } from 'chokidar';
import { S3Service } from './s3-service';
import { S3Profile, WatcherEvent } from '../common/types';

interface TrackedFile {
  bucket: string;
  key: string;
  localPath: string;
  profile: S3Profile;
  watcher: FSWatcher;
  lastUploadedAt: number;
}

export class FileWatcherService {
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private tempBaseDir: string;
  private s3Service: S3Service;

  constructor(s3Service: S3Service) {
    this.s3Service = s3Service;
    this.tempBaseDir = path.join(app.getPath('temp'), 'syncra');
    if (!fs.existsSync(this.tempBaseDir)) {
      fs.mkdirSync(this.tempBaseDir, { recursive: true });
    }
  }

  public getTempDir(): string {
    return this.tempBaseDir;
  }

  public async openInExternalApp(
    profile: S3Profile,
    bucket: string,
    key: string,
    window: BrowserWindow,
    enableEditInPlace: boolean = true
  ): Promise<{ success: boolean; localPath: string; error?: string }> {
    try {
      const sanitizedKey = key.replace(/[/\\?%*:|"<>]/g, '_');
      const targetDir = path.join(this.tempBaseDir, bucket, path.dirname(key));
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const fileName = path.basename(key);
      const localFilePath = path.join(targetDir, fileName);

      // Download file from S3 to temp location
      await this.s3Service.downloadFile(profile, bucket, key, localFilePath);

      // Open with associated default OS program
      const openResult = await shell.openPath(localFilePath);
      if (openResult) {
        // If non-empty string, it's an error message
        return { success: false, localPath: localFilePath, error: openResult };
      }

      // If Edit-in-Place is enabled (Pro feature), start watching file for modifications
      if (enableEditInPlace) {
        this.watchFile(profile, bucket, key, localFilePath, window);
      }

      return { success: true, localPath: localFilePath };
    } catch (err: any) {
      console.error('Failed to open external app:', err);
      return { success: false, localPath: '', error: err.message };
    }
  }

  private watchFile(
    profile: S3Profile,
    bucket: string,
    key: string,
    localPath: string,
    window: BrowserWindow
  ): void {
    const fileKey = `${bucket}:${key}`;

    if (this.trackedFiles.has(fileKey)) {
      // Already tracked
      return;
    }

    let debounceTimer: NodeJS.Timeout | null = null;

    const watcher = chokidar.watch(localPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    watcher.on('change', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const eventData: WatcherEvent = {
          bucket,
          key,
          localPath,
          modifiedAt: Date.now(),
        };

        // Notify UI that a tracked file was modified in Word/Excel/etc.
        if (!window.isDestroyed()) {
          window.webContents.send('watcher:file-changed', eventData);
        }
      }, 500);
    });

    watcher.on('unlink', () => {
      this.stopWatching(bucket, key);
    });

    this.trackedFiles.set(fileKey, {
      bucket,
      key,
      localPath,
      profile,
      watcher,
      lastUploadedAt: Date.now(),
    });
  }

  public async saveBackToS3(bucket: string, key: string): Promise<boolean> {
    const fileKey = `${bucket}:${key}`;
    const tracked = this.trackedFiles.get(fileKey);
    if (!tracked) {
      throw new Error(`Файл ${key} не найден среди отслеживаемых`);
    }

    if (!fs.existsSync(tracked.localPath)) {
      throw new Error(`Локальный файл ${tracked.localPath} больше не существует`);
    }

    await this.s3Service.uploadFile(tracked.profile, bucket, key, tracked.localPath);
    tracked.lastUploadedAt = Date.now();
    return true;
  }

  public stopWatching(bucket: string, key: string): void {
    const fileKey = `${bucket}:${key}`;
    const tracked = this.trackedFiles.get(fileKey);
    if (tracked) {
      tracked.watcher.close();
      this.trackedFiles.delete(fileKey);
    }
  }

  public cleanup(): void {
    for (const [, tracked] of this.trackedFiles) {
      tracked.watcher.close();
    }
    this.trackedFiles.clear();
  }
}
