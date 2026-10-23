import { app, BrowserWindow, Menu, ipcMain, dialog, nativeImage, clipboard } from 'electron';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { S3Service } from './s3-service';
import { ProfileStore } from './profile-store';
import { FileWatcherService } from './file-watcher';
import { MinioAdminService } from './minio-admin';
import { LicenseService } from './license-service';
import { WebServerService } from './web-server';
import { S3Profile, S3Item, S3Tag } from '../common/types';

app.setName('Syncra');

let mainWindow: BrowserWindow | null = null;
const s3Service = new S3Service();
const profileStore = new ProfileStore();
const minioAdmin = new MinioAdminService();
const licenseService = new LicenseService();
const webServer = new WebServerService(s3Service, minioAdmin, licenseService);
let watcherService: FileWatcherService | null = null;

function getAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../public/icon.png'),
    path.join(__dirname, '../../dist/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../marketing/03_visuals/variant_2_squircle_s_cloud_512.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function migrateLegacyUserData() {
  try {
    const oldUserData = path.join(process.env.APPDATA || '', 's3-desktop-explorer');
    const newUserData = app.getPath('userData');
    if (fs.existsSync(oldUserData) && path.resolve(oldUserData) !== path.resolve(newUserData)) {
      if (!fs.existsSync(newUserData)) {
        fs.mkdirSync(newUserData, { recursive: true });
      }
      const filesToMigrate = [
        's3_profiles.json',
        's3_active_profile.txt',
        'license_data.json',
        's3_webserver_config.json',
      ];
      for (const f of filesToMigrate) {
        const srcFile = path.join(oldUserData, f);
        const dstFile = path.join(newUserData, f);
        if (fs.existsSync(srcFile) && !fs.existsSync(dstFile)) {
          fs.copyFileSync(srcFile, dstFile);
        }
      }
      const srcMc = path.join(oldUserData, 'mc_config');
      const dstMc = path.join(newUserData, 'mc_config');
      if (fs.existsSync(srcMc) && !fs.existsSync(dstMc)) {
        fs.cpSync(srcMc, dstMc, { recursive: true });
      }
    }
  } catch (err) {
    console.error('[Syncra] Legacy migration check failed:', err);
  }
}

function createWindow() {
  const appIcon = getAppIconPath();

  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Syncra',
    icon: appIcon,
    backgroundColor: '#020617', // slate-950
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  watcherService = new FileWatcherService(s3Service);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL(devServerUrl).catch(() => {
      // If dev server not yet started or failed, try loading dist
      const indexPath = path.join(__dirname, '../../dist/index.html');
      mainWindow?.loadFile(indexPath);
    });
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  migrateLegacyUserData();
  createWindow();

  // Initialize license status on startup
  licenseService.getLicenseStatus().catch((err) => console.error('Failed to init license:', err));

  // Auto-start Web Server if enabled in config
  try {
    const webConfig = webServer.getAutoStartConfig();
    if (webConfig.autoStart) {
      console.log(`[WebServer] Auto-start is enabled. Starting web server on port ${webConfig.port}...`);
      webServer.start(webConfig.port).catch((err) => {
        console.error('[WebServer] Auto-start failed on boot:', err);
      });
    }
  } catch (err) {
    console.error('[WebServer] Failed to check auto-start config on boot:', err);
  }

  // Profile IPC handlers
  ipcMain.handle('profiles:list', async () => {
    return profileStore.getProfiles();
  });

  ipcMain.handle('profiles:save', async (_event, profile: S3Profile) => {
    return profileStore.saveProfile(profile, licenseService.isPro());
  });

  ipcMain.handle('profiles:delete', async (_event, id: string) => {
    await minioAdmin.removeMcAlias(id);
    return profileStore.deleteProfile(id);
  });

  ipcMain.handle('profiles:getActiveId', async () => {
    return profileStore.getActiveProfileId();
  });

  ipcMain.handle('profiles:setActiveId', async (_event, id: string) => {
    profileStore.setActiveProfileId(id);
  });

  ipcMain.handle('profiles:test', async (_event, profile: S3Profile) => {
    return await s3Service.testConnection(profile);
  });

  // S3 IPC handlers
  ipcMain.handle('s3:listBuckets', async (_event, profile: S3Profile) => {
    return await s3Service.listBuckets(profile);
  });

  ipcMain.handle('s3:createBucket', async (_event, profile: S3Profile, bucketName: string) => {
    return await s3Service.createBucket(profile, bucketName);
  });

  ipcMain.handle('s3:deleteBucket', async (_event, profile: S3Profile, bucketName: string) => {
    return await s3Service.deleteBucket(profile, bucketName);
  });

  ipcMain.handle(
    's3:renameBucket',
    async (_event, profile: S3Profile, oldBucketName: string, newBucketName: string) => {
      return await s3Service.renameBucket(profile, oldBucketName, newBucketName);
    }
  );

  ipcMain.handle(
    's3:listObjects',
    async (_event, profile: S3Profile, bucket: string, prefix?: string, token?: string) => {
      return await s3Service.listObjects(profile, bucket, prefix, token);
    }
  );

  ipcMain.handle(
    's3:headObject',
    async (_event, profile: S3Profile, bucket: string, key: string) => {
      return await s3Service.headObject(profile, bucket, key);
    }
  );

  ipcMain.handle(
    's3:createFolder',
    async (_event, profile: S3Profile, bucket: string, folderKey: string) => {
      return await s3Service.createFolder(profile, bucket, folderKey);
    }
  );

  ipcMain.handle(
    's3:deleteObjects',
    async (_event, profile: S3Profile, bucket: string, keys: string[]) => {
      return await s3Service.deleteObjects(profile, bucket, keys);
    }
  );

  ipcMain.handle(
    's3:getPresignedUrl',
    async (_event, profile: S3Profile, bucket: string, key: string, expiresIn?: number) => {
      return await s3Service.generatePresignedUrl(profile, bucket, key, expiresIn);
    }
  );

  ipcMain.handle(
    's3:getPreview',
    async (_event, profile: S3Profile, bucket: string, key: string) => {
      return await s3Service.getObjectPreview(profile, bucket, key);
    }
  );

  ipcMain.handle(
    's3:getThumbnail',
    async (_event, profile: S3Profile, bucket: string, key: string) => {
      return await s3Service.getThumbnail(profile, bucket, key);
    }
  );

  ipcMain.handle(
    's3:downloadFile',
    async (
      event,
      transferId: string,
      profile: S3Profile,
      bucket: string,
      key: string,
      targetPath: string
    ) => {
      let lastTime = Date.now();
      let lastBytes = 0;
      let lastEmitTime = 0;

      return await s3Service.downloadFile(profile, bucket, key, targetPath, (transferred, total) => {
        const now = Date.now();
        if (now - lastEmitTime >= 150 || transferred >= total) {
          const timeDiff = Math.max(0.001, (now - lastTime) / 1000);
          const bytesDiff = Math.max(0, transferred - lastBytes);
          const speedBytesPerSec = bytesDiff / timeDiff;
          lastTime = now;
          lastBytes = transferred;
          lastEmitTime = now;

          const progress = total > 0 ? Number(((transferred / total) * 100).toFixed(2)) : 0;
          event.sender.send('transfer:progress', {
            id: transferId,
            transferredBytes: transferred,
            totalBytes: total,
            progress,
            speedBytesPerSec,
          });
        }
      });
    }
  );

  ipcMain.handle(
    's3:uploadFile',
    async (
      event,
      transferId: string,
      profile: S3Profile,
      bucket: string,
      key: string,
      localFilePath: string
    ) => {
      let lastTime = Date.now();
      let lastBytes = 0;
      let lastEmitTime = 0;

      return await s3Service.uploadFile(profile, bucket, key, localFilePath, (transferred, total) => {
        // Avoid IPC flooding for small files (<= 512KB) which complete in milliseconds
        if (total <= 512 * 1024) return;

        const now = Date.now();
        if (now - lastEmitTime >= 180 || transferred >= total) {
          const timeDiff = Math.max(0.001, (now - lastTime) / 1000);
          const bytesDiff = Math.max(0, transferred - lastBytes);
          const speedBytesPerSec = bytesDiff / timeDiff;
          lastTime = now;
          lastBytes = transferred;
          lastEmitTime = now;

          const progress = total > 0 ? Number(((transferred / total) * 100).toFixed(2)) : 0;
          event.sender.send('transfer:progress', {
            id: transferId,
            transferredBytes: transferred,
            totalBytes: total,
            progress,
            speedBytesPerSec,
          });
        }
      });
    }
  );

  ipcMain.handle(
    's3:listAllObjectsInFolder',
    async (_event, profile: S3Profile, bucket: string, prefix: string) => {
      return await s3Service.listAllObjectsUnderPrefix(profile, bucket, prefix);
    }
  );

  ipcMain.handle(
    's3:streamFolderDiscovery',
    async (
      event,
      discoveryId: string,
      profile: S3Profile,
      bucket: string,
      prefix: string
    ) => {
      return await s3Service.streamObjectsUnderPrefix(
        profile,
        bucket,
        prefix,
        (batch, isTruncated) => {
          try {
            event.sender.send('s3:discoveryBatch', {
              discoveryId,
              bucket,
              prefix,
              objects: batch,
              isTruncated,
            });
          } catch {}
        }
      );
    }
  );

  // Helper to build Windows CF_HDROP struct buffer for clipboard file paste
  function createHDropBuffer(filePaths: string[]): Buffer {
    const header = Buffer.alloc(20);
    header.writeUInt32LE(20, 0); // pFiles: offset to file list
    header.writeInt32LE(0, 4);   // pt.x
    header.writeInt32LE(0, 8);   // pt.y
    header.writeInt32LE(0, 12);  // fNC
    header.writeInt32LE(1, 16);  // fWide: 1 (Unicode UTF-16LE)

    const pathBuffers = filePaths.map((p) => Buffer.from(p + '\0', 'utf16le'));
    const terminatingNull = Buffer.from('\0', 'utf16le');
    return Buffer.concat([header, ...pathBuffers, terminatingNull]);
  }

  const execFileAsync = promisify(execFile);

  // Cross-platform helper to register downloaded files into the OS clipboard as real files
  async function copyFilesToOSClipboard(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;

    if (process.platform === 'win32') {
      try {
        const hDrop = createHDropBuffer(filePaths);
        clipboard.writeBuffer('CF_HDROP', hDrop);

        const dropEffect = Buffer.alloc(4);
        dropEffect.writeUInt32LE(1, 0); // DROPEFFECT_COPY = 1
        clipboard.writeBuffer('Preferred DropEffect', dropEffect);
      } catch (err) {
        console.warn('[Clipboard] Error writing CF_HDROP buffer:', err);
      }

      // PowerShell Set-Clipboard -Path ensures 100% full compatibility in all Windows Explorer & Desktop paste contexts
      try {
        const escapedPaths = filePaths.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');
        const psScript = `Set-Clipboard -Path @(${escapedPaths})`;
        const encodedCmd = Buffer.from(psScript, 'utf16le').toString('base64');
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encodedCmd,
        ]);
      } catch (psErr) {
        console.warn('[Clipboard] PowerShell Set-Clipboard error:', psErr);
      }
    } else if (process.platform === 'darwin') {
      try {
        const appleScriptPaths = filePaths
          .map((p) => `POSIX file "${p.replace(/"/g, '\\"')}"`)
          .join(', ');
        await execFileAsync('osascript', ['-e', `set the clipboard to {${appleScriptPaths}}`]);
      } catch (macErr) {
        console.warn('[Clipboard] macOS AppleScript clipboard error:', macErr);
        clipboard.writeText(filePaths.join('\n'));
      }
    } else {
      try {
        const uriList = filePaths
          .map((p) => {
            const encoded = encodeURI(p).replace(/#/g, '%23');
            return `file://${encoded}`;
          })
          .join('\r\n');
        clipboard.writeBuffer('text/uri-list', Buffer.from(uriList, 'utf8'));
        clipboard.writeBuffer(
          'x-special/gnome-copied-files',
          Buffer.from(`copy\n${uriList.replace(/\r\n/g, '\n')}`, 'utf8')
        );
      } catch (linErr) {
        console.warn('[Clipboard] Linux clipboard error:', linErr);
        clipboard.writeText(filePaths.join('\n'));
      }
    }
  }

  // Native OS Clipboard Copy: Downloads selected files/folders to temporary storage and writes file references to OS clipboard
  ipcMain.handle(
    's3:copyToClipboard',
    async (
      _event,
      payload: { profile: S3Profile; bucket: string; items: S3Item[] }
    ) => {
      try {
        const { profile, bucket, items } = payload;
        if (!items || items.length === 0) {
          return { success: false, count: 0, error: 'Нет выбранных объектов для копирования' };
        }

        const baseClipDir = path.join(app.getPath('temp'), 's3_clipboard_files');

        // Cleanup older clipboard sessions (> 2 hours old)
        try {
          if (fs.existsSync(baseClipDir)) {
            const now = Date.now();
            const entries = fs.readdirSync(baseClipDir);
            for (const entry of entries) {
              const fullEntryPath = path.join(baseClipDir, entry);
              try {
                const stats = fs.statSync(fullEntryPath);
                if (now - stats.mtimeMs > 2 * 60 * 60 * 1000) {
                  fs.rmSync(fullEntryPath, { recursive: true, force: true });
                }
              } catch (_) {}
            }
          }
        } catch (_) {}

        const sessionDir = path.join(
          baseClipDir,
          `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
        );
        fs.mkdirSync(sessionDir, { recursive: true });

        const downloadedPaths: string[] = [];

        for (const item of items) {
          if (item.isPrefix) {
            const folderSegments = item.key.replace(/\/+$/, '').split('/').filter(Boolean);
            const folderName =
              folderSegments.length > 0 ? folderSegments[folderSegments.length - 1] : item.name;
            const targetFolder = path.join(sessionDir, folderName);
            fs.mkdirSync(targetFolder, { recursive: true });
            await s3Service.downloadDirectory(profile, bucket, item.key, sessionDir);
            downloadedPaths.push(targetFolder);
          } else {
            const localFilePath = path.join(sessionDir, item.name);
            await s3Service.downloadFile(profile, bucket, item.key, localFilePath);
            downloadedPaths.push(localFilePath);
          }
        }

        if (downloadedPaths.length === 0) {
          return { success: false, count: 0, error: 'Файлы не были загружены' };
        }

        await copyFilesToOSClipboard(downloadedPaths);

        return { success: true, count: downloadedPaths.length };
      } catch (err: any) {
        console.error('[Clipboard] Failed to copy files to OS clipboard:', err);
        return { success: false, count: 0, error: err?.message || 'Не удалось скопировать файлы' };
      }
    }
  );

  ipcMain.handle(
    's3:saveTextContent',
    async (_event, profile: S3Profile, bucket: string, key: string, content: string) => {
      if (!licenseService.isPro()) {
        throw new Error('Редактирование файлов в Monaco доступно только в Pro-версии или в течение пробного периода.');
      }
      return await s3Service.uploadTextContent(profile, bucket, key, content);
    }
  );

  ipcMain.handle(
    's3:scanLocalPath',
    async (_event, localPath: string) => {
      return await s3Service.scanLocalPath(localPath);
    }
  );

  ipcMain.handle(
    's3:scanLocalPaths',
    async (_event, localPaths: string[]) => {
      return await s3Service.scanLocalPaths(localPaths);
    }
  );

  ipcMain.handle(
    's3:downloadDirectory',
    async (_event, profile: S3Profile, bucket: string, prefix: string, targetLocalDir: string) => {
      return await s3Service.downloadDirectory(profile, bucket, prefix, targetLocalDir);
    }
  );

  ipcMain.handle(
    's3:moveObjects',
    async (
      _event,
      profile: S3Profile,
      bucket: string,
      items: { key: string; isPrefix: boolean }[],
      targetPrefix: string
    ) => {
      return await s3Service.moveObjects(profile, bucket, items, targetPrefix);
    }
  );

  ipcMain.handle(
    's3:renameObject',
    async (
      _event,
      profile: S3Profile,
      bucket: string,
      oldKey: string,
      newName: string,
      isPrefix: boolean
    ) => {
      return await s3Service.renameObject(profile, bucket, oldKey, newName, isPrefix);
    }
  );

  ipcMain.handle(
    's3:openExternal',
    async (_event, profile: S3Profile, bucket: string, key: string, enableEditInPlace: boolean) => {
      if (!mainWindow || !watcherService) {
        throw new Error('Окно приложения недоступно');
      }
      // Strictly enforce Pro status for Edit-in-Place!
      const canEditInPlace = enableEditInPlace && licenseService.isPro();
      return await watcherService.openInExternalApp(
        profile,
        bucket,
        key,
        mainWindow,
        canEditInPlace
      );
    }
  );

  // Bucket Policy & Versioning IPC handlers
  ipcMain.handle('s3:getBucketPolicy', async (_event, profile: S3Profile, bucket: string) => {
    return await s3Service.getBucketPolicy(profile, bucket);
  });

  ipcMain.handle(
    's3:setBucketPolicy',
    async (_event, profile: S3Profile, bucket: string, policyJson: string) => {
      return await s3Service.setBucketPolicy(profile, bucket, policyJson);
    }
  );

  ipcMain.handle('s3:deleteBucketPolicy', async (_event, profile: S3Profile, bucket: string) => {
    return await s3Service.deleteBucketPolicy(profile, bucket);
  });

  ipcMain.handle('s3:getBucketVersioning', async (_event, profile: S3Profile, bucket: string) => {
    return await s3Service.getBucketVersioning(profile, bucket);
  });

  ipcMain.handle(
    's3:setBucketVersioning',
    async (_event, profile: S3Profile, bucket: string, enabled: boolean) => {
      return await s3Service.setBucketVersioning(profile, bucket, enabled);
    }
  );

  ipcMain.handle(
    's3:getObjectTags',
    async (_event, profile: S3Profile, bucket: string, key: string) => {
      return await s3Service.getObjectTags(profile, bucket, key);
    }
  );

  ipcMain.handle(
    's3:getBatchObjectTags',
    async (_event, profile: S3Profile, bucket: string, keys: string[]) => {
      return await s3Service.getBatchObjectTags(profile, bucket, keys);
    }
  );

  ipcMain.handle(
    's3:putObjectTags',
    async (_event, profile: S3Profile, bucket: string, key: string, tags: S3Tag[]) => {
      return await s3Service.putObjectTags(profile, bucket, key, tags);
    }
  );

  ipcMain.handle(
    's3:deleteObjectTags',
    async (_event, profile: S3Profile, bucket: string, key: string) => {
      return await s3Service.deleteObjectTags(profile, bucket, key);
    }
  );

  // MinIO Admin API IPC handlers (Strictly gated for Pro / 14-day Trial)
  const requirePro = () => {
    if (!licenseService.isPro()) {
      throw new Error(
        'Функция управления сервером и IAM доступна только в Pro-версии или во время 14-дневного пробного периода.'
      );
    }
  };

  ipcMain.handle('auth:checkPermissions', async (_event, profile: S3Profile, bucket?: string) => {
    return await minioAdmin.checkPermissions(profile, bucket);
  });

  ipcMain.handle('admin:getClusterInfo', async (_event, profile: S3Profile) => {
    requirePro();
    return await minioAdmin.getClusterInfo(profile);
  });

  ipcMain.handle('admin:listUsers', async (_event, profile: S3Profile) => {
    requirePro();
    return await minioAdmin.listUsers(profile);
  });

  ipcMain.handle(
    'admin:createUser',
    async (
      _event,
      profile: S3Profile,
      accessKey: string,
      secretKey: string,
      policyName?: string
    ) => {
      requirePro();
      return await minioAdmin.createUser(profile, accessKey, secretKey, policyName);
    }
  );

  ipcMain.handle(
    'admin:setUserStatus',
    async (_event, profile: S3Profile, accessKey: string, status: 'enabled' | 'disabled') => {
      requirePro();
      return await minioAdmin.setUserStatus(profile, accessKey, status);
    }
  );

  ipcMain.handle('admin:deleteUser', async (_event, profile: S3Profile, accessKey: string) => {
    requirePro();
    return await minioAdmin.deleteUser(profile, accessKey);
  });

  ipcMain.handle(
    'admin:setUserPolicy',
    async (_event, profile: S3Profile, accessKey: string, policyName: string) => {
      requirePro();
      return await minioAdmin.setUserPolicy(profile, accessKey, policyName);
    }
  );

  ipcMain.handle('admin:listPolicies', async (_event, profile: S3Profile) => {
    requirePro();
    return await minioAdmin.listPolicies(profile);
  });

  ipcMain.handle('admin:getPolicy', async (_event, profile: S3Profile, name: string) => {
    requirePro();
    return await minioAdmin.getPolicy(profile, name);
  });

  ipcMain.handle(
    'admin:addPolicy',
    async (_event, profile: S3Profile, name: string, policyJson: string) => {
      requirePro();
      return await minioAdmin.addPolicy(profile, name, policyJson);
    }
  );

  ipcMain.handle('admin:deletePolicy', async (_event, profile: S3Profile, name: string) => {
    requirePro();
    return await minioAdmin.deletePolicy(profile, name);
  });

  // MinIO Groups IPC handlers
  ipcMain.handle('admin:listGroups', async (_event, profile: S3Profile) => {
    requirePro();
    return await minioAdmin.listGroups(profile);
  });

  ipcMain.handle('admin:getGroupInfo', async (_event, profile: S3Profile, groupName: string) => {
    requirePro();
    return await minioAdmin.getGroupInfo(profile, groupName);
  });

  ipcMain.handle(
    'admin:createOrUpdateGroup',
    async (
      _event,
      profile: S3Profile,
      groupName: string,
      members: string[],
      policyName?: string
    ) => {
      requirePro();
      return await minioAdmin.createOrUpdateGroup(profile, groupName, members, policyName);
    }
  );

  ipcMain.handle(
    'admin:setGroupStatus',
    async (_event, profile: S3Profile, groupName: string, status: 'enabled' | 'disabled') => {
      requirePro();
      return await minioAdmin.setGroupStatus(profile, groupName, status);
    }
  );

  ipcMain.handle(
    'admin:setGroupPolicy',
    async (_event, profile: S3Profile, groupName: string, policyName: string) => {
      requirePro();
      return await minioAdmin.setGroupPolicy(profile, groupName, policyName);
    }
  );

  ipcMain.handle('admin:deleteGroup', async (_event, profile: S3Profile, groupName: string) => {
    requirePro();
    return await minioAdmin.deleteGroup(profile, groupName);
  });

  ipcMain.handle('admin:getBucketStat', async (_event, profile: S3Profile, bucketName: string) => {
    if (!licenseService.isPro()) return { name: bucketName, size: 0, objectsCount: 0 };
    return await minioAdmin.getBucketStat(profile, bucketName);
  });

  ipcMain.handle(
    'admin:getAllBucketsStats',
    async (_event, profile: S3Profile, bucketNames: string[]) => {
      if (!licenseService.isPro()) return {};
      return await minioAdmin.getAllBucketsStats(profile, bucketNames);
    }
  );

  ipcMain.handle('admin:getCompressionConfig', async (_event, profile: S3Profile) => {
    requirePro();
    return await minioAdmin.getCompressionConfig(profile);
  });

  ipcMain.handle(
    'admin:setCompressionConfig',
    async (_event, profile: S3Profile, config: any) => {
      requirePro();
      return await minioAdmin.setCompressionConfig(profile, config);
    }
  );

  ipcMain.handle('admin:resetCompressionConfig', async (_event, profile: S3Profile) => {
    requirePro();
    return await minioAdmin.resetCompressionConfig(profile);
  });

  ipcMain.handle('admin:exportConfig', async (_event, profile: S3Profile) => {
    requirePro();
    return await minioAdmin.exportConfig(profile);
  });

  ipcMain.handle(
    'admin:importConfig',
    async (_event, profile: S3Profile, content: string) => {
      requirePro();
      return await minioAdmin.importConfig(profile, content);
    }
  );

  // Watcher IPC handlers
  ipcMain.handle('watcher:saveBack', async (_event, bucket: string, key: string) => {
    if (!watcherService) return false;
    return await watcherService.saveBackToS3(bucket, key);
  });

  ipcMain.handle('watcher:stopWatching', async (_event, bucket: string, key: string) => {
    if (watcherService) {
      watcherService.stopWatching(bucket, key);
    }
  });

  // Native Dialog IPC handlers
  ipcMain.handle('dialog:save', async (_event, options: { defaultPath?: string }) => {
    if (!mainWindow) return undefined;
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options.defaultPath,
    });
    return res.canceled ? undefined : res.filePath;
  });

  ipcMain.handle(
    'dialog:open',
    async (_event, options: { properties: ('openFile' | 'openDirectory' | 'multiSelections')[] }) => {
      if (!mainWindow) return undefined;
      const res = await dialog.showOpenDialog(mainWindow, {
        properties: options.properties,
      });
      return res.canceled ? undefined : res.filePaths;
    }
  );

  // License & Pro Trial IPC handlers
  ipcMain.handle('license:getStatus', async () => {
    return await licenseService.getLicenseStatus(true);
  });

  ipcMain.handle('license:activateKey', async (_event, key: string) => {
    return await licenseService.activateLicenseKey(key);
  });

  // Web Server IPC handlers
  ipcMain.handle('webserver:getStatus', async () => {
    return webServer.getStatus();
  });

  ipcMain.handle('webserver:start', async (_event, port?: number) => {
    return await webServer.start(port || 8080);
  });

  ipcMain.handle('webserver:stop', async () => {
    return await webServer.stop();
  });

  ipcMain.handle('webserver:openInBrowser', async (_event, url?: string) => {
    webServer.openInBrowser(url);
  });

  ipcMain.handle('webserver:getAutoStart', async () => {
    return webServer.getAutoStartConfig();
  });

  ipcMain.handle('webserver:setAutoStart', async (_event, autoStart: boolean, port?: number) => {
    return webServer.saveAutoStartConfig(autoStart, port);
  });

  ipcMain.handle('webserver:getConfig', async () => {
    return webServer.getConfig();
  });

  ipcMain.handle('webserver:saveConfig', async (_event, config: any) => {
    return webServer.saveConfig(config);
  });

  ipcMain.handle('webserver:getDevices', async () => {
    return webServer.getDevices();
  });

  ipcMain.handle('webserver:forgetDevice', async (_event, deviceId: string) => {
    return webServer.forgetDevice(deviceId);
  });

  ipcMain.handle('webserver:clearDevices', async () => {
    return webServer.clearDevices();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (watcherService) {
    watcherService.cleanup();
  }
  if (webServer) {
    webServer.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
