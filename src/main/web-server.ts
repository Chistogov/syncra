import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import mime from 'mime-types';
import { shell, app } from 'electron';
import { GetObjectCommand, ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Service } from './s3-service';
import { MinioAdminService } from './minio-admin';
import { LicenseService } from './license-service';
import { WebServerStatus, S3Profile, ConnectedDevice, WebServerConfig } from '../common/types';

// Lightweight User-Agent parser for identifying connected client devices
function parseUserAgent(ua: string): { deviceName: string; deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown' } {
  if (!ua) return { deviceName: 'Неизвестное устройство', deviceType: 'unknown' };

  const isTablet = /iPad|Tablet|PlayBook/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isMobile = !isTablet && /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated/i.test(ua);

  let os = 'Неизвестная ОС';
  if (/iPhone/i.test(ua)) os = 'Apple iPhone';
  else if (/iPad/i.test(ua)) os = 'Apple iPad';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Браузер';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
  return {
    deviceName: `${os} (${browser})`,
    deviceType,
  };
}

// Dynamic ESM loader for archiver to avoid ERR_REQUIRE_ESM in CommonJS
let cachedZipArchiveClass: any = null;
async function getZipArchiveClass(): Promise<any> {
  if (cachedZipArchiveClass) return cachedZipArchiveClass;
  const dynamicImport = new Function('specifier', 'return import(specifier)');
  const mod = await dynamicImport('archiver');
  cachedZipArchiveClass = mod.ZipArchive || mod.default?.ZipArchive || mod.default;
  return cachedZipArchiveClass;
}

export class WebServerService {
  private server: http.Server | null = null;
  private currentPort: number = 8080;
  private isRunning: boolean = false;
  private distDir: string = '';
  private configFile: string = '';
  private devicesFile: string = '';
  private s3Service: S3Service;
  private minioAdmin: MinioAdminService;
  private licenseService: LicenseService;

  private config: WebServerConfig = {
    autoStart: false,
    port: 8080,
    pinProtected: true,
    pin: '123456',
    allowedUrls: [],
  };

  private devices: Map<string, ConnectedDevice> = new Map();
  private activeTokens: Map<string, { deviceId: string; createdAt: number; lastUsedAt: number }> = new Map();
  private saveDevicesTimeout: NodeJS.Timeout | null = null;

  constructor(
    s3Service: S3Service,
    minioAdmin: MinioAdminService,
    licenseService: LicenseService
  ) {
    this.s3Service = s3Service;
    this.minioAdmin = minioAdmin;
    this.licenseService = licenseService;
    this.distDir = this.findDistDir();
    this.configFile = this.findConfigFile();
    this.devicesFile = this.findDevicesFile();

    this.loadConfig();
    this.loadDevices();
  }

  private getAppDataDir(): string {
    let userData = '';
    try {
      userData = app?.getPath ? app.getPath('userData') : '';
    } catch {}
    if (!userData) {
      userData = path.join(
        process.env.APPDATA || path.join(process.cwd(), '.appdata'),
        'syncra'
      );
    }
    if (!fs.existsSync(userData)) {
      try {
        fs.mkdirSync(userData, { recursive: true });
      } catch {}
    }
    return userData;
  }

  private findConfigFile(): string {
    return path.join(this.getAppDataDir(), 's3_webserver_config.json');
  }

  private findDevicesFile(): string {
    return path.join(this.getAppDataDir(), 's3_webserver_devices.json');
  }

  private loadConfig(): void {
    try {
      if (this.configFile && fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        const data = JSON.parse(raw);
        this.config = {
          autoStart: Boolean(data.autoStart),
          port: Number(data.port) || 8080,
          pinProtected: data.pinProtected !== undefined ? Boolean(data.pinProtected) : true,
          pin: typeof data.pin === 'string' && data.pin.length === 6 ? data.pin : '123456',
          allowedUrls: Array.isArray(data.allowedUrls) ? data.allowedUrls : [],
        };
        this.currentPort = this.config.port;
      }
    } catch (err) {
      console.error('[WebServer] Failed to read webserver config:', err);
    }
  }

  public getConfig(): WebServerConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: Partial<WebServerConfig>): { success: boolean; error?: string } {
    try {
      this.config = {
        ...this.config,
        ...newConfig,
      };
      if (newConfig.port) {
        this.currentPort = Number(newConfig.port);
      }
      if (!this.configFile) {
        this.configFile = this.findConfigFile();
      }
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
      return { success: true };
    } catch (err: any) {
      console.error('[WebServer] Failed to save webserver config:', err);
      return { success: false, error: err.message };
    }
  }

  public getAutoStartConfig(): { autoStart: boolean; port: number } {
    return {
      autoStart: this.config.autoStart,
      port: this.config.port || this.currentPort || 8080,
    };
  }

  public saveAutoStartConfig(autoStart: boolean, port?: number): { success: boolean; error?: string } {
    return this.saveConfig({ autoStart, port: port || this.config.port });
  }

  private loadDevices(): void {
    try {
      if (this.devicesFile && fs.existsSync(this.devicesFile)) {
        const raw = fs.readFileSync(this.devicesFile, 'utf-8');
        const list: ConnectedDevice[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          this.devices.clear();
          for (const d of list) {
            if (d && d.id) {
              this.devices.set(d.id, d);
            }
          }
        }
      }
    } catch (err) {
      console.error('[WebServer] Failed to load devices list:', err);
    }
  }

  private saveDevices(): void {
    try {
      if (!this.devicesFile) {
        this.devicesFile = this.findDevicesFile();
      }
      const list = Array.from(this.devices.values());
      fs.writeFileSync(this.devicesFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('[WebServer] Failed to save devices list:', err);
    }
  }

  private debouncedSaveDevices(): void {
    if (this.saveDevicesTimeout) return;
    this.saveDevicesTimeout = setTimeout(() => {
      this.saveDevicesTimeout = null;
      this.saveDevices();
    }, 2000);
  }

  private extractIp(req: http.IncomingMessage): string {
    const raw =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return raw.replace(/^::ffff:/, '');
  }

  public trackDevice(req: http.IncomingMessage, clientDeviceId?: string): ConnectedDevice {
    const ip = this.extractIp(req);
    const ua = (req.headers['user-agent'] as string) || 'Unknown Browser';
    const deviceId =
      clientDeviceId ||
      (req.headers['x-device-id'] as string) ||
      crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex').substring(0, 16);

    const now = new Date().toISOString();
    let dev = this.devices.get(deviceId);
    if (!dev) {
      const { deviceName, deviceType } = parseUserAgent(ua);
      dev = {
        id: deviceId,
        ip,
        userAgent: ua,
        deviceName,
        deviceType,
        firstSeen: now,
        lastSeen: now,
        isOnline: true,
      };
      this.devices.set(deviceId, dev);
      this.saveDevices();
    } else {
      dev.ip = ip;
      dev.lastSeen = now;
      dev.isOnline = true;
      this.debouncedSaveDevices();
    }
    return dev;
  }

  public getDevices(): ConnectedDevice[] {
    const now = Date.now();
    return Array.from(this.devices.values()).map((d) => ({
      ...d,
      isOnline: now - new Date(d.lastSeen).getTime() < 3 * 60 * 1000,
    })).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }

  public forgetDevice(deviceId: string): { success: boolean } {
    this.devices.delete(deviceId);
    for (const [token, session] of this.activeTokens.entries()) {
      if (session.deviceId === deviceId) {
        this.activeTokens.delete(token);
      }
    }
    this.saveDevices();
    return { success: true };
  }

  public clearDevices(): { success: boolean } {
    this.devices.clear();
    this.activeTokens.clear();
    this.saveDevices();
    return { success: true };
  }

  public isEndpointAllowed(endpointUrl?: string): boolean {
    if (!this.config.allowedUrls || this.config.allowedUrls.length === 0) {
      return false;
    }
    if (!endpointUrl) return false;
    const clean = (url: string) => url.trim().toLowerCase().replace(/\/+$/, '');
    const target = clean(endpointUrl);
    return this.config.allowedUrls.some((allowed) => clean(allowed) === target);
  }

  private findDistDir(): string {
    const candidates = [
      path.join(__dirname, '..', '..', 'dist'),
      path.join(__dirname, '..', 'dist'),
      path.join(process.cwd(), 'dist'),
    ];

    try {
      if (app && typeof app.getAppPath === 'function') {
        candidates.push(path.join(app.getAppPath(), 'dist'));
      }
    } catch {}

    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'index.html'))) {
        return c;
      }
    }
    return candidates[0];
  }

  public getStatus(): WebServerStatus {
    const networkUrls = this.getNetworkUrls(this.currentPort);
    return {
      running: this.isRunning,
      port: this.currentPort,
      localUrl: `http://localhost:${this.currentPort}`,
      networkUrls,
      activeConnections: this.activeTokens.size,
      pinProtected: this.config.pinProtected,
      pin: this.config.pin,
      allowedUrls: this.config.allowedUrls,
      devices: this.getDevices(),
    };
  }

  private getNetworkUrls(port: number): string[] {
    const urls: string[] = [`http://localhost:${port}`];
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] || []) {
          if (!net.internal && net.family === 'IPv4') {
            urls.push(`http://${net.address}:${port}`);
          }
        }
      }
    } catch {}
    return urls;
  }

  public async start(port: number = 8080): Promise<{ success: boolean; port: number; error?: string }> {
    if (this.isRunning && this.server) {
      if (this.currentPort === port) {
        return { success: true, port: this.currentPort };
      }
      await this.stop();
    }

    this.currentPort = port;
    this.distDir = this.findDistDir();

    return new Promise((resolve) => {
      try {
        const srv = http.createServer((req, res) => {
          this.handleRequest(req, res);
        });

        srv.on('error', (err: any) => {
          console.error('[WebServer] Server error:', err);
          this.isRunning = false;
          this.server = null;
          resolve({
            success: false,
            port,
            error: err.code === 'EADDRINUSE' ? `Порт ${port} уже занят другим приложением` : err.message,
          });
        });

        srv.listen(port, () => {
          this.isRunning = true;
          this.server = srv;
          console.log(`[WebServer] Syncra Web Server listening on port ${port} (IPv4/IPv6)`);
          console.log(`[WebServer] Serving static frontend from: ${this.distDir}`);
          try {
            const cfg = this.getAutoStartConfig();
            this.saveAutoStartConfig(cfg.autoStart, port);
          } catch {}
          resolve({ success: true, port });
        });
      } catch (err: any) {
        this.isRunning = false;
        resolve({ success: false, port, error: err.message });
      }
    });
  }

  public async stop(): Promise<{ success: boolean }> {
    if (!this.server) {
      this.isRunning = false;
      return { success: true };
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.server = null;
        console.log('[WebServer] Server stopped.');
        resolve({ success: true });
      });
    });
  }

  public openInBrowser(url?: string): void {
    const target = url || `http://localhost:${this.currentPort}`;
    try {
      if (shell && typeof shell.openExternal === 'function') {
        shell.openExternal(target);
      }
    } catch (err) {
      console.error('[WebServer] Failed to open browser:', err);
    }
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
    const json = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(json),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token, x-device-id, x-s3-endpoint, x-s3-access-key, x-s3-secret-key, x-s3-region, x-s3-ssl, x-s3-bucket, x-s3-key, x-s3-profile',
    });
    res.end(json);
  }

  private async parseJsonBody(req: http.IncomingMessage): Promise<any> {
    const body = await new Promise<any>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 50 * 1024 * 1024) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });

    if (body?.profile?.endpoint && !this.isEndpointAllowed(body.profile.endpoint)) {
      const err = new Error(
        `Подключение к S3 URL '${body.profile.endpoint}' запрещено политикой безопасности Web-сервера. Разрешенные адреса: ${this.config.allowedUrls.join(', ')}`
      );
      (err as any).statusCode = 403;
      throw err;
    }

    return body;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase();
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token, x-device-id, x-s3-endpoint, x-s3-access-key, x-s3-secret-key, x-s3-region, x-s3-ssl, x-s3-bucket, x-s3-key, x-s3-profile',
      });
      res.end();
      return;
    }

    try {
      // 0. Web Authentication & Whitelist Gate
      if (pathname.startsWith('/api/')) {
        // Public endpoints
        if (pathname === '/api/server/status' && method === 'GET') {
          return this.sendJson(res, 200, this.getStatus());
        }

        if (pathname === '/api/web/config' && method === 'GET') {
          return this.sendJson(res, 200, {
            pinRequired: this.config.pinProtected,
            allowedUrls: this.config.allowedUrls,
          });
        }

        if (pathname === '/api/auth/verifyPin' && method === 'POST') {
          const body = await this.parseJsonBody(req);
          const dev = this.trackDevice(req, body.clientDeviceId);
          const inputPin = String(body.pin || '').trim();

          if (!this.config.pinProtected || inputPin === this.config.pin) {
            const token = crypto.randomBytes(32).toString('hex');
            this.activeTokens.set(token, {
              deviceId: dev.id,
              createdAt: Date.now(),
              lastUsedAt: Date.now(),
            });
            return this.sendJson(res, 200, {
              success: true,
              token,
              allowedUrls: this.config.allowedUrls,
              message: 'Авторизация успешна',
            });
          } else {
            return this.sendJson(res, 401, {
              success: false,
              error: 'Неверный PIN-код доступа. Попробуйте снова.',
            });
          }
        }

        if (pathname === '/api/auth/logout' && method === 'POST') {
          const authHeader = req.headers['authorization'] || '';
          const token =
            (req.headers['x-auth-token'] as string) ||
            (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '');
          if (token) {
            this.activeTokens.delete(token);
          }
          return this.sendJson(res, 200, { success: true });
        }

        // Verify PIN Session Token if PIN protection is active
        if (this.config.pinProtected) {
          const authHeader = req.headers['authorization'] || '';
          let token = (req.headers['x-auth-token'] as string) || '';
          if (!token && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
          }
          if (!token && parsedUrl.searchParams.get('token')) {
            token = parsedUrl.searchParams.get('token')!;
          }

          if (!token || !this.activeTokens.has(token)) {
            this.trackDevice(req);
            return this.sendJson(res, 401, {
              error: 'Сессия не авторизована. Требуется ввод PIN-кода.',
              needPin: true,
            });
          }

          const session = this.activeTokens.get(token)!;
          session.lastUsedAt = Date.now();
        }

        // Track active device
        this.trackDevice(req);
      }

      // 2. API: License Status
      if (pathname === '/api/license/status' && method === 'GET') {
        const st = await this.licenseService.getLicenseStatus();
        return this.sendJson(res, 200, st);
      }
      if (pathname === '/api/license/activateKey' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        const r = await this.licenseService.activateLicenseKey(body.key || '');
        return this.sendJson(res, 200, r);
      }

      // 3. API: S3 Operations
      if (pathname === '/api/s3/listBuckets' && method === 'POST') {
        const { profile } = await this.parseJsonBody(req);
        const list = await this.s3Service.listBuckets(profile);
        return this.sendJson(res, 200, list);
      }

      if (pathname === '/api/s3/listObjects' && method === 'POST') {
        const { profile, bucket, prefix, continuationToken } = await this.parseJsonBody(req);
        const list = await this.s3Service.listObjects(profile, bucket, prefix, continuationToken);
        return this.sendJson(res, 200, list);
      }

      if (pathname === '/api/s3/createBucket' && method === 'POST') {
        const { profile, bucketName } = await this.parseJsonBody(req);
        const ok = await this.s3Service.createBucket(profile, bucketName);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/deleteBucket' && method === 'POST') {
        const { profile, bucketName } = await this.parseJsonBody(req);
        const ok = await this.s3Service.deleteBucket(profile, bucketName);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/createFolder' && method === 'POST') {
        const { profile, bucket, folderKey } = await this.parseJsonBody(req);
        const ok = await this.s3Service.createFolder(profile, bucket, folderKey);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/deleteObjects' && method === 'POST') {
        const { profile, bucket, keys } = await this.parseJsonBody(req);
        const ok = await this.s3Service.deleteObjects(profile, bucket, keys);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/getPresignedUrl' && method === 'POST') {
        const { profile, bucket, key, expiresIn } = await this.parseJsonBody(req);
        const url = await this.s3Service.generatePresignedUrl(profile, bucket, key, expiresIn);
        return this.sendJson(res, 200, { url });
      }

      if (pathname === '/api/s3/getPreview' && method === 'POST') {
        const { profile, bucket, key } = await this.parseJsonBody(req);
        const preview = await this.s3Service.getObjectPreview(profile, bucket, key);
        return this.sendJson(res, 200, preview);
      }

      if (pathname === '/api/s3/getThumbnail' && method === 'POST') {
        const { profile, bucket, key } = await this.parseJsonBody(req);
        const thumbnail = await this.s3Service.getThumbnail(profile, bucket, key);
        return this.sendJson(res, 200, { thumbnail });
      }

      if (pathname === '/api/s3/saveTextContent' && method === 'POST') {
        if (!this.licenseService.isPro()) {
          return this.sendJson(res, 403, { error: 'Редактирование файлов в Monaco доступно только в Pro-версии или в течение пробного периода.' });
        }
        const { profile, bucket, key, content } = await this.parseJsonBody(req);
        const ok = await this.s3Service.uploadTextContent(profile, bucket, key, content);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/testConnection' && method === 'POST') {
        const { profile } = await this.parseJsonBody(req);
        const r = await this.s3Service.testConnection(profile);
        return this.sendJson(res, 200, r);
      }

      if (pathname === '/api/s3/getBucketPolicy' && method === 'POST') {
        const { profile, bucket } = await this.parseJsonBody(req);
        const pol = await this.s3Service.getBucketPolicy(profile, bucket);
        return this.sendJson(res, 200, { policy: pol });
      }

      if (pathname === '/api/s3/setBucketPolicy' && method === 'POST') {
        const { profile, bucket, policyJson } = await this.parseJsonBody(req);
        const ok = await this.s3Service.setBucketPolicy(profile, bucket, policyJson);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/deleteBucketPolicy' && method === 'POST') {
        const { profile, bucket } = await this.parseJsonBody(req);
        const ok = await this.s3Service.deleteBucketPolicy(profile, bucket);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/getBucketVersioning' && method === 'POST') {
        const { profile, bucket } = await this.parseJsonBody(req);
        const ver = await this.s3Service.getBucketVersioning(profile, bucket);
        return this.sendJson(res, 200, { status: ver });
      }

      if (pathname === '/api/s3/setBucketVersioning' && method === 'POST') {
        const { profile, bucket, enabled } = await this.parseJsonBody(req);
        const ok = await this.s3Service.setBucketVersioning(profile, bucket, enabled);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/getObjectTags' && method === 'POST') {
        const { profile, bucket, key } = await this.parseJsonBody(req);
        const tags = await this.s3Service.getObjectTags(profile, bucket, key);
        return this.sendJson(res, 200, { tags });
      }

      if (pathname === '/api/s3/getBatchObjectTags' && method === 'POST') {
        const { profile, bucket, keys } = await this.parseJsonBody(req);
        const tagsMap = await this.s3Service.getBatchObjectTags(profile, bucket, keys);
        return this.sendJson(res, 200, { tagsMap });
      }

      if (pathname === '/api/s3/putObjectTags' && method === 'POST') {
        const { profile, bucket, key, tags } = await this.parseJsonBody(req);
        const ok = await this.s3Service.putObjectTags(profile, bucket, key, tags);
        return this.sendJson(res, 200, { success: ok });
      }

      if (pathname === '/api/s3/deleteObjectTags' && method === 'POST') {
        const { profile, bucket, key } = await this.parseJsonBody(req);
        const ok = await this.s3Service.deleteObjectTags(profile, bucket, key);
        return this.sendJson(res, 200, { success: ok });
      }

      // 4. API: Streaming File Download
      if (pathname === '/api/s3/download' && method === 'GET') {
        const bucket = parsedUrl.searchParams.get('bucket');
        const key = parsedUrl.searchParams.get('key');
        let profile: S3Profile | null = null;

        const profileParam = parsedUrl.searchParams.get('profile');
        if (profileParam) {
          try {
            profile = JSON.parse(profileParam);
          } catch {
            try {
              profile = JSON.parse(decodeURIComponent(profileParam));
            } catch {}
          }
        }
        if (!profile && req.headers['x-s3-profile']) {
          const rawHeader = req.headers['x-s3-profile'] as string;
          try {
            profile = JSON.parse(rawHeader);
          } catch {
            try {
              profile = JSON.parse(decodeURIComponent(rawHeader));
            } catch {}
          }
        }

        if (!bucket || !key || !profile) {
          return this.sendJson(res, 400, { error: 'Missing bucket, key or profile' });
        }

        if (!this.isEndpointAllowed(profile.endpoint)) {
          return this.sendJson(res, 403, {
            error: `Подключение к S3 URL '${profile.endpoint}' запрещено настройками Web-сервера. Разрешенные адреса: ${this.config.allowedUrls.join(', ')}`,
          });
        }

        const client = (this.s3Service as any).getClient(profile);
        const s3Res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

        const filename = key.split('/').filter(Boolean).pop() || 'download';
        const contentType = s3Res.ContentType || mime.lookup(filename) || 'application/octet-stream';
        // HTTP headers only permit ASCII in basic parameter values.
        // Modern browsers use RFC 5987 filename*=UTF-8'' for full Unicode/Cyrillic support.
        const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\r\n]/g, '_') || 'download';
        const encodedFilename = encodeURIComponent(filename);

        const responseHeaders: Record<string, string | number> = {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
          'Access-Control-Allow-Origin': '*',
        };
        if (typeof s3Res.ContentLength === 'number' && s3Res.ContentLength > 0) {
          responseHeaders['Content-Length'] = s3Res.ContentLength;
        }

        res.writeHead(200, responseHeaders);

        if (s3Res.Body) {
          (s3Res.Body as any).pipe(res);
        } else {
          res.end();
        }
        return;
      }

      // 4b. API: Streaming Folder and Bulk Selection ZIP Download
      if (pathname === '/api/s3/download-zip' && method === 'GET') {
        const bucket = parsedUrl.searchParams.get('bucket');
        const prefix = parsedUrl.searchParams.get('prefix') || '';
        const keysParam = parsedUrl.searchParams.get('keys');
        let profile: S3Profile | null = null;

        const profileParam = parsedUrl.searchParams.get('profile');
        if (profileParam) {
          try {
            profile = JSON.parse(profileParam);
          } catch {
            try {
              profile = JSON.parse(decodeURIComponent(profileParam));
            } catch {}
          }
        }
        if (!profile && req.headers['x-s3-profile']) {
          const rawHeader = req.headers['x-s3-profile'] as string;
          try {
            profile = JSON.parse(rawHeader);
          } catch {
            try {
              profile = JSON.parse(decodeURIComponent(rawHeader));
            } catch {}
          }
        }

        if (!bucket || !profile) {
          return this.sendJson(res, 400, { error: 'Missing bucket or profile' });
        }

        if (!this.isEndpointAllowed(profile.endpoint)) {
          return this.sendJson(res, 403, {
            error: `Подключение к S3 URL '${profile.endpoint}' запрещено настройками Web-сервера. Разрешенные адреса: ${this.config.allowedUrls.join(', ')}`,
          });
        }

        const client = (this.s3Service as any).getClient(profile);

        let archiveBaseName = 'download';
        const filesToZip: { s3Key: string; zipPath: string }[] = [];

        if (keysParam) {
          // Bulk download of selected keys/folders
          let selectedKeys: string[] = [];
          try {
            selectedKeys = JSON.parse(keysParam);
          } catch {
            try {
              selectedKeys = JSON.parse(decodeURIComponent(keysParam));
            } catch {
              selectedKeys = keysParam.split(',').filter(Boolean);
            }
          }

          archiveBaseName = selectedKeys.length === 1
            ? selectedKeys[0].replace(/\/+$/, '').split('/').filter(Boolean).pop() || 'archive'
            : 'archive';

          for (const rawKey of selectedKeys) {
            if (rawKey.endsWith('/')) {
              // Directory prefix: recursively list all objects
              const folderPrefix = rawKey;
              const folderName = folderPrefix.replace(/\/+$/, '').split('/').filter(Boolean).pop() || 'folder';
              let continuationToken: string | undefined = undefined;
              let isTruncated = true;

              while (isTruncated) {
                const listRes: ListObjectsV2CommandOutput = await client.send(
                  new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: folderPrefix,
                    ContinuationToken: continuationToken,
                  })
                );
                if (listRes.Contents) {
                  for (const c of listRes.Contents) {
                    if (!c.Key || c.Key === folderPrefix || c.Key.endsWith('/')) continue;
                    const rel = c.Key.startsWith(folderPrefix) ? c.Key.slice(folderPrefix.length) : c.Key;
                    filesToZip.push({
                      s3Key: c.Key,
                      zipPath: `${folderName}/${rel}`.replace(/^\/+/, ''),
                    });
                  }
                }
                isTruncated = Boolean(listRes.IsTruncated);
                continuationToken = listRes.NextContinuationToken;
              }
            } else {
              // Single file
              const fileName = rawKey.split('/').filter(Boolean).pop() || 'file';
              filesToZip.push({
                s3Key: rawKey,
                zipPath: fileName,
              });
            }
          }
        } else if (prefix) {
          // Single folder prefix download
          const normalizedPrefix = !prefix.endsWith('/') ? `${prefix}/` : prefix;
          const segments = normalizedPrefix.replace(/\/+$/, '').split('/').filter(Boolean);
          archiveBaseName = segments.length > 0 ? segments[segments.length - 1] : 'folder';

          let continuationToken: string | undefined = undefined;
          let isTruncated = true;

          while (isTruncated) {
            const listRes: ListObjectsV2CommandOutput = await client.send(
              new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: normalizedPrefix,
                ContinuationToken: continuationToken,
              })
            );
            if (listRes.Contents) {
              for (const c of listRes.Contents) {
                if (!c.Key || c.Key === normalizedPrefix || c.Key.endsWith('/')) continue;
                const rel = c.Key.startsWith(normalizedPrefix) ? c.Key.slice(normalizedPrefix.length) : c.Key;
                filesToZip.push({
                  s3Key: c.Key,
                  zipPath: `${archiveBaseName}/${rel}`.replace(/^\/+/, ''),
                });
              }
            }
            isTruncated = Boolean(listRes.IsTruncated);
            continuationToken = listRes.NextContinuationToken;
          }
        }

        // Response headers for streaming ZIP file with RFC 5987 / RFC 6266 filename support
        const asciiArchiveName = archiveBaseName.replace(/[^\x20-\x7E]/g, '_').replace(/["\r\n]/g, '_') || 'archive';
        const encodedArchiveName = encodeURIComponent(archiveBaseName);

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${asciiArchiveName}.zip"; filename*=UTF-8''${encodedArchiveName}.zip`,
          'Access-Control-Allow-Origin': '*',
        });

        const ZipArchive = await getZipArchiveClass();
        const archive = new ZipArchive({
          zlib: { level: 4 },
        });

        archive.on('error', (err: any) => {
          console.error('[WebServer] Archive stream error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          } else {
            res.destroy();
          }
        });

        archive.pipe(res);

        if (filesToZip.length === 0) {
          // If empty folder, add empty folder directory entry
          archive.append('', { name: `${archiveBaseName}/` });
        } else {
          for (const item of filesToZip) {
            try {
              const s3Res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.s3Key }));
              if (s3Res.Body) {
                archive.append(s3Res.Body as any, { name: item.zipPath });
              }
            } catch (err: any) {
              console.warn(`[WebServer] Skipping file ${item.s3Key} in zip:`, err.message);
            }
          }
        }

        await archive.finalize();
        return;
      }

      // 5. API: Direct Binary Streaming Upload
      if (pathname === '/api/s3/upload' && method === 'POST') {
        const bucketHeader = req.headers['x-s3-bucket'];
        const keyHeader = req.headers['x-s3-key'];
        const profileHeader = req.headers['x-s3-profile'];

        if (!bucketHeader || !keyHeader || !profileHeader) {
          return this.sendJson(res, 400, { error: 'Missing required headers: x-s3-bucket, x-s3-key, x-s3-profile' });
        }

        const bucket = decodeURIComponent(bucketHeader as string);
        const key = decodeURIComponent(keyHeader as string);
        const profile: S3Profile = JSON.parse(decodeURIComponent(profileHeader as string));

        if (!this.isEndpointAllowed(profile.endpoint)) {
          return this.sendJson(res, 403, {
            error: `Подключение к S3 URL '${profile.endpoint}' запрещено настройками Web-сервера. Разрешенные адреса: ${this.config.allowedUrls.join(', ')}`,
          });
        }
        const contentType = mime.lookup(key) || 'application/octet-stream';

        const client = (this.s3Service as any).getClient(profile);
        const upload = new Upload({
          client,
          params: {
            Bucket: bucket,
            Key: key,
            Body: req,
            ContentType: contentType,
          },
        });

        await upload.done();
        return this.sendJson(res, 200, { success: true });
      }

      // 6. API: MinIO Cluster & IAM Admin Endpoints
      if (pathname.startsWith('/api/admin/')) {
        const action = pathname.replace('/api/admin/', '');
        const body = await this.parseJsonBody(req);
        const profile: S3Profile = body.profile;

        if (!profile) {
          return this.sendJson(res, 400, { error: 'Profile is required' });
        }

        // Pro License Verification
        if (!this.licenseService.isPro()) {
          return this.sendJson(res, 403, {
            error: 'Функция управления сервером и IAM доступна только в Pro-версии или во время 14-дневного пробного периода.',
          });
        }

        switch (action) {
          case 'getClusterInfo': {
            const data = await this.minioAdmin.getClusterInfo(profile);
            return this.sendJson(res, 200, data);
          }
          case 'listUsers': {
            const data = await this.minioAdmin.listUsers(profile);
            return this.sendJson(res, 200, data);
          }
          case 'createUser': {
            const ok = await this.minioAdmin.createUser(profile, body.accessKey, body.secretKey, body.policyName);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'setUserStatus': {
            const ok = await this.minioAdmin.setUserStatus(profile, body.accessKey, body.status);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'deleteUser': {
            const ok = await this.minioAdmin.deleteUser(profile, body.accessKey);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'setUserPolicy': {
            const ok = await this.minioAdmin.setUserPolicy(profile, body.accessKey, body.policyName);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'listPolicies': {
            const data = await this.minioAdmin.listPolicies(profile);
            return this.sendJson(res, 200, data);
          }
          case 'getPolicy': {
            const pol = await this.minioAdmin.getPolicy(profile, body.name);
            return this.sendJson(res, 200, { policy: pol });
          }
          case 'addPolicy': {
            const ok = await this.minioAdmin.addPolicy(profile, body.name, body.policyJson);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'deletePolicy': {
            const ok = await this.minioAdmin.deletePolicy(profile, body.name);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'listGroups': {
            const data = await this.minioAdmin.listGroups(profile);
            return this.sendJson(res, 200, data);
          }
          case 'getGroupInfo': {
            const data = await this.minioAdmin.getGroupInfo(profile, body.groupName);
            return this.sendJson(res, 200, data);
          }
          case 'createOrUpdateGroup': {
            const ok = await this.minioAdmin.createOrUpdateGroup(profile, body.groupName, body.members, body.policyName);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'setGroupStatus': {
            const ok = await this.minioAdmin.setGroupStatus(profile, body.groupName, body.status);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'setGroupPolicy': {
            const ok = await this.minioAdmin.setGroupPolicy(profile, body.groupName, body.policyName);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'deleteGroup': {
            const ok = await this.minioAdmin.deleteGroup(profile, body.groupName);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'getBucketStat': {
            const stat = await this.minioAdmin.getBucketStat(profile, body.bucketName);
            return this.sendJson(res, 200, stat);
          }
          case 'getAllBucketsStats': {
            const stats = await this.minioAdmin.getAllBucketsStats(profile, body.bucketNames);
            return this.sendJson(res, 200, stats);
          }
          case 'getCompressionConfig': {
            const cfg = await this.minioAdmin.getCompressionConfig(profile);
            return this.sendJson(res, 200, cfg);
          }
          case 'setCompressionConfig': {
            const r = await this.minioAdmin.setCompressionConfig(profile, body.config);
            return this.sendJson(res, 200, r);
          }
          case 'resetCompressionConfig': {
            const ok = await this.minioAdmin.resetCompressionConfig(profile);
            return this.sendJson(res, 200, { success: ok });
          }
          case 'exportConfig': {
            const exp = await this.minioAdmin.exportConfig(profile);
            return this.sendJson(res, 200, { config: exp });
          }
          case 'importConfig': {
            const ok = await this.minioAdmin.importConfig(profile, body.content);
            return this.sendJson(res, 200, { success: ok });
          }
          default:
            return this.sendJson(res, 404, { error: `Admin action ${action} not found` });
        }
      }

      // 7. Static Files Serving (SPA fallback)
      if (method === 'GET') {
        let filePath = path.join(this.distDir, pathname.replace(/^\/+/, ''));
        // If requesting root or a non-existent route, serve index.html
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(this.distDir, 'index.html');
        }

        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = mime.lookup(ext) || 'application/octet-stream';
          const stat = fs.statSync(filePath);

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Cache-Control': ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*',
          });

          const readStream = fs.createReadStream(filePath);
          readStream.pipe(res);
          return;
        }
      }

      // If nothing matched
      this.sendJson(res, 404, { error: 'Not Found' });
    } catch (err: any) {
      console.error('[WebServer] Request handler error:', err);
      const statusCode = err.statusCode || 500;
      this.sendJson(res, statusCode, { error: err.message || 'Internal Server Error' });
    }
  }
}
