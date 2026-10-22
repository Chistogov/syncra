export interface S3Profile {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
  forcePathStyle: boolean;
  createdAt: number;
  permissionRole?: 'auto' | 'admin' | 'readwrite' | 'readonly';
}

export interface UserPermissions {
  canAdminMinio: boolean;       // Управление сервером MinIO (метрики, диски, конфигурация)
  canManageUsers: boolean;      // Управление пользователями
  canManageRoles: boolean;      // Управление группами и ролями
  canManagePolicies: boolean;   // Управление политиками IAM
  canCreateBucket: boolean;     // Создание новых бакетов
  canDeleteBucket: boolean;     // Удаление бакетов
  canUpload: boolean;           // Загрузка файлов и папок
  canCreateFolder: boolean;     // Создание папок в бакете
  canDeleteItems: boolean;      // Удаление объектов в бакете
  canEditTags: boolean;         // Добавление и удаление S3 тегов
  roleName?: string;            // Имя распознанной роли/политики
}

export interface S3Bucket {
  name: string;
  creationDate?: string;
}

export interface S3Item {
  key: string;
  name: string;
  isPrefix: boolean; // true for folders
  size?: number;
  lastModified?: string;
  eTag?: string;
  storageClass?: string;
  extension?: string;
}

export interface S3Tag {
  key: string;
  value: string;
}

export interface ListObjectsResult {
  items: S3Item[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
  currentPrefix: string;
}

export interface TransferProgress {
  id: string;
  type: 'upload' | 'download';
  bucket: string;
  key: string;
  localPath: string;
  totalBytes: number;
  transferredBytes: number;
  progress: number; // 0 - 100
  speed: string; // e.g. "50.16 KB/s"
  speedBytesPerSec?: number;
  status: 'queued' | 'in_progress' | 'completed' | 'error' | 'cancelled' | 'pending';
  error?: string;
}

export interface TransferProgressPayload {
  id: string;
  transferredBytes: number;
  totalBytes: number;
  progress: number;
  speedBytesPerSec: number;
}

export interface S3ObjectSummary {
  key: string;
  size: number;
}

export interface DiscoveryBatchPayload {
  discoveryId: string;
  bucket: string;
  prefix: string;
  objects: S3ObjectSummary[];
  isTruncated: boolean;
}

export interface DownloadResult {
  targetPath: string;
  durationMs: number;
  averageSpeedBytesPerSec: number;
}

export interface WatcherEvent {
  bucket: string;
  key: string;
  localPath: string;
  modifiedAt: number;
}

export interface TestConnectionResult {
  success: boolean;
  message?: string;
  bucketsCount?: number;
}

export interface FilePreviewData {
  type: 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'binary';
  url?: string;
  text?: string;
  mimeType?: string;
  size?: number;
  name: string;
}

export interface ScannedFile {
  localPath: string;
  relativePath: string;
  size: number;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  language?: 'ru' | 'en';
  transferConcurrency: number;
  multipartChunkSizeMB: number;
  thumbnailConcurrency: number;
  autoSaveOnEditInPlace: boolean;
  webServerAutoStart?: boolean;
  webServerPort?: number;
}

export interface MinioDriveInfo {
  uuid?: string;
  endpoint?: string;
  drivePath: string;
  state: 'ok' | 'offline' | 'healing' | string;
  totalSpace: number;
  freeSpace: number;
  usedSpace: number;
  percentUsed: number;
  rootDisk?: boolean;
}

export interface MinioServerInfo {
  endpoint: string;
  state: string;
  uptime: number; // in seconds
  version: string;
  commitID?: string;
  drives: MinioDriveInfo[];
}

export interface MinioClusterInfo {
  isMinio: boolean;
  mode?: string;
  region?: string;
  version?: string;
  uptime?: number;
  totalSpace: number;
  freeSpace: number;
  usedSpace: number;
  percentUsed: number;
  bucketsCount: number;
  objectsCount: number;
  servers: MinioServerInfo[];
  drives: MinioDriveInfo[];
  backendType?: string;
  onlineDisks?: number;
  totalDisks?: number;
  offlineDisks?: number;
  error?: string;
  standardSCParity?: number | string;
  rrSCParity?: number | string;
  reportedUsage?: number;
  memStats?: {
    Alloc: number;
    TotalAlloc: number;
    HeapAlloc: number;
    Frees: number;
  };
  numCpu?: number;
}

export interface MinioBucketStat {
  name: string;
  size: number;
  objectsCount: number;
  created?: string;
  access?: string;
  versioning?: 'Enabled' | 'Suspended' | 'None';
  objectLock?: boolean;
}

export interface MinioUser {
  accessKey: string;
  status: 'enabled' | 'disabled';
  policyName?: string;
  memberOf?: string[];
}

export interface MinioGroup {
  name: string;
  status: 'enabled' | 'disabled';
  members: string[];
  policy?: string;
}

export interface MinioPolicy {
  name: string;
  policy: string; // JSON string
}

export interface MinioCompressionConfig {
  enable?: boolean;
  allow_encryption?: boolean;
  extensions: string[];
  mime_types: string[];
}

export interface LicenseStatus {
  isPro: boolean;
  isTrial: boolean;
  trialDaysLeft: number;
  isExpired: boolean;
  firstLaunchDate: string;
  trialEndDate: string;
  licenseType: 'trial' | 'pro' | 'community';
  machineId: string;
  licenseKey?: string;
}

export interface ConnectedDevice {
  id: string;
  ip: string;
  userAgent: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  firstSeen: string;
  lastSeen: string;
  isOnline: boolean;
}

export interface WebServerConfig {
  autoStart: boolean;
  port: number;
  pinProtected: boolean;
  pin: string;
  allowedUrls: string[];
}

export interface WebServerStatus {
  running: boolean;
  port: number;
  localUrl: string;
  networkUrls: string[];
  activeConnections?: number;
  pinProtected?: boolean;
  pin?: string;
  allowedUrls?: string[];
  devices?: ConnectedDevice[];
}
