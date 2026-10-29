import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  S3Profile,
  S3Item,
  WatcherEvent,
  TestConnectionResult,
  ListObjectsResult,
  S3Bucket,
  FilePreviewData,
  ScannedFile,
  TransferProgressPayload,
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
  WebServerStatus,
  ConnectedDevice,
  WebServerConfig,
  S3Tag,
  UserPermissions,
} from '../common/types';

export const electronAPI = {
  // Profile management
  profiles: {
    list: (): Promise<S3Profile[]> => ipcRenderer.invoke('profiles:list'),
    save: (profile: S3Profile): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('profiles:save', profile),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('profiles:delete', id),
    getActiveId: (): Promise<string> => ipcRenderer.invoke('profiles:getActiveId'),
    setActiveId: (id: string): Promise<void> => ipcRenderer.invoke('profiles:setActiveId', id),
    test: (profile: S3Profile): Promise<TestConnectionResult> =>
      ipcRenderer.invoke('profiles:test', profile),
  },

  // Auth & Permissions
  auth: {
    checkPermissions: (profile: S3Profile, bucket?: string): Promise<UserPermissions> =>
      ipcRenderer.invoke('auth:checkPermissions', profile, bucket),
  },

  // S3 Operations
  s3: {
    listBuckets: (profile: S3Profile): Promise<S3Bucket[]> =>
      ipcRenderer.invoke('s3:listBuckets', profile),
    createBucket: (profile: S3Profile, bucketName: string): Promise<boolean> =>
      ipcRenderer.invoke('s3:createBucket', profile, bucketName),
    deleteBucket: (profile: S3Profile, bucketName: string): Promise<boolean> =>
      ipcRenderer.invoke('s3:deleteBucket', profile, bucketName),
    renameBucket: (
      profile: S3Profile,
      oldBucketName: string,
      newBucketName: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('s3:renameBucket', profile, oldBucketName, newBucketName),
    listObjects: (
      profile: S3Profile,
      bucket: string,
      prefix?: string,
      continuationToken?: string
    ): Promise<ListObjectsResult> =>
      ipcRenderer.invoke('s3:listObjects', profile, bucket, prefix, continuationToken),
    headObject: (profile: S3Profile, bucket: string, key: string): Promise<S3Item | null> =>
      ipcRenderer.invoke('s3:headObject', profile, bucket, key),
    createFolder: (profile: S3Profile, bucket: string, folderKey: string): Promise<boolean> =>
      ipcRenderer.invoke('s3:createFolder', profile, bucket, folderKey),
    deleteObjects: (profile: S3Profile, bucket: string, keys: string[]): Promise<boolean> =>
      ipcRenderer.invoke('s3:deleteObjects', profile, bucket, keys),
    getPresignedUrl: (
      profile: S3Profile,
      bucket: string,
      key: string,
      expiresIn?: number
    ): Promise<string> =>
      ipcRenderer.invoke('s3:getPresignedUrl', profile, bucket, key, expiresIn),
    getPreview: (profile: S3Profile, bucket: string, key: string): Promise<FilePreviewData> =>
      ipcRenderer.invoke('s3:getPreview', profile, bucket, key),
    getThumbnail: (profile: S3Profile, bucket: string, key: string): Promise<string | null> =>
      ipcRenderer.invoke('s3:getThumbnail', profile, bucket, key),
    downloadFile: (
      transferId: string,
      profile: S3Profile,
      bucket: string,
      key: string,
      targetPath: string
    ): Promise<DownloadResult> =>
      ipcRenderer.invoke('s3:downloadFile', transferId, profile, bucket, key, targetPath),
    uploadFile: (
      transferId: string,
      profile: S3Profile,
      bucket: string,
      key: string,
      localFilePath: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('s3:uploadFile', transferId, profile, bucket, key, localFilePath),
    listAllObjectsInFolder: (
      profile: S3Profile,
      bucket: string,
      prefix: string
    ): Promise<S3ObjectSummary[]> =>
      ipcRenderer.invoke('s3:listAllObjectsInFolder', profile, bucket, prefix),
    streamFolderDiscovery: (
      discoveryId: string,
      profile: S3Profile,
      bucket: string,
      prefix: string
    ): Promise<number> =>
      ipcRenderer.invoke('s3:streamFolderDiscovery', discoveryId, profile, bucket, prefix),
    onDiscoveryBatch: (callback: (payload: DiscoveryBatchPayload) => void) => {
      const subscription = (_event: any, value: DiscoveryBatchPayload) => callback(value);
      ipcRenderer.on('s3:discoveryBatch', subscription);
      return () => {
        ipcRenderer.removeListener('s3:discoveryBatch', subscription);
      };
    },
    saveTextContent: (
      profile: S3Profile,
      bucket: string,
      key: string,
      content: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('s3:saveTextContent', profile, bucket, key, content),
    scanLocalPath: (localPath: string): Promise<ScannedFile[]> =>
      ipcRenderer.invoke('s3:scanLocalPath', localPath),
    scanLocalPaths: (localPaths: string[]): Promise<ScannedFile[]> =>
      ipcRenderer.invoke('s3:scanLocalPaths', localPaths),
    downloadDirectory: (
      profile: S3Profile,
      bucket: string,
      prefix: string,
      targetLocalDir: string
    ): Promise<number> =>
      ipcRenderer.invoke('s3:downloadDirectory', profile, bucket, prefix, targetLocalDir),
    moveObjects: (
      profile: S3Profile,
      bucket: string,
      items: { key: string; isPrefix: boolean }[],
      targetPrefix: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('s3:moveObjects', profile, bucket, items, targetPrefix),
    renameObject: (
      profile: S3Profile,
      bucket: string,
      oldKey: string,
      newName: string,
      isPrefix: boolean
    ): Promise<boolean> =>
      ipcRenderer.invoke('s3:renameObject', profile, bucket, oldKey, newName, isPrefix),
    openExternal: (
      profile: S3Profile,
      bucket: string,
      key: string,
      enableEditInPlace: boolean
    ): Promise<{ success: boolean; localPath: string; error?: string }> =>
      ipcRenderer.invoke('s3:openExternal', profile, bucket, key, enableEditInPlace),
    getBucketPolicy: (profile: S3Profile, bucket: string): Promise<string | null> =>
      ipcRenderer.invoke('s3:getBucketPolicy', profile, bucket),
    setBucketPolicy: (profile: S3Profile, bucket: string, policyJson: string): Promise<boolean> =>
      ipcRenderer.invoke('s3:setBucketPolicy', profile, bucket, policyJson),
    deleteBucketPolicy: (profile: S3Profile, bucket: string): Promise<boolean> =>
      ipcRenderer.invoke('s3:deleteBucketPolicy', profile, bucket),
    getBucketVersioning: (profile: S3Profile, bucket: string): Promise<'Enabled' | 'Suspended' | 'None'> =>
      ipcRenderer.invoke('s3:getBucketVersioning', profile, bucket),
    setBucketVersioning: (profile: S3Profile, bucket: string, enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('s3:setBucketVersioning', profile, bucket, enabled),
    getObjectTags: (profile: S3Profile, bucket: string, key: string): Promise<S3Tag[]> =>
      ipcRenderer.invoke('s3:getObjectTags', profile, bucket, key),
    getBatchObjectTags: (
      profile: S3Profile,
      bucket: string,
      keys: string[]
    ): Promise<Record<string, S3Tag[]>> =>
      ipcRenderer.invoke('s3:getBatchObjectTags', profile, bucket, keys),
    putObjectTags: (profile: S3Profile, bucket: string, key: string, tags: S3Tag[]): Promise<boolean> =>
      ipcRenderer.invoke('s3:putObjectTags', profile, bucket, key, tags),
    deleteObjectTags: (profile: S3Profile, bucket: string, key: string): Promise<boolean> =>
      ipcRenderer.invoke('s3:deleteObjectTags', profile, bucket, key),
  },

  // MinIO Cluster Admin Operations
  admin: {
    getClusterInfo: (profile: S3Profile): Promise<MinioClusterInfo> =>
      ipcRenderer.invoke('admin:getClusterInfo', profile),
    listUsers: (profile: S3Profile): Promise<MinioUser[]> =>
      ipcRenderer.invoke('admin:listUsers', profile),
    createUser: (
      profile: S3Profile,
      accessKey: string,
      secretKey: string,
      policyName?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('admin:createUser', profile, accessKey, secretKey, policyName),
    setUserStatus: (
      profile: S3Profile,
      accessKey: string,
      status: 'enabled' | 'disabled'
    ): Promise<boolean> =>
      ipcRenderer.invoke('admin:setUserStatus', profile, accessKey, status),
    deleteUser: (profile: S3Profile, accessKey: string): Promise<boolean> =>
      ipcRenderer.invoke('admin:deleteUser', profile, accessKey),
    setUserPolicy: (
      profile: S3Profile,
      accessKey: string,
      policyName: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('admin:setUserPolicy', profile, accessKey, policyName),
    listPolicies: (profile: S3Profile): Promise<MinioPolicy[]> =>
      ipcRenderer.invoke('admin:listPolicies', profile),
    getPolicy: (profile: S3Profile, name: string): Promise<string> =>
      ipcRenderer.invoke('admin:getPolicy', profile, name),
    addPolicy: (profile: S3Profile, name: string, policyJson: string): Promise<boolean> =>
      ipcRenderer.invoke('admin:addPolicy', profile, name, policyJson),
    deletePolicy: (profile: S3Profile, name: string): Promise<boolean> =>
      ipcRenderer.invoke('admin:deletePolicy', profile, name),
    listGroups: (profile: S3Profile): Promise<MinioGroup[]> =>
      ipcRenderer.invoke('admin:listGroups', profile),
    getGroupInfo: (profile: S3Profile, groupName: string): Promise<MinioGroup> =>
      ipcRenderer.invoke('admin:getGroupInfo', profile, groupName),
    createOrUpdateGroup: (
      profile: S3Profile,
      groupName: string,
      members: string[],
      policyName?: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('admin:createOrUpdateGroup', profile, groupName, members, policyName),
    setGroupStatus: (
      profile: S3Profile,
      groupName: string,
      status: 'enabled' | 'disabled'
    ): Promise<boolean> =>
      ipcRenderer.invoke('admin:setGroupStatus', profile, groupName, status),
    setGroupPolicy: (
      profile: S3Profile,
      groupName: string,
      policyName: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('admin:setGroupPolicy', profile, groupName, policyName),
    deleteGroup: (profile: S3Profile, groupName: string): Promise<boolean> =>
      ipcRenderer.invoke('admin:deleteGroup', profile, groupName),
    getBucketStat: (profile: S3Profile, bucketName: string): Promise<MinioBucketStat> =>
      ipcRenderer.invoke('admin:getBucketStat', profile, bucketName),
    getAllBucketsStats: (
      profile: S3Profile,
      bucketNames: string[]
    ): Promise<Record<string, MinioBucketStat>> =>
      ipcRenderer.invoke('admin:getAllBucketsStats', profile, bucketNames),
    getCompressionConfig: (profile: S3Profile): Promise<MinioCompressionConfig> =>
      ipcRenderer.invoke('admin:getCompressionConfig', profile),
    setCompressionConfig: (
      profile: S3Profile,
      config: MinioCompressionConfig
    ): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke('admin:setCompressionConfig', profile, config),
    resetCompressionConfig: (profile: S3Profile): Promise<boolean> =>
      ipcRenderer.invoke('admin:resetCompressionConfig', profile),
    exportConfig: (profile: S3Profile): Promise<string> =>
      ipcRenderer.invoke('admin:exportConfig', profile),
    importConfig: (profile: S3Profile, content: string): Promise<boolean> =>
      ipcRenderer.invoke('admin:importConfig', profile, content),
  },

  // Edit-in-Place File Watcher
  watcher: {
    onFileChanged: (callback: (data: WatcherEvent) => void) => {
      const subscription = (_event: any, value: WatcherEvent) => callback(value);
      ipcRenderer.on('watcher:file-changed', subscription);
      return () => {
        ipcRenderer.removeListener('watcher:file-changed', subscription);
      };
    },
    saveBackToS3: (bucket: string, key: string): Promise<boolean> =>
      ipcRenderer.invoke('watcher:saveBack', bucket, key),
    stopWatching: (bucket: string, key: string): Promise<void> =>
      ipcRenderer.invoke('watcher:stopWatching', bucket, key),
  },

  // Transfers Progress Listener
  transfers: {
    onProgress: (callback: (payload: TransferProgressPayload) => void) => {
      const subscription = (_event: any, value: TransferProgressPayload) => callback(value);
      ipcRenderer.on('transfer:progress', subscription);
      return () => {
        ipcRenderer.removeListener('transfer:progress', subscription);
      };
    },
  },

  // Native Dialogs
  dialog: {
    showSaveDialog: (options: { defaultPath?: string }): Promise<string | undefined> =>
      ipcRenderer.invoke('dialog:save', options),
    showOpenDialog: (options: { properties: ('openFile' | 'openDirectory' | 'multiSelections')[] }): Promise<string[] | undefined> =>
      ipcRenderer.invoke('dialog:open', options),
  },

  // License & Pro Trial API
  license: {
    getStatus: (): Promise<LicenseStatus> => ipcRenderer.invoke('license:getStatus'),
    activateKey: (key: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke('license:activateKey', key),
  },

  // Embedded Web Server API
  webServer: {
    getStatus: (): Promise<WebServerStatus> => ipcRenderer.invoke('webserver:getStatus'),
    start: (port?: number): Promise<{ success: boolean; port: number; error?: string }> =>
      ipcRenderer.invoke('webserver:start', port),
    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke('webserver:stop'),
    openInBrowser: (url?: string): Promise<void> => ipcRenderer.invoke('webserver:openInBrowser', url),
    getAutoStart: (): Promise<{ autoStart: boolean; port: number }> =>
      ipcRenderer.invoke('webserver:getAutoStart'),
    setAutoStart: (autoStart: boolean, port?: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('webserver:setAutoStart', autoStart, port),
    getConfig: (): Promise<WebServerConfig> => ipcRenderer.invoke('webserver:getConfig'),
    saveConfig: (config: Partial<WebServerConfig>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('webserver:saveConfig', config),
    getDevices: (): Promise<ConnectedDevice[]> => ipcRenderer.invoke('webserver:getDevices'),
    forgetDevice: (deviceId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('webserver:forgetDevice', deviceId),
    clearDevices: (): Promise<{ success: boolean }> => ipcRenderer.invoke('webserver:clearDevices'),
  },

  // Runtime Environment Flag
  isElectron: true,

  // Native OS Clipboard file copying for pasting into Windows Explorer / macOS Finder / Linux
  copyToClipboard: (payload: {
    profile: S3Profile;
    bucket: string;
    items: any[];
  }): Promise<{ success: boolean; count: number; error?: string }> =>
    ipcRenderer.invoke('s3:copyToClipboard', payload),

  // Navigation events for mouse back/forward and hardware buttons
  navigation: {
    onNavigateBack: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('nav:navigateBack', handler);
      return () => ipcRenderer.removeListener('nav:navigateBack', handler);
    },
    onNavigateForward: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('nav:navigateForward', handler);
      return () => ipcRenderer.removeListener('nav:navigateForward', handler);
    },
  },

  // Helper to extract native filesystem path from DOM File object (Electron 28+)
  getPathForFile: (file: File): string => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const p = webUtils.getPathForFile(file);
        if (p) return p;
      }
    } catch (err) {
      console.warn('getPathForFile failed:', err);
    }
    return (file as any)?.path || '';
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
export type ElectronAPI = typeof electronAPI;
