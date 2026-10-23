import {
  S3Profile,
  S3Bucket,
  S3Item,
  ListObjectsResult,
  FilePreviewData,
  ScannedFile,
  S3ObjectSummary,
  DiscoveryBatchPayload,
  DownloadResult,
  MinioClusterInfo,
  MinioUser,
  MinioGroup,
  MinioPolicy,
  MinioBucketStat,
  MinioCompressionConfig,
  LicenseStatus,
  TransferProgressPayload,
  WebServerStatus,
  S3Tag,
  UserPermissions,
} from '../../common/types';

// In-memory file registry for browser file uploads and drag-and-drop
const browserFileStore = new Map<string, File>();
const transferProgressListeners = new Set<(payload: TransferProgressPayload) => void>();

const TOKEN_KEY = 's3_web_auth_token';
const DEVICE_ID_KEY = 's3_web_device_id';

export function getOrCreateDeviceId(): string {
  let devId = localStorage.getItem(DEVICE_ID_KEY);
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, devId);
  }
  return devId;
}

export function getStoredWebToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setStoredWebToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredWebToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

function notifyTransferProgress(payload: TransferProgressPayload) {
  transferProgressListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch {}
  });
}

async function apiFetch<T>(endpoint: string, body?: any, method: string = 'POST'): Promise<T> {
  const token = getStoredWebToken();
  const deviceId = getOrCreateDeviceId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }

  const options: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(endpoint, options);
  if (response.status === 401 && endpoint !== '/api/auth/verifyPin') {
    clearStoredWebToken();
    window.dispatchEvent(new CustomEvent('s3:webAuthRequired'));
    throw new Error('Требуется ввод 6-значного PIN-кода доступа');
  }

  if (!response.ok) {
    let errMsg = `Server error ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {}
    throw new Error(errMsg);
  }
  return await response.json();
}

/**
 * Creates the browser electronAPI polyfill for standard web browsers
 * Storage for profiles and connection parameters is strictly kept in localStorage/cookie
 */
export function initBrowserElectronAPI() {
  if (typeof window === 'undefined' || (window as any).electronAPI) {
    return;
  }

  const PROFILES_STORAGE_KEY = 's3_browser_profiles_store';
  const ACTIVE_PROFILE_KEY = 's3_browser_active_profile_id';

  const getStoredProfiles = (): S3Profile[] => {
    try {
      const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  };

  const saveStoredProfiles = (list: S3Profile[]) => {
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(list));
      // Also mirror active profile in cookie for extra persistence
      const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY) || (list[0]?.id || '');
      document.cookie = `s3_active_prof=${encodeURIComponent(activeId)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  };

  const browserAPI = {
    // 1. Profile Management (Stored purely in browser localStorage & cookies)
    profiles: {
      list: async (): Promise<S3Profile[]> => {
        return getStoredProfiles();
      },
      save: async (profile: S3Profile): Promise<{ success: boolean; error?: string }> => {
        try {
          const list = getStoredProfiles();
          const idx = list.findIndex((p) => p.id === profile.id);
          if (idx >= 0) {
            list[idx] = profile;
          } else {
            list.push(profile);
          }
          saveStoredProfiles(list);
          if (!localStorage.getItem(ACTIVE_PROFILE_KEY)) {
            localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
          }
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      },
      delete: async (id: string): Promise<boolean> => {
        const list = getStoredProfiles().filter((p) => p.id !== id);
        saveStoredProfiles(list);
        if (localStorage.getItem(ACTIVE_PROFILE_KEY) === id) {
          localStorage.setItem(ACTIVE_PROFILE_KEY, list[0]?.id || '');
        }
        return true;
      },
      getActiveId: async (): Promise<string> => {
        return localStorage.getItem(ACTIVE_PROFILE_KEY) || getStoredProfiles()[0]?.id || '';
      },
      setActiveId: async (id: string): Promise<void> => {
        localStorage.setItem(ACTIVE_PROFILE_KEY, id);
        document.cookie = `s3_active_prof=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
      },
      test: async (profile: S3Profile) => {
        return await apiFetch<any>('/api/s3/testConnection', { profile });
      },
    },

    // 1.5 Auth & Permissions
    auth: {
      checkPermissions: async (profile: S3Profile, bucket?: string): Promise<UserPermissions> => {
        try {
          return await apiFetch<UserPermissions>('/api/auth/checkPermissions', { profile, bucket });
        } catch {
          return {
            canAdminMinio: false,
            canManageUsers: false,
            canManageRoles: false,
            canManagePolicies: false,
            canCreateBucket: true,
            canDeleteBucket: true,
            canUpload: true,
            canCreateFolder: true,
            canDeleteItems: true,
            canEditTags: true,
            roleName: 'Пользователь S3',
          };
        }
      },
    },

    // 2. S3 Operations
    s3: {
      listBuckets: async (profile: S3Profile): Promise<S3Bucket[]> => {
        return await apiFetch<S3Bucket[]>('/api/s3/listBuckets', { profile });
      },
      createBucket: async (profile: S3Profile, bucketName: string): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/createBucket', { profile, bucketName });
        return res.success;
      },
      deleteBucket: async (profile: S3Profile, bucketName: string): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/deleteBucket', { profile, bucketName });
        return res.success;
      },
      renameBucket: async (
        profile: S3Profile,
        oldBucketName: string,
        newBucketName: string
      ): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/renameBucket', {
          profile,
          oldBucketName,
          newBucketName,
        });
        return res.success;
      },
      listObjects: async (
        profile: S3Profile,
        bucket: string,
        prefix?: string,
        continuationToken?: string
      ): Promise<ListObjectsResult> => {
        return await apiFetch<ListObjectsResult>('/api/s3/listObjects', {
          profile,
          bucket,
          prefix,
          continuationToken,
        });
      },
      headObject: async (
        profile: S3Profile,
        bucket: string,
        key: string
      ): Promise<S3Item | null> => {
        return await apiFetch<S3Item | null>('/api/s3/headObject', {
          profile,
          bucket,
          key,
        });
      },
      createFolder: async (profile: S3Profile, bucket: string, folderKey: string): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/createFolder', {
          profile,
          bucket,
          folderKey,
        });
        return res.success;
      },
      deleteObjects: async (profile: S3Profile, bucket: string, keys: string[]): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/deleteObjects', {
          profile,
          bucket,
          keys,
        });
        return res.success;
      },
      moveObjects: async (
        profile: S3Profile,
        bucket: string,
        items: { key: string; isPrefix: boolean }[],
        targetPrefix: string
      ): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/moveObjects', {
          profile,
          bucket,
          items,
          targetPrefix,
        });
        return res.success;
      },
      renameObject: async (
        profile: S3Profile,
        bucket: string,
        oldKey: string,
        newName: string,
        isPrefix: boolean
      ): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/renameObject', {
          profile,
          bucket,
          oldKey,
          newName,
          isPrefix,
        });
        return res.success;
      },
      getPresignedUrl: async (
        profile: S3Profile,
        bucket: string,
        key: string,
        expiresIn?: number
      ): Promise<string> => {
        const res = await apiFetch<{ url: string }>('/api/s3/getPresignedUrl', {
          profile,
          bucket,
          key,
          expiresIn,
        });
        return res.url;
      },
      getPreview: async (profile: S3Profile, bucket: string, key: string): Promise<FilePreviewData> => {
        return await apiFetch<FilePreviewData>('/api/s3/getPreview', { profile, bucket, key });
      },
      getThumbnail: async (profile: S3Profile, bucket: string, key: string): Promise<string | null> => {
        const res = await apiFetch<{ thumbnail: string | null }>('/api/s3/getThumbnail', {
          profile,
          bucket,
          key,
        });
        return res.thumbnail;
      },
      saveTextContent: async (
        profile: S3Profile,
        bucket: string,
        key: string,
        content: string
      ): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/saveTextContent', {
          profile,
          bucket,
          key,
          content,
        });
        return res.success;
      },
      downloadFile: async (
        transferId: string,
        profile: S3Profile,
        bucket: string,
        key: string,
        _targetPath: string
      ): Promise<DownloadResult> => {
        // Trigger browser native download stream with session token
        const token = getStoredWebToken();
        const url = `/api/s3/download?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(
          key
        )}&profile=${encodeURIComponent(JSON.stringify(profile))}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

        const a = document.createElement('a');
        a.href = url;
        a.download = key.split('/').filter(Boolean).pop() || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        notifyTransferProgress({
          id: transferId,
          transferredBytes: 100,
          totalBytes: 100,
          progress: 100,
          speedBytesPerSec: 0,
        });

        return { targetPath: a.download, durationMs: 100, averageSpeedBytesPerSec: 0 };
      },
      uploadFile: async (
        transferId: string,
        profile: S3Profile,
        bucket: string,
        key: string,
        localFilePath: string
      ): Promise<boolean> => {
        const file = browserFileStore.get(localFilePath);
        if (!file) {
          throw new Error(`Файл не найден в буфере браузера: ${localFilePath}`);
        }

        return new Promise<boolean>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/s3/upload', true);

          const token = getStoredWebToken();
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('x-auth-token', token);
          }
          xhr.setRequestHeader('x-device-id', getOrCreateDeviceId());
          xhr.setRequestHeader('x-s3-bucket', encodeURIComponent(bucket));
          xhr.setRequestHeader('x-s3-key', encodeURIComponent(key));
          xhr.setRequestHeader('x-s3-profile', encodeURIComponent(JSON.stringify(profile)));
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

          let lastTime = Date.now();
          let lastLoaded = 0;

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const now = Date.now();
              const dt = (now - lastTime) / 1000;
              const dBytes = e.loaded - lastLoaded;
              const speed = dt > 0.1 ? dBytes / dt : 0;
              lastTime = now;
              lastLoaded = e.loaded;

              const progress = Math.min(99.9, Math.round((e.loaded / e.total) * 100));
              notifyTransferProgress({
                id: transferId,
                transferredBytes: e.loaded,
                totalBytes: e.total,
                progress,
                speedBytesPerSec: speed,
              });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              notifyTransferProgress({
                id: transferId,
                transferredBytes: file.size,
                totalBytes: file.size,
                progress: 100,
                speedBytesPerSec: 0,
              });
              resolve(true);
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Сетевая ошибка при передаче файла в браузерном режиме'));
          };

          xhr.send(file);
        });
      },
      listAllObjectsInFolder: async (
        profile: S3Profile,
        bucket: string,
        prefix: string
      ): Promise<S3ObjectSummary[]> => {
        const res = await apiFetch<ListObjectsResult>('/api/s3/listObjects', {
          profile,
          bucket,
          prefix,
        });
        return res.items
          .filter((i) => !i.isPrefix)
          .map((i) => ({
            key: i.key,
            size: i.size || 0,
            lastModified: i.lastModified,
            etag: i.eTag,
          }));
      },
      streamFolderDiscovery: async (
        _discoveryId: string,
        profile: S3Profile,
        bucket: string,
        prefix: string
      ): Promise<number> => {
        const res = await apiFetch<ListObjectsResult>('/api/s3/listObjects', {
          profile,
          bucket,
          prefix,
        });
        return res.items.length;
      },
      onDiscoveryBatch: (_callback: (payload: DiscoveryBatchPayload) => void) => {
        return () => {};
      },
      scanLocalPath: async (localPath: string): Promise<ScannedFile[]> => {
        const file = browserFileStore.get(localPath);
        if (file) {
          return [
            {
              localPath,
              relativePath: (file as any).webkitRelativePath || file.name,
              size: file.size,
            },
          ];
        }

        // If scanning a virtual folder, find all files with matching prefix
        const results: ScannedFile[] = [];
        browserFileStore.forEach((f, p) => {
          if (p.startsWith(localPath)) {
            results.push({
              localPath: p,
              relativePath: (f as any).webkitRelativePath || f.name,
              size: f.size,
            });
          }
        });
        return results;
      },
      scanLocalPaths: async (localPaths: string[]): Promise<ScannedFile[]> => {
        const results: ScannedFile[] = [];
        for (const lp of localPaths) {
          const res = await (browserAPI.s3.scanLocalPath(lp));
          results.push(...res);
        }
        return results;
      },
      downloadDirectory: async (): Promise<number> => {
        return 0;
      },
      openExternal: async (
        profile: S3Profile,
        bucket: string,
        key: string
      ): Promise<{ success: boolean; localPath: string; error?: string }> => {
        try {
          const res = await apiFetch<{ url: string }>('/api/s3/getPresignedUrl', {
            profile,
            bucket,
            key,
            expiresIn: 3600,
          });
          window.open(res.url, '_blank');
          return { success: true, localPath: res.url };
        } catch (err: any) {
          return { success: false, localPath: '', error: err.message };
        }
      },
      getBucketPolicy: async (profile: S3Profile, bucket: string): Promise<string | null> => {
        const res = await apiFetch<{ policy: string | null }>('/api/s3/getBucketPolicy', {
          profile,
          bucket,
        });
        return res.policy;
      },
      setBucketPolicy: async (profile: S3Profile, bucket: string, policyJson: string): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/setBucketPolicy', {
          profile,
          bucket,
          policyJson,
        });
        return res.success;
      },
      deleteBucketPolicy: async (profile: S3Profile, bucket: string): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/deleteBucketPolicy', {
          profile,
          bucket,
        });
        return res.success;
      },
      getBucketVersioning: async (profile: S3Profile, bucket: string): Promise<'Enabled' | 'Suspended' | 'None'> => {
        const res = await apiFetch<{ status: 'Enabled' | 'Suspended' | 'None' }>('/api/s3/getBucketVersioning', {
          profile,
          bucket,
        });
        return res.status;
      },
      setBucketVersioning: async (profile: S3Profile, bucket: string, enabled: boolean): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/setBucketVersioning', {
          profile,
          bucket,
          enabled,
        });
        return res.success;
      },
      getObjectTags: async (profile: S3Profile, bucket: string, key: string): Promise<S3Tag[]> => {
        const res = await apiFetch<{ tags: S3Tag[] }>('/api/s3/getObjectTags', {
          profile,
          bucket,
          key,
        });
        return res.tags || [];
      },
      getBatchObjectTags: async (
        profile: S3Profile,
        bucket: string,
        keys: string[]
      ): Promise<Record<string, S3Tag[]>> => {
        const res = await apiFetch<{ tagsMap: Record<string, S3Tag[]> }>('/api/s3/getBatchObjectTags', {
          profile,
          bucket,
          keys,
        });
        return res.tagsMap || {};
      },
      putObjectTags: async (profile: S3Profile, bucket: string, key: string, tags: S3Tag[]): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/putObjectTags', {
          profile,
          bucket,
          key,
          tags,
        });
        return res.success;
      },
      deleteObjectTags: async (profile: S3Profile, bucket: string, key: string): Promise<boolean> => {
        const res = await apiFetch<{ success: boolean }>('/api/s3/deleteObjectTags', {
          profile,
          bucket,
          key,
        });
        return res.success;
      },
    },

    // 3. MinIO Admin Cluster Operations
    admin: {
      getClusterInfo: async (profile: S3Profile): Promise<MinioClusterInfo> => {
        return await apiFetch<MinioClusterInfo>('/api/admin/getClusterInfo', { profile });
      },
      listUsers: async (profile: S3Profile): Promise<MinioUser[]> => {
        return await apiFetch<MinioUser[]>('/api/admin/listUsers', { profile });
      },
      createUser: async (profile: S3Profile, accessKey: string, secretKey: string, policyName?: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/createUser', {
          profile,
          accessKey,
          secretKey,
          policyName,
        });
        return r.success;
      },
      setUserStatus: async (profile: S3Profile, accessKey: string, status: 'enabled' | 'disabled') => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/setUserStatus', {
          profile,
          accessKey,
          status,
        });
        return r.success;
      },
      deleteUser: async (profile: S3Profile, accessKey: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/deleteUser', { profile, accessKey });
        return r.success;
      },
      setUserPolicy: async (profile: S3Profile, accessKey: string, policyName: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/setUserPolicy', {
          profile,
          accessKey,
          policyName,
        });
        return r.success;
      },
      listPolicies: async (profile: S3Profile): Promise<MinioPolicy[]> => {
        return await apiFetch<MinioPolicy[]>('/api/admin/listPolicies', { profile });
      },
      getPolicy: async (profile: S3Profile, name: string): Promise<string> => {
        const r = await apiFetch<{ policy: string }>('/api/admin/getPolicy', { profile, name });
        return r.policy;
      },
      addPolicy: async (profile: S3Profile, name: string, policyJson: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/addPolicy', { profile, name, policyJson });
        return r.success;
      },
      deletePolicy: async (profile: S3Profile, name: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/deletePolicy', { profile, name });
        return r.success;
      },
      listGroups: async (profile: S3Profile): Promise<MinioGroup[]> => {
        return await apiFetch<MinioGroup[]>('/api/admin/listGroups', { profile });
      },
      getGroupInfo: async (profile: S3Profile, groupName: string): Promise<MinioGroup> => {
        return await apiFetch<MinioGroup>('/api/admin/getGroupInfo', { profile, groupName });
      },
      createOrUpdateGroup: async (profile: S3Profile, groupName: string, members: string[], policyName?: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/createOrUpdateGroup', {
          profile,
          groupName,
          members,
          policyName,
        });
        return r.success;
      },
      setGroupStatus: async (profile: S3Profile, groupName: string, status: 'enabled' | 'disabled') => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/setGroupStatus', {
          profile,
          groupName,
          status,
        });
        return r.success;
      },
      setGroupPolicy: async (profile: S3Profile, groupName: string, policyName: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/setGroupPolicy', {
          profile,
          groupName,
          policyName,
        });
        return r.success;
      },
      deleteGroup: async (profile: S3Profile, groupName: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/deleteGroup', { profile, groupName });
        return r.success;
      },
      getBucketStat: async (profile: S3Profile, bucketName: string): Promise<MinioBucketStat> => {
        return await apiFetch<MinioBucketStat>('/api/admin/getBucketStat', { profile, bucketName });
      },
      getAllBucketsStats: async (profile: S3Profile, bucketNames: string[]): Promise<Record<string, MinioBucketStat>> => {
        return await apiFetch<Record<string, MinioBucketStat>>('/api/admin/getAllBucketsStats', {
          profile,
          bucketNames,
        });
      },
      getCompressionConfig: async (profile: S3Profile): Promise<MinioCompressionConfig> => {
        return await apiFetch<MinioCompressionConfig>('/api/admin/getCompressionConfig', { profile });
      },
      setCompressionConfig: async (profile: S3Profile, config: MinioCompressionConfig) => {
        return await apiFetch<{ success: boolean; message?: string }>('/api/admin/setCompressionConfig', {
          profile,
          config,
        });
      },
      resetCompressionConfig: async (profile: S3Profile) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/resetCompressionConfig', { profile });
        return r.success;
      },
      exportConfig: async (profile: S3Profile): Promise<string> => {
        const r = await apiFetch<{ config: string }>('/api/admin/exportConfig', { profile });
        return r.config;
      },
      importConfig: async (profile: S3Profile, content: string) => {
        const r = await apiFetch<{ success: boolean }>('/api/admin/importConfig', { profile, content });
        return r.success;
      },
    },

    // 4. File Watcher (Not applicable in browser)
    watcher: {
      onFileChanged: () => () => {},
      saveBackToS3: async () => false,
      stopWatching: async () => {},
    },

    // 5. Transfer Progress
    transfers: {
      onProgress: (callback: (payload: TransferProgressPayload) => void) => {
        transferProgressListeners.add(callback);
        return () => {
          transferProgressListeners.delete(callback);
        };
      },
    },

    // 6. Native Dialog Simulation via HTML5 File Pickers
    dialog: {
      showSaveDialog: async (options?: { defaultPath?: string }) => {
        return options?.defaultPath || 'download';
      },
      showOpenDialog: async (options: {
        properties: ('openFile' | 'openDirectory' | 'multiSelections')[];
      }): Promise<string[] | undefined> => {
        return new Promise<string[] | undefined>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.style.display = 'none';

          if (options.properties.includes('multiSelections')) {
            input.multiple = true;
          }
          if (options.properties.includes('openDirectory')) {
            (input as any).webkitdirectory = true;
            (input as any).directory = true;
          }

          input.onchange = () => {
            if (!input.files || input.files.length === 0) {
              document.body.removeChild(input);
              return resolve(undefined);
            }

            const paths: string[] = [];
            for (let i = 0; i < input.files.length; i++) {
              const file = input.files[i];
              const virtualPath = (file as any).webkitRelativePath || file.name;
              browserFileStore.set(virtualPath, file);
              paths.push(virtualPath);
            }
            document.body.removeChild(input);
            resolve(paths);
          };

          // Handle user cancellation
          window.addEventListener(
            'focus',
            () => {
              setTimeout(() => {
                if (!input.files || input.files.length === 0) {
                  try {
                    document.body.removeChild(input);
                  } catch {}
                  resolve(undefined);
                }
              }, 500);
            },
            { once: true }
          );

          document.body.appendChild(input);
          input.click();
        });
      },
    },

    // 7. License & Pro API
    license: {
      getStatus: async (): Promise<LicenseStatus> => {
        return await apiFetch<LicenseStatus>('/api/license/status', undefined, 'GET');
      },
      activateKey: async (key: string) => {
        return await apiFetch<{ success: boolean; message: string }>('/api/license/activateKey', { key });
      },
      setSimulatedExpired: async (expired: boolean) => {
        return await apiFetch<LicenseStatus>('/api/license/setSimulatedExpired', { expired });
      },
    },

    // 8. Embedded Web Server Info
    webServer: {
      getStatus: async (): Promise<WebServerStatus> => {
        return await apiFetch<WebServerStatus>('/api/server/status', undefined, 'GET');
      },
      start: async () => ({ success: true, port: window.location.port ? parseInt(window.location.port, 10) : 80 }),
      stop: async () => ({ success: true }),
      openInBrowser: async () => {},
    },

    // Web Authentication & Whitelist API
    webAuth: {
      verifyPin: async (pin: string) => {
        const res = await apiFetch<{ success: boolean; token: string; allowedUrls: string[] }>(
          '/api/auth/verifyPin',
          { pin }
        );
        if (res.token) {
          setStoredWebToken(res.token);
        }
        return res;
      },
      getConfig: async () => {
        return await apiFetch<{ pinRequired: boolean; allowedUrls: string[] }>(
          '/api/web/config',
          undefined,
          'GET'
        );
      },
      getStoredToken: getStoredWebToken,
      logout: async () => {
        try {
          await apiFetch('/api/auth/logout', {});
        } catch {}
        clearStoredWebToken();
        window.dispatchEvent(new CustomEvent('s3:webAuthRequired'));
      },
    },

    // Runtime Environment Flag
    isElectron: false,

    // 9. DOM File helper for drag-and-drop
    getPathForFile: (file: File): string => {
      const virtualPath = (file as any).webkitRelativePath || file.name;
      browserFileStore.set(virtualPath, file);
      return virtualPath;
    },

    getBrowserFile: (virtualPath: string): File | undefined => {
      return browserFileStore.get(virtualPath);
    },

    scanDroppedItems: async (items: DataTransferItemList): Promise<string[]> => {
      const scannedFiles: { virtualPath: string; file: File }[] = [];

      async function traverseEntry(entry: any, currentPath: string = ''): Promise<void> {
        if (entry.isFile) {
          const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
          const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
          scannedFiles.push({ virtualPath: relPath, file });
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          const readEntries = async (): Promise<any[]> => {
            return new Promise((resolve, reject) => {
              dirReader.readEntries(resolve, reject);
            });
          };

          const dirPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          let batch = await readEntries();
          while (batch.length > 0) {
            for (const child of batch) {
              await traverseEntry(child, dirPath);
            }
            batch = await readEntries();
          }
        }
      }

      const promises: Promise<void>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            promises.push(traverseEntry(entry));
          } else {
            const file = item.getAsFile();
            if (file) {
              scannedFiles.push({ virtualPath: file.name, file });
            }
          }
        }
      }

      await Promise.all(promises);

      const paths: string[] = [];
      for (const sf of scannedFiles) {
        browserFileStore.set(sf.virtualPath, sf.file);
        paths.push(sf.virtualPath);
      }

      return paths;
    },
  };

  (window as any).electronAPI = browserAPI;
  console.log('[S3 Studio] Browser compatibility adapter initialized successfully.');
}

// Auto-run if running directly in a web browser
if (typeof window !== 'undefined' && !(window as any).electronAPI) {
  initBrowserElectronAPI();
}
