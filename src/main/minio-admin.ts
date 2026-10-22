import http from 'http';
import https from 'https';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { URL } from 'url';
import { app } from 'electron';
import {
  S3Profile,
  MinioClusterInfo,
  MinioDriveInfo,
  MinioServerInfo,
  MinioUser,
  MinioGroup,
  MinioPolicy,
  MinioBucketStat,
  MinioCompressionConfig,
  UserPermissions,
} from '../common/types';

function hmac(key: Buffer | string, data: string | Buffer): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac('AWS4' + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export class MinioAdminService {
  private mcConfigDir: string | null = null;
  private configuredAliases: Set<string> = new Set();
  private aliasLocks: Map<string, Promise<string>> = new Map();

  private getMcConfigDir(): string {
    if (!this.mcConfigDir) {
      this.mcConfigDir = path.join(app.getPath('userData'), 'mc_config');
      if (!fs.existsSync(this.mcConfigDir)) {
        fs.mkdirSync(this.mcConfigDir, { recursive: true });
      }
    }
    return this.mcConfigDir;
  }

  /**
   * Automatically locate mc binary in project root, app directory, or resources
   */
  public findMcExecutable(): string | null {
    const candidates = [
      path.join(process.cwd(), 'mc.windows-amd64.RELEASE.2025-08-13T08-35-41Z.exe'),
      path.join(process.cwd(), 'mc.exe'),
      path.join(app.getAppPath(), 'mc.windows-amd64.RELEASE.2025-08-13T08-35-41Z.exe'),
      path.join(app.getAppPath(), 'mc.exe'),
      path.join(path.dirname(process.execPath), 'mc.exe'),
      path.join(process.resourcesPath || '', 'mc.exe'),
    ];

    try {
      const files = fs.readdirSync(process.cwd());
      for (const f of files) {
        if (f.toLowerCase().startsWith('mc') && f.toLowerCase().endsWith('.exe')) {
          candidates.push(path.join(process.cwd(), f));
        }
      }
    } catch {}

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Run mc command with isolated config directory
   */
  private async runMc(args: string[]): Promise<string> {
    const mcPath = this.findMcExecutable();
    if (!mcPath) {
      throw new Error(
        'Утилита mc.exe не найдена. Поместите файл mc.exe в папку приложения для управления MinIO.'
      );
    }

    const configDir = this.getMcConfigDir();

    return new Promise((resolve, reject) => {
      execFile(
        mcPath,
        ['--config-dir', configDir, ...args],
        { timeout: 10000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            let msg = '';
            if (stdout && stdout.trim()) {
              try {
                const parsed = JSON.parse(stdout.trim());
                if (parsed.error) {
                  msg =
                    parsed.error.cause?.message ||
                    parsed.error.message ||
                    (typeof parsed.error === 'string' ? parsed.error : '');
                }
              } catch {}
            }
            if (!msg && stderr && stderr.trim()) {
              msg = stderr.trim();
            }
            if (!msg) {
              msg = err.message;
            }
            msg = msg.replace(/^mc:\s*<ERROR>\s*/i, '').replace(/^mc:\s*/i, '');
            reject(new Error(msg));
          } else {
            resolve(stdout);
          }
        }
      );
    });
  }

  private isAccessDeniedError(err: any): boolean {
    const msg = (err?.message || err?.name || String(err)).toLowerCase();
    return (
      msg.includes('access denied') ||
      msg.includes('accessdenied') ||
      msg.includes('forbidden') ||
      msg.includes('403') ||
      msg.includes('unauthorized')
    );
  }

  /**
   * Ensure mc alias is configured for the given profile (with thread-safe lock to prevent concurrent config.json file corruption)
   */
  private async ensureMcAlias(profile: S3Profile): Promise<string> {
    const safeId = (profile.id || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const alias = `prof_${safeId}`;
    let endpoint = (profile.endpoint || '').trim();
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      endpoint = (profile.useSSL ? 'https://' : 'http://') + endpoint;
    }

    const cacheKey = `${alias}_${endpoint}_${profile.accessKey}`;
    if (this.configuredAliases.has(cacheKey)) {
      return alias;
    }

    if (this.aliasLocks.has(cacheKey)) {
      return this.aliasLocks.get(cacheKey)!;
    }

    const lockPromise = (async () => {
      try {
        await this.runMc(['alias', 'set', alias, endpoint, profile.accessKey, profile.secretKey]);
        this.configuredAliases.add(cacheKey);
        return alias;
      } finally {
        this.aliasLocks.delete(cacheKey);
      }
    })();

    this.aliasLocks.set(cacheKey, lockPromise);
    return lockPromise;
  }

  /**
   * Universal SigV4 signed request to MinIO Admin API (/minio/admin/v3/...)
   */
  private async executeAdminRequest(
    profile: S3Profile,
    method: string,
    pathname: string,
    queryParams: Record<string, string> = {},
    bodyBuffer: Buffer = Buffer.alloc(0),
    contentType: string = 'application/json'
  ): Promise<{ status: number; data: any; raw: string }> {
    let endpoint = (profile.endpoint || '').trim();
    if (!endpoint) throw new Error('Endpoint профиля не указан');

    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      endpoint = (profile.useSSL ? 'https://' : 'http://') + endpoint;
    }

    const endpointUrl = new URL(endpoint);
    const isHttps = endpointUrl.protocol === 'https:';

    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      searchParams.set(k, v);
    }
    searchParams.sort();
    const canonicalQuery = searchParams.toString();

    const fullPath = pathname + (canonicalQuery ? `?${canonicalQuery}` : '');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const region = profile.region || 'us-east-1';
    const service = 's3';

    const host = endpointUrl.host;
    const payloadHash = sha256(bodyBuffer);

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      method,
      pathname,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      `${dateStamp}/${region}/${service}/aws4_request`,
      sha256(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(profile.secretKey, dateStamp, region, service);
    const signature = hmac(signingKey, stringToSign).toString('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${profile.accessKey}/${dateStamp}/${region}/${service}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const requestHeaders: Record<string, string | number> = {
      Host: host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authHeader,
      'Content-Length': bodyBuffer.length,
    };
    if (bodyBuffer.length > 0) {
      requestHeaders['Content-Type'] = contentType;
    }

    return new Promise((resolve, reject) => {
      const lib = isHttps ? https : http;
      const req = lib.request(
        {
          protocol: endpointUrl.protocol,
          hostname: endpointUrl.hostname,
          port: endpointUrl.port || (isHttps ? 443 : 80),
          method,
          path: fullPath,
          headers: requestHeaders,
          rejectUnauthorized: false,
          timeout: 10000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            let parsed: any = null;
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = null;
            }
            resolve({ status: res.statusCode || 0, data: parsed, raw });
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Время ожидания запроса к MinIO Admin API истекло'));
      });

      if (bodyBuffer.length > 0) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  }

  /**
   * Helper to parse MinIO cluster and drives info JSON (from either mc admin info or direct API)
   */
  private parseClusterInfoData(d: any, profile: S3Profile): MinioClusterInfo {
    const servers: MinioServerInfo[] = [];
    const allDrives: MinioDriveInfo[] = [];
    let totalSpace = 0;
    let freeSpace = 0;
    let usedSpace = 0;

    const serverList = Array.isArray(d.servers) ? d.servers : [];

    for (const s of serverList) {
      const sDrives: MinioDriveInfo[] = [];
      const driveList = Array.isArray(s.drives) ? s.drives : [];

      for (const dr of driveList) {
        // MinIO returns lowercase property names: totalspace, availspace, usedspace, path
        const drTotal = Number(dr.totalspace ?? dr.totalSpace ?? dr.rawCapacity ?? 0);
        const drFree = Number(dr.availspace ?? dr.freeSpace ?? 0);
        const drUsed = Number(dr.usedspace ?? dr.usedSpace ?? Math.max(0, drTotal - drFree));
        const percent = drTotal > 0 ? Number(((drUsed / drTotal) * 100).toFixed(1)) : 0;
        const drivePath = dr.path || dr.drivePath || dr.endpoint || 'диск';

        const driveObj: MinioDriveInfo = {
          uuid: dr.uuid,
          endpoint: dr.endpoint,
          drivePath,
          state: dr.state || 'ok',
          totalSpace: drTotal,
          freeSpace: drFree,
          usedSpace: drUsed,
          percentUsed: percent,
          rootDisk: dr.rootDisk || dr.local,
        };

        sDrives.push(driveObj);
        allDrives.push(driveObj);

        totalSpace += drTotal;
        freeSpace += drFree;
        usedSpace += drUsed;
      }

      servers.push({
        endpoint: s.endpoint || 'local',
        state: s.state || 'online',
        uptime: s.uptime || 0,
        version: s.version || d.version || 'MinIO',
        commitID: s.commitID,
        drives: sDrives,
      });
    }

    // Fallback if drives array was not populated: check pools
    if (totalSpace === 0 && d.pools) {
      for (const poolVal of Object.values<any>(d.pools)) {
        for (const subVal of Object.values<any>(poolVal)) {
          if (subVal.rawCapacity) totalSpace += Number(subVal.rawCapacity);
          if (subVal.rawUsage) usedSpace += Number(subVal.rawUsage);
        }
      }
      freeSpace = Math.max(0, totalSpace - usedSpace);
    }

    const percentUsed = totalSpace > 0 ? Number(((usedSpace / totalSpace) * 100).toFixed(1)) : 0;
    const firstServer = serverList[0] || {};

    return {
      isMinio: true,
      mode: d.mode || 'online',
      region: d.region || profile.region || 'us-east-1',
      version: servers[0]?.version || d.version || 'MinIO',
      uptime: servers[0]?.uptime || 0,
      totalSpace,
      freeSpace,
      usedSpace,
      percentUsed,
      bucketsCount: d.buckets?.count || 0,
      objectsCount: d.objects?.count || 0,
      reportedUsage: d.usage?.size ?? usedSpace,
      backendType: d.backend?.backendType || 'Erasure',
      standardSCParity: d.backend?.standardSCParity ?? 'n/a',
      rrSCParity: d.backend?.rrSCParity ?? 'n/a',
      onlineDisks: d.backend?.onlineDisks ?? allDrives.filter((dr) => dr.state === 'ok').length,
      totalDisks: d.backend?.totalDisks ?? allDrives.length,
      offlineDisks: d.backend?.offlineDisks ?? Math.max(0, (d.backend?.totalDisks ?? allDrives.length) - (d.backend?.onlineDisks ?? allDrives.filter((dr) => dr.state === 'ok').length)),
      servers,
      drives: allDrives,
      memStats: firstServer.mem_stats,
      numCpu: firstServer.num_cpu,
    };
  }

  /**
   * Fetch cluster info, drives status, free/used space from MinIO
   */
  public async getClusterInfo(profile: S3Profile): Promise<MinioClusterInfo> {
    // 1. Try mc admin info if mc is available
    if (this.findMcExecutable()) {
      try {
        const alias = await this.ensureMcAlias(profile);
        const out = await this.runMc(['admin', 'info', alias, '--json']);
        const parsed = JSON.parse(out);
        if (parsed.status === 'error' || parsed.error) {
          const errMsg =
            typeof parsed.error === 'string'
              ? parsed.error
              : parsed.error?.cause?.message || parsed.error?.message || 'Access Denied';
          return {
            isMinio: false,
            totalSpace: 0,
            freeSpace: 0,
            usedSpace: 0,
            percentUsed: 0,
            bucketsCount: 0,
            objectsCount: 0,
            servers: [],
            drives: [],
            error: errMsg.includes('Access Denied')
              ? 'Доступ к MinIO Admin API запрещен (требуются права администратора / consoleAdmin)'
              : errMsg,
          };
        }
        const infoObj = parsed.info || parsed;
        return this.parseClusterInfoData(infoObj, profile);
      } catch (mcErr) {
        console.warn('mc admin info failed, trying direct HTTP:', mcErr);
      }
    }

    // 2. Direct HTTP /minio/admin/v3/info
    try {
      const res = await this.executeAdminRequest(profile, 'GET', '/minio/admin/v3/info');

      if (res.status === 403) {
        return {
          isMinio: false,
          totalSpace: 0,
          freeSpace: 0,
          usedSpace: 0,
          percentUsed: 0,
          bucketsCount: 0,
          objectsCount: 0,
          servers: [],
          drives: [],
          error: 'Доступ к MinIO Admin API запрещен (требуются права администратора / consoleAdmin)',
        };
      }

      if (res.status === 404 || res.status >= 500 || !res.data) {
        return {
          isMinio: false,
          totalSpace: 0,
          freeSpace: 0,
          usedSpace: 0,
          percentUsed: 0,
          bucketsCount: 0,
          objectsCount: 0,
          servers: [],
          drives: [],
          error: `Сервер вернул статус ${res.status}. Возможно, это стандартный AWS S3 или MinIO Admin API отключен.`,
        };
      }

      return this.parseClusterInfoData(res.data, profile);
    } catch (err: any) {
      return {
        isMinio: false,
        totalSpace: 0,
        freeSpace: 0,
        usedSpace: 0,
        percentUsed: 0,
        bucketsCount: 0,
        objectsCount: 0,
        servers: [],
        drives: [],
        error: err.message || 'Ошибка подключения к MinIO Admin API',
      };
    }
  }

  /**
   * List all MinIO users with status and policies
   */
  public async listUsers(profile: S3Profile): Promise<MinioUser[]> {
    if (this.findMcExecutable()) {
      try {
        const alias = await this.ensureMcAlias(profile);
        const out = await this.runMc(['admin', 'user', 'list', alias, '--json']);
        const lines = out.trim().split('\n').filter(Boolean);
        const results: MinioUser[] = [];

        for (const line of lines) {
          try {
            const u = JSON.parse(line);
            if (u.accessKey) {
              results.push({
                accessKey: u.accessKey,
                status: u.userStatus === 'disabled' ? 'disabled' : 'enabled',
                policyName: u.policyName || '',
                memberOf: u.memberOf,
              });
            }
          } catch {}
        }

        return results;
      } catch (err: any) {
        if (this.isAccessDeniedError(err)) {
          return [];
        }
        throw err;
      }
    }

    // Direct HTTP fallback
    const res = await this.executeAdminRequest(profile, 'GET', '/minio/admin/v3/list-users');
    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка получения списка пользователей (код ${res.status})`);
    }

    // If response is encrypted estream (not valid JSON object), alert user to use mc.exe
    if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
      throw new Error(
        'MinIO возвращает зашифрованный список пользователей (estream). Для управления пользователями используйте утилиту mc.exe в папке приложения.'
      );
    }

    const results: MinioUser[] = [];
    for (const [accessKey, val] of Object.entries<any>(res.data)) {
      if (typeof val === 'object' && val !== null) {
        results.push({
          accessKey,
          status: val.status === 'disabled' ? 'disabled' : 'enabled',
          policyName: val.policyName || (Array.isArray(val.policies) ? val.policies.join(', ') : ''),
          memberOf: val.memberOf,
        });
      }
    }

    return results;
  }

  /**
   * Create or update a MinIO user
   */
  public async createUser(
    profile: S3Profile,
    accessKey: string,
    secretKey: string,
    policyName?: string
  ): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      await this.runMc(['admin', 'user', 'add', alias, accessKey.trim(), secretKey.trim()]);
      if (policyName && policyName.trim()) {
        await this.runMc(['admin', 'policy', 'attach', alias, policyName.trim(), '--user', accessKey.trim()]);
      }
      return true;
    }

    throw new Error('Для создания пользователя требуется утилита mc.exe в папке приложения.');
  }

  /**
   * Enable or disable a MinIO user
   */
  public async setUserStatus(
    profile: S3Profile,
    accessKey: string,
    status: 'enabled' | 'disabled'
  ): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const action = status === 'enabled' ? 'enable' : 'disable';
      await this.runMc(['admin', 'user', action, alias, accessKey.trim()]);
      return true;
    }

    const res = await this.executeAdminRequest(
      profile,
      'POST',
      '/minio/admin/v3/set-user-status',
      { accessKey, status }
    );

    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка изменения статуса пользователя (код ${res.status})`);
    }

    return true;
  }

  /**
   * Delete a MinIO user
   */
  public async deleteUser(profile: S3Profile, accessKey: string): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      await this.runMc(['admin', 'user', 'rm', alias, accessKey.trim()]);
      return true;
    }

    const res = await this.executeAdminRequest(
      profile,
      'DELETE',
      '/minio/admin/v3/remove-user',
      { accessKey }
    );

    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка удаления пользователя (код ${res.status})`);
    }

    return true;
  }

  /**
   * Attach policy to user
   */
  public async setUserPolicy(
    profile: S3Profile,
    accessKey: string,
    policyName: string
  ): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      await this.runMc(['admin', 'policy', 'attach', alias, policyName.trim(), '--user', accessKey.trim()]);
      return true;
    }

    const res = await this.executeAdminRequest(
      profile,
      'POST',
      '/minio/admin/v3/set-user-or-group-policy',
      {
        userOrGroup: accessKey,
        policyName,
        isGroup: 'false',
      }
    );

    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка назначения политики пользователю (код ${res.status})`);
    }

    return true;
  }

  /**
   * List all canned / custom policies
   */
  public async listPolicies(profile: S3Profile): Promise<MinioPolicy[]> {
    if (this.findMcExecutable()) {
      try {
        const alias = await this.ensureMcAlias(profile);
        const out = await this.runMc(['admin', 'policy', 'list', alias, '--json']);
        const lines = out.trim().split('\n').filter(Boolean);
        const results: MinioPolicy[] = [];

        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            const pName = item.policy || item.policyInfo?.PolicyName;
            if (pName) {
              const polDoc = item.policyInfo?.Policy
                ? JSON.stringify(item.policyInfo.Policy, null, 2)
                : '';
              results.push({ name: pName, policy: polDoc });
            }
          } catch {}
        }

        return results;
      } catch (err: any) {
        if (this.isAccessDeniedError(err)) {
          return [];
        }
        throw err;
      }
    }

    const res = await this.executeAdminRequest(profile, 'GET', '/minio/admin/v3/list-canned-policies');
    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка получения списка политик (код ${res.status})`);
    }

    if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) {
      return [];
    }

    const policiesMap = res.data;
    const results: MinioPolicy[] = [];

    for (const [name, val] of Object.entries<any>(policiesMap)) {
      if (typeof val === 'object' && val !== null) {
        const policyStr = JSON.stringify(val, null, 2);
        results.push({ name, policy: policyStr });
      }
    }

    return results;
  }

  /**
   * Get policy definition JSON
   */
  public async getPolicy(profile: S3Profile, name: string): Promise<string> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const out = await this.runMc(['admin', 'policy', 'info', alias, name, '--json']);
      const data = JSON.parse(out);
      const policyDoc = data.policyInfo?.Policy || data;
      return JSON.stringify(policyDoc, null, 2);
    }

    const res = await this.executeAdminRequest(
      profile,
      'GET',
      '/minio/admin/v3/info-canned-policy',
      { name }
    );

    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка получения политики ${name}`);
    }

    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
  }

  /**
   * Add or update a canned policy
   */
  public async addPolicy(profile: S3Profile, name: string, policyJson: string): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const tempFile = path.join(
        app.getPath('temp'),
        `pol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`
      );
      try {
        fs.writeFileSync(tempFile, policyJson, 'utf-8');
        await this.runMc(['admin', 'policy', 'create', alias, name.trim(), tempFile]);
        return true;
      } finally {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}
      }
    }

    const bodyBuffer = Buffer.from(policyJson, 'utf-8');
    const res = await this.executeAdminRequest(
      profile,
      'PUT',
      '/minio/admin/v3/add-canned-policy',
      { name },
      bodyBuffer,
      'application/json'
    );

    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка сохранения политики (код ${res.status})`);
    }

    return true;
  }

  /**
   * Delete a canned policy
   */
  public async deletePolicy(profile: S3Profile, name: string): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      await this.runMc(['admin', 'policy', 'rm', alias, name.trim()]);
      return true;
    }

    const res = await this.executeAdminRequest(
      profile,
      'DELETE',
      '/minio/admin/v3/remove-canned-policy',
      { name }
    );

    if (res.status >= 400) {
      throw new Error(res.data?.message || `Ошибка удаления политики (код ${res.status})`);
    }

    return true;
  }

  /**
   * List all MinIO groups with status, members and policy
   */
  public async listGroups(profile: S3Profile): Promise<MinioGroup[]> {
    if (this.findMcExecutable()) {
      try {
        const alias = await this.ensureMcAlias(profile);
        const out = await this.runMc(['admin', 'group', 'list', alias, '--json']);
        const lines = out.trim().split('\n').filter(Boolean);
        const groupNames: string[] = [];

        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            if (Array.isArray(item.groups)) {
              groupNames.push(...item.groups);
            } else if (item.group) {
              groupNames.push(item.group);
            }
          } catch {}
        }

        const results: MinioGroup[] = [];
        for (const gName of groupNames) {
          try {
            const info = await this.getGroupInfo(profile, gName);
            results.push(info);
          } catch {
            results.push({
              name: gName,
              status: 'enabled',
              members: [],
              policy: '',
            });
          }
        }

        return results;
      } catch (err: any) {
        if (this.isAccessDeniedError(err)) {
          return [];
        }
        throw err;
      }
    }

    throw new Error('Для управления группами требуется утилита mc.exe в папке приложения.');
  }

  /**
   * Get single group details (members, status, policy)
   */
  public async getGroupInfo(profile: S3Profile, groupName: string): Promise<MinioGroup> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const infoOut = await this.runMc(['admin', 'group', 'info', alias, groupName.trim(), '--json']);
      const info = JSON.parse(infoOut);
      return {
        name: groupName.trim(),
        status: info.groupStatus === 'disabled' ? 'disabled' : 'enabled',
        members: Array.isArray(info.members) ? info.members : [],
        policy: info.groupPolicy || '',
      };
    }
    throw new Error('Для работы с группами требуется утилита mc.exe');
  }

  /**
   * Create or update group members and policy
   */
  public async createOrUpdateGroup(
    profile: S3Profile,
    groupName: string,
    members: string[],
    policyName?: string
  ): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const cleanName = groupName.trim();

      if (!cleanName) {
        throw new Error('Имя группы не может быть пустым');
      }

      if (!members || members.length === 0) {
        throw new Error('В группе должен быть выбран как минимум один пользователь');
      }

      // Check if group already exists
      let currentMembers: string[] = [];
      let groupExists = false;
      let currentPolicy = '';
      try {
        const info = await this.getGroupInfo(profile, cleanName);
        currentMembers = info.members;
        currentPolicy = info.policy || '';
        groupExists = true;
      } catch {}

      // Add members (mc admin group add adds members or creates group)
      await this.runMc(['admin', 'group', 'add', alias, cleanName, ...members]);

      // If group already existed, remove unchecked members
      if (groupExists && currentMembers.length > 0) {
        const toRemove = currentMembers.filter((m) => !members.includes(m));
        if (toRemove.length > 0) {
          await this.runMc(['admin', 'group', 'rm', alias, cleanName, ...toRemove]);
        }
      }

      // Attach or detach policy
      if (policyName && policyName.trim()) {
        if (currentPolicy !== policyName.trim()) {
          await this.runMc(['admin', 'policy', 'attach', alias, policyName.trim(), '--group', cleanName]);
        }
      } else if (groupExists && currentPolicy) {
        try {
          await this.runMc(['admin', 'policy', 'detach', alias, currentPolicy, '--group', cleanName]);
        } catch {}
      }

      return true;
    }
    throw new Error('Для работы с группами требуется утилита mc.exe');
  }

  /**
   * Enable or disable a MinIO group
   */
  public async setGroupStatus(
    profile: S3Profile,
    groupName: string,
    status: 'enabled' | 'disabled'
  ): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const action = status === 'enabled' ? 'enable' : 'disable';
      await this.runMc(['admin', 'group', action, alias, groupName.trim()]);
      return true;
    }
    throw new Error('Для работы с группами требуется утилита mc.exe');
  }

  /**
   * Attach policy to a group
   */
  public async setGroupPolicy(
    profile: S3Profile,
    groupName: string,
    policyName: string
  ): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const cleanGroup = groupName.trim();
      const cleanPolicy = policyName.trim();

      if (!cleanPolicy) {
        try {
          const info = await this.getGroupInfo(profile, cleanGroup);
          if (info.policy) {
            await this.runMc(['admin', 'policy', 'detach', alias, info.policy, '--group', cleanGroup]);
          }
        } catch {}
      } else {
        await this.runMc(['admin', 'policy', 'attach', alias, cleanPolicy, '--group', cleanGroup]);
      }
      return true;
    }
    throw new Error('Для работы с группами требуется утилита mc.exe');
  }

  /**
   * Delete a MinIO group (removes all members first if needed)
   */
  public async deleteGroup(profile: S3Profile, groupName: string): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const cleanName = groupName.trim();
      try {
        const info = await this.getGroupInfo(profile, cleanName);
        if (info.members && info.members.length > 0) {
          await this.runMc(['admin', 'group', 'rm', alias, cleanName, ...info.members]);
        }
      } catch {}
      await this.runMc(['admin', 'group', 'rm', alias, cleanName]);
      return true;
    }
    throw new Error('Для работы с группами требуется утилита mc.exe');
  }

  /**
   * Get single bucket statistics (usage size, object count, access, lastModified)
   */
  public async getBucketStat(profile: S3Profile, bucketName: string): Promise<MinioBucketStat> {
    if (this.findMcExecutable()) {
      try {
        const alias = await this.ensureMcAlias(profile);
        const out = await this.runMc(['stat', `${alias}/${bucketName}`, '--json']);
        const data = JSON.parse(out);
        const usage = data.Usage || {};
        const policyType = data.Policy?.type || 'none';
        let access = 'R/W';
        if (policyType === 'readonly') access = 'Read-Only';
        else if (policyType === 'writeonly') access = 'Write-Only';
        else if (policyType === 'none') access = 'R/W';

        return {
          name: bucketName,
          size: Number(usage.size ?? data.size ?? 0),
          objectsCount: Number(usage.objectsCount ?? data.objectsCount ?? data.objects ?? 0),
          created: data.lastModified,
          access,
          versioning:
            data.Versioning?.status === 'Enabled'
              ? 'Enabled'
              : data.Versioning?.status === 'Suspended'
              ? 'Suspended'
              : 'None',
          objectLock: data.ObjectLock?.enabled === 'true' || !!data.ObjectLock?.mode,
        };
      } catch (err: any) {
        console.warn(`mc stat failed for bucket ${bucketName}:`, err.message);
      }
    }

    return {
      name: bucketName,
      size: 0,
      objectsCount: 0,
      access: 'R/W',
      versioning: 'None',
    };
  }

  /**
   * Get all buckets statistics in batch with parallel execution
   */
  public async getAllBucketsStats(
    profile: S3Profile,
    bucketNames: string[]
  ): Promise<Record<string, MinioBucketStat>> {
    const results: Record<string, MinioBucketStat> = {};
    if (!bucketNames || bucketNames.length === 0) return results;

    // Ensure alias is configured once before running all concurrent calls
    if (this.findMcExecutable()) {
      try {
        await this.ensureMcAlias(profile);
      } catch (err) {
        console.warn('Failed to ensure alias before batch stats:', err);
      }
    }

    await Promise.all(
      bucketNames.map(async (bName) => {
        try {
          results[bName] = await this.getBucketStat(profile, bName);
        } catch (err) {
          console.warn(`Error getting stat for ${bName}:`, err);
          results[bName] = {
            name: bName,
            size: 0,
            objectsCount: 0,
            access: 'R/W',
            versioning: 'None',
          };
        }
      })
    );

    return results;
  }

  /**
   * Get MinIO Compression Configuration
   */
  public async getCompressionConfig(profile: S3Profile): Promise<MinioCompressionConfig> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      try {
        const out = await this.runMc(['admin', 'config', 'get', alias, 'compression', '--json']);
        const parsed = JSON.parse(out);
        const kvList: Array<{ key: string; value: string }> = parsed.config?.[0]?.kv || [];
        const kvMap: Record<string, string> = {};
        for (const item of kvList) {
          kvMap[item.key] = item.value;
        }

        const extensions = kvMap.extensions
          ? kvMap.extensions.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        const mimeTypes = kvMap.mime_types
          ? kvMap.mime_types.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

        return {
          enable: kvMap.enable === 'on',
          allow_encryption: kvMap.allow_encryption === 'on',
          extensions,
          mime_types: mimeTypes,
        };
      } catch (err: any) {
        // Fallback to text parsing if --json output format differs
        const out = await this.runMc(['admin', 'config', 'get', alias, 'compression']);
        const extMatch = out.match(/extensions=([^\s]+)/);
        const mimeMatch = out.match(/mime_types=([^\s]+)/);
        const enableMatch = out.match(/enable=([^\s]+)/);
        const encMatch = out.match(/allow_encryption=([^\s]+)/);

        return {
          enable: enableMatch ? enableMatch[1] === 'on' : false,
          allow_encryption: encMatch ? encMatch[1] === 'on' : false,
          extensions: extMatch ? extMatch[1].split(',').filter(Boolean) : [],
          mime_types: mimeMatch ? mimeMatch[1].split(',').filter(Boolean) : [],
        };
      }
    }
    throw new Error('Утилита mc.exe не найдена');
  }

  /**
   * Set MinIO Compression Configuration
   */
  public async setCompressionConfig(
    profile: S3Profile,
    config: MinioCompressionConfig
  ): Promise<{ success: boolean; message?: string }> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const args = ['admin', 'config', 'set', alias, 'compression'];

      if (config.enable !== undefined) {
        args.push(`enable=${config.enable ? 'on' : 'off'}`);
      }
      if (config.allow_encryption !== undefined) {
        args.push(`allow_encryption=${config.allow_encryption ? 'on' : 'off'}`);
      }
      args.push(`extensions=${config.extensions.join(',')}`);
      args.push(`mime_types=${config.mime_types.join(',')}`);

      const out = await this.runMc(args);
      return { success: true, message: out.trim() || 'Настройки сжатия успешно сохранены' };
    }
    throw new Error('Утилита mc.exe не найдена');
  }

  /**
   * Reset MinIO Compression Configuration to Defaults
   */
  public async resetCompressionConfig(profile: S3Profile): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      await this.runMc(['admin', 'config', 'reset', alias, 'compression']);
      return true;
    }
    throw new Error('Утилита mc.exe не найдена');
  }

  /**
   * Export all server configurations
   */
  public async exportConfig(profile: S3Profile): Promise<string> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const out = await this.runMc(['admin', 'config', 'export', alias]);
      return out;
    }
    throw new Error('Утилита mc.exe не найдена');
  }

  /**
   * Import server configurations
   */
  public async importConfig(profile: S3Profile, content: string): Promise<boolean> {
    if (this.findMcExecutable()) {
      const alias = await this.ensureMcAlias(profile);
      const tempFile = path.join(this.getMcConfigDir(), `import_${Date.now()}.txt`);
      fs.writeFileSync(tempFile, content, 'utf-8');
      try {
        await this.runMc(['admin', 'config', 'import', alias, tempFile]);
        return true;
      } finally {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }
    }
    throw new Error('Утилита mc.exe не найдена');
  }

  /**
   * Get specific user info (status, policy, groups)
   */
  public async getUserInfo(profile: S3Profile, accessKey: string): Promise<MinioUser | null> {
    if (this.findMcExecutable()) {
      try {
        const alias = await this.ensureMcAlias(profile);
        const out = await this.runMc(['admin', 'user', 'info', alias, accessKey.trim(), '--json']);
        const parsed = JSON.parse(out);
        return {
          accessKey: parsed.accessKey || accessKey,
          status: parsed.userStatus === 'disabled' ? 'disabled' : 'enabled',
          policyName: parsed.policyName || '',
          memberOf: parsed.memberOf,
        };
      } catch {}
    }

    try {
      const users = await this.listUsers(profile);
      const found = users.find((u) => u.accessKey.toLowerCase() === accessKey.trim().toLowerCase());
      if (found) return found;
    } catch {}

    return null;
  }

  /**
   * Parse statements in IAM policy JSON to evaluate permissions
   */
  private evaluatePolicyStatements(policyDoc: any, roleName: string): UserPermissions {
    const statements = Array.isArray(policyDoc?.Statement)
      ? policyDoc.Statement
      : policyDoc?.Statement
      ? [policyDoc.Statement]
      : [];

    let canAdminMinio = false;
    let canManageUsers = false;
    let canManageRoles = false;
    let canManagePolicies = false;
    let canCreateBucket = false;
    let canDeleteBucket = false;
    let canUpload = false;
    let canCreateFolder = false;
    let canDeleteItems = false;
    let canEditTags = false;

    for (const stmt of statements) {
      if (stmt.Effect === 'Allow') {
        const actions: string[] = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        for (const act of actions) {
          const a = (act || '').toLowerCase();
          if (a === '*' || a === 'admin:*') {
            canAdminMinio = true;
            canManageUsers = true;
            canManageRoles = true;
            canManagePolicies = true;
          }
          if (a === '*' || a === 's3:*') {
            canCreateBucket = true;
            canDeleteBucket = true;
            canUpload = true;
            canCreateFolder = true;
            canDeleteItems = true;
            canEditTags = true;
          }
          if (a.includes('admin:clusterinfo') || a.includes('admin:serverinfo')) canAdminMinio = true;
          if (a.includes('admin:user') || a.includes('admin:createuser') || a.includes('admin:listusers')) canManageUsers = true;
          if (a.includes('admin:group') || a.includes('admin:creategroup') || a.includes('admin:listgroups')) canManageRoles = true;
          if (a.includes('admin:policy') || a.includes('admin:addpolicy') || a.includes('admin:listpolicies')) canManagePolicies = true;
          if (a.includes('s3:createbucket')) canCreateBucket = true;
          if (a.includes('s3:deletebucket')) canDeleteBucket = true;
          if (a.includes('s3:putobject')) {
            canUpload = true;
            canCreateFolder = true;
          }
          if (a.includes('s3:deleteobject')) canDeleteItems = true;
          if (a.includes('s3:putobjecttagging')) canEditTags = true;
        }
      }
    }

    // Explicit Deny overrides Allow
    for (const stmt of statements) {
      if (stmt.Effect === 'Deny') {
        const actions: string[] = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        for (const act of actions) {
          const a = (act || '').toLowerCase();
          if (a === '*' || a === 'admin:*') {
            canAdminMinio = false;
            canManageUsers = false;
            canManageRoles = false;
            canManagePolicies = false;
          }
          if (a === '*' || a === 's3:*') {
            canCreateBucket = false;
            canDeleteBucket = false;
            canUpload = false;
            canCreateFolder = false;
            canDeleteItems = false;
            canEditTags = false;
          }
          if (a.includes('admin:clusterinfo') || a.includes('admin:serverinfo')) canAdminMinio = false;
          if (a.includes('admin:user')) canManageUsers = false;
          if (a.includes('admin:group')) canManageRoles = false;
          if (a.includes('admin:policy')) canManagePolicies = false;
          if (a.includes('s3:createbucket')) canCreateBucket = false;
          if (a.includes('s3:deletebucket')) canDeleteBucket = false;
          if (a.includes('s3:putobject')) {
            canUpload = false;
            canCreateFolder = false;
          }
          if (a.includes('s3:deleteobject')) canDeleteItems = false;
          if (a.includes('s3:putobjecttagging')) canEditTags = false;
        }
      }
    }

    return {
      canAdminMinio,
      canManageUsers,
      canManageRoles,
      canManagePolicies,
      canCreateBucket,
      canDeleteBucket,
      canUpload,
      canCreateFolder,
      canDeleteItems,
      canEditTags,
      roleName: roleName || 'Пользовательская политика',
    };
  }

  /**
   * Determine effective permissions for the given profile and user
   */
  public async checkPermissions(profile: S3Profile, _bucket?: string): Promise<UserPermissions> {
    // 1. Manual role setting in profile
    if (profile.permissionRole === 'readonly') {
      return {
        canAdminMinio: false,
        canManageUsers: false,
        canManageRoles: false,
        canManagePolicies: false,
        canCreateBucket: false,
        canDeleteBucket: false,
        canUpload: false,
        canCreateFolder: false,
        canDeleteItems: false,
        canEditTags: false,
        roleName: 'Только чтение',
      };
    }

    if (profile.permissionRole === 'readwrite') {
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
        roleName: 'Чтение и запись',
      };
    }

    if (profile.permissionRole === 'admin') {
      return {
        canAdminMinio: true,
        canManageUsers: true,
        canManageRoles: true,
        canManagePolicies: true,
        canCreateBucket: true,
        canDeleteBucket: true,
        canUpload: true,
        canCreateFolder: true,
        canDeleteItems: true,
        canEditTags: true,
        roleName: 'Администратор',
      };
    }

    // 2. Auto-detect via MinIO Admin API
    try {
      const clusterInfo = await this.getClusterInfo(profile);
      const isMinioAdmin = Boolean(clusterInfo.isMinio && !clusterInfo.error);

      if (isMinioAdmin) {
        let policyName = '';
        try {
          const userInfo = await this.getUserInfo(profile, profile.accessKey);
          if (userInfo) {
            policyName = (userInfo.policyName || '').trim();
          }
        } catch {}

        const normalizedPolicy = policyName.toLowerCase();

        // Root/superadmin or consoleAdmin
        if (!policyName || normalizedPolicy === 'consoleadmin' || profile.accessKey.toLowerCase() === 'minioadmin') {
          return {
            canAdminMinio: true,
            canManageUsers: true,
            canManageRoles: true,
            canManagePolicies: true,
            canCreateBucket: true,
            canDeleteBucket: true,
            canUpload: true,
            canCreateFolder: true,
            canDeleteItems: true,
            canEditTags: true,
            roleName: policyName || 'Администратор (Root)',
          };
        }

        if (normalizedPolicy === 'readonly') {
          return {
            canAdminMinio: false,
            canManageUsers: false,
            canManageRoles: false,
            canManagePolicies: false,
            canCreateBucket: false,
            canDeleteBucket: false,
            canUpload: false,
            canCreateFolder: false,
            canDeleteItems: false,
            canEditTags: false,
            roleName: 'Только чтение',
          };
        }

        if (normalizedPolicy === 'readwrite') {
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
            roleName: 'Чтение и запись',
          };
        }

        if (normalizedPolicy === 'writeonly') {
          return {
            canAdminMinio: false,
            canManageUsers: false,
            canManageRoles: false,
            canManagePolicies: false,
            canCreateBucket: false,
            canDeleteBucket: false,
            canUpload: true,
            canCreateFolder: true,
            canDeleteItems: false,
            canEditTags: false,
            roleName: 'Только запись',
          };
        }

        // Custom policy: inspect actions
        try {
          const policyJson = await this.getPolicy(profile, policyName);
          const parsed = typeof policyJson === 'string' ? JSON.parse(policyJson) : policyJson;
          return this.evaluatePolicyStatements(parsed, policyName);
        } catch {
          return {
            canAdminMinio: true,
            canManageUsers: true,
            canManageRoles: true,
            canManagePolicies: true,
            canCreateBucket: true,
            canDeleteBucket: true,
            canUpload: true,
            canCreateFolder: true,
            canDeleteItems: true,
            canEditTags: true,
            roleName: policyName || 'Администратор',
          };
        }
      }
    } catch {
      // Cluster info failed
    }

    // 3. Fallback for standard S3 or non-admin user
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

  /**
   * Remove mc alias for a profile
   */
  public async removeMcAlias(profileId: string): Promise<void> {
    if (this.findMcExecutable()) {
      try {
        const alias = `prof_${profileId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        await this.runMc(['alias', 'rm', alias]);
      } catch {
        // ignore if alias does not exist
      }
    }
  }
}
