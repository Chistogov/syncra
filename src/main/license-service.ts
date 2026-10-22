import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { app } from 'electron';
import { LicenseStatus } from '../common/types';
import { getMachineHwid, validateLicenseKeyForHwid } from './hwid-service';

const SECRET_SALT = 's3_desktop_explorer_license_salt_v1_secure_hmac_2026';
const TRIAL_DURATION_DAYS = 14;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

interface StoredLicenseData {
  machineId: string;
  firstLaunch: number;
  lastSeen: number;
  signature: string;
  licenseKey?: string;
  tampered?: boolean;
}

export class LicenseService {
  private machineId: string = '';
  private cachedStatus: LicenseStatus | null = null;
  private rawFirstLaunch: number = 0;
  private readonly backupFilePath: string;
  private readonly userDataFilePath: string;

  constructor() {
    this.backupFilePath = path.join(os.homedir(), '.s3_studio_lic');
    let userData = '';
    try {
      userData = app?.getPath ? app.getPath('userData') : '';
    } catch {}
    if (!userData) {
      userData = path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'syncra'
      );
    }
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true });
    }
    this.userDataFilePath = path.join(userData, 'license_data.json');
  }

  /**
   * Get Cross-Platform Machine HWID (Ubuntu, macOS, Windows)
   * Baseboard Serial + CPU Brand -> SHA-256 (first 32 characters)
   */
  public async getMachineId(): Promise<string> {
    if (this.machineId) return this.machineId;
    this.machineId = await getMachineHwid();
    return this.machineId;
  }

  private sign(machineId: string, firstLaunch: number): string {
    return crypto
      .createHmac('sha256', SECRET_SALT)
      .update(`${machineId}:${firstLaunch}`)
      .digest('hex');
  }

  private verify(machineId: string, firstLaunch: number, signature: string): boolean {
    const expected = this.sign(machineId, firstLaunch);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Read trial anchor from Windows Registry (HKCU)
   */
  private async readFromRegistry(): Promise<Partial<StoredLicenseData> | null> {
    if (process.platform !== 'win32') return null;

    return new Promise((resolve) => {
      execFile('reg.exe', ['query', 'HKCU\\Software\\S3DesktopExplorer'], (err, stdout) => {
        if (err || !stdout) return resolve(null);

        const firstLaunchMatch = stdout.match(/FirstLaunch\s+REG_SZ\s+([^\r\n]+)/);
        const lastSeenMatch = stdout.match(/LastSeen\s+REG_SZ\s+([^\r\n]+)/);
        const sigMatch = stdout.match(/Signature\s+REG_SZ\s+([^\r\n]+)/);
        const machineMatch = stdout.match(/MachineId\s+REG_SZ\s+([^\r\n]+)/);
        const keyMatch = stdout.match(/LicenseKey\s+REG_SZ\s+([^\r\n]+)/);

        if (firstLaunchMatch && sigMatch) {
          resolve({
            machineId: machineMatch ? machineMatch[1].trim() : undefined,
            firstLaunch: parseInt(firstLaunchMatch[1].trim(), 10),
            lastSeen: lastSeenMatch ? parseInt(lastSeenMatch[1].trim(), 10) : undefined,
            signature: sigMatch[1].trim(),
            licenseKey: keyMatch ? keyMatch[1].trim() : undefined,
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Write trial anchor to Windows Registry (HKCU)
   */
  private async writeToRegistry(data: StoredLicenseData): Promise<void> {
    if (process.platform !== 'win32') return;

    const commands = [
      ['add', 'HKCU\\Software\\S3DesktopExplorer', '/v', 'FirstLaunch', '/t', 'REG_SZ', '/d', String(data.firstLaunch), '/f'],
      ['add', 'HKCU\\Software\\S3DesktopExplorer', '/v', 'LastSeen', '/t', 'REG_SZ', '/d', String(data.lastSeen), '/f'],
      ['add', 'HKCU\\Software\\S3DesktopExplorer', '/v', 'Signature', '/t', 'REG_SZ', '/d', data.signature, '/f'],
      ['add', 'HKCU\\Software\\S3DesktopExplorer', '/v', 'MachineId', '/t', 'REG_SZ', '/d', data.machineId, '/f'],
    ];

    if (data.licenseKey) {
      commands.push(['add', 'HKCU\\Software\\S3DesktopExplorer', '/v', 'LicenseKey', '/t', 'REG_SZ', '/d', data.licenseKey, '/f']);
    }

    for (const args of commands) {
      await new Promise<void>((resolve) => {
        execFile('reg.exe', args, () => resolve());
      });
    }
  }

  /**
   * Read file anchor
   */
  private readFromFile(filePath: string): Partial<StoredLicenseData> | null {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Write file anchor
   */
  private writeToFile(filePath: string, data: StoredLicenseData): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }

  /**
   * Validate license key against machine HWID
   */
  public validateLicenseKey(
    key: string,
    machineId?: string
  ): { valid: boolean; reason?: string; isMaster?: boolean; isWildcard?: boolean } {
    const hwid = machineId || this.machineId;
    return validateLicenseKeyForHwid(key, hwid || '');
  }

  public isKeyValid(key: string, machineId?: string): boolean {
    return this.validateLicenseKey(key, machineId).valid;
  }

  /**
   * Check and calculate full license status
   * Enforces 14-day trial limit, prevents clock rollback, and guarantees
   * that reinstalling the application does NOT reset the trial.
   */
  public async getLicenseStatus(forceRefresh = false): Promise<LicenseStatus> {
    if (this.cachedStatus && !forceRefresh) {
      return this.cachedStatus;
    }

    const machineId = await this.getMachineId();
    const now = Date.now();

    // 1. Gather all anchors (Registry, UserProfile backup, AppData)
    const registryData = await this.readFromRegistry();
    const backupData = this.readFromFile(this.backupFilePath);
    const userData = this.readFromFile(this.userDataFilePath);

    const candidates: Array<{ firstLaunch: number; lastSeen?: number; licenseKey?: string }> = [];

    // Helper to validate and collect candidate
    const collectCandidate = (item: Partial<StoredLicenseData> | null) => {
      if (!item || !item.firstLaunch || !item.signature) return;
      if (this.verify(machineId, item.firstLaunch, item.signature)) {
        candidates.push({
          firstLaunch: item.firstLaunch,
          lastSeen: item.lastSeen,
          licenseKey: item.licenseKey,
        });
      }
    };

    collectCandidate(registryData);
    collectCandidate(backupData);
    collectCandidate(userData);

    let firstLaunch = now;
    let lastSeen = now;
    let licenseKey: string | undefined = undefined;
    let isClockTampered = false;

    if (candidates.length > 0) {
      // Pick the EARLIEST firstLaunch timestamp among all valid anchors!
      // This ensures that deleting AppData or reinstalling the app NEVER resets the trial clock!
      firstLaunch = Math.min(...candidates.map((c) => c.firstLaunch));

      // Check max lastSeen across anchors
      const allLastSeen = candidates.map((c) => c.lastSeen || 0).filter((t) => t > 0);
      if (allLastSeen.length > 0) {
        lastSeen = Math.max(...allLastSeen);
      }

      // Check if clock was rolled backwards by more than 24 hours
      if (now < lastSeen - 24 * 60 * 60 * 1000) {
        isClockTampered = true;
      }

      // Check if any anchor had an active license key
      licenseKey = candidates.find((c) => Boolean(c.licenseKey))?.licenseKey;
    } else {
      // First launch ever on this machine
      firstLaunch = now;
      lastSeen = now;
    }

    // Update lastSeen to current time if not tampered
    if (!isClockTampered) {
      lastSeen = Math.max(lastSeen, now);
    }

    // Save/repair unified state across all 3 anchors
    const signature = this.sign(machineId, firstLaunch);
    const persistentRecord: StoredLicenseData = {
      machineId,
      firstLaunch,
      lastSeen,
      signature,
      licenseKey,
      tampered: isClockTampered,
    };

    await this.writeToRegistry(persistentRecord);
    this.writeToFile(this.backupFilePath, persistentRecord);
    this.writeToFile(this.userDataFilePath, persistentRecord);

    this.rawFirstLaunch = firstLaunch;

    // 2. Determine License Status
    const isProLicense = Boolean(licenseKey && this.validateLicenseKey(licenseKey, machineId).valid);

    const elapsedMs = Math.max(0, now - firstLaunch);
    const remainingMs = TRIAL_DURATION_MS - elapsedMs;
    const daysLeft = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    const isTrialExpired = !isProLicense && (remainingMs <= 0 || isClockTampered);
    const isTrialActive = !isProLicense && !isTrialExpired && daysLeft > 0;

    const firstLaunchDate = new Date(firstLaunch).toLocaleDateString('ru-RU');
    const trialEndDate = new Date(firstLaunch + TRIAL_DURATION_MS).toLocaleDateString('ru-RU');

    const status: LicenseStatus = {
      isPro: isProLicense || isTrialActive,
      isTrial: isTrialActive,
      trialDaysLeft: isProLicense ? 9999 : daysLeft,
      isExpired: isTrialExpired,
      firstLaunchDate,
      trialEndDate,
      licenseType: isProLicense ? 'pro' : isTrialActive ? 'trial' : 'community',
      machineId,
      licenseKey: isProLicense ? licenseKey : undefined,
    };

    this.cachedStatus = status;
    return status;
  }

  /**
   * Synchronous check if Pro features are currently allowed
   */
  public isPro(): boolean {
    if (this.cachedStatus) {
      return this.cachedStatus.isPro;
    }
    // Default safe check: trial will be computed asynchronously on startup
    return true;
  }

  /**
   * Check if user has an activated paid Pro license (not trial, not community)
   */
  public isPaidPro(): boolean {
    if (this.cachedStatus) {
      return this.cachedStatus.licenseType === 'pro' && !this.cachedStatus.isTrial;
    }
    return false;
  }

  /**
   * Activate a Pro license key
   */
  public async activateLicenseKey(key: string): Promise<{ success: boolean; message: string }> {
    const cleanKey = key.trim().toUpperCase();
    const machineId = await this.getMachineId();
    const validation = this.validateLicenseKey(cleanKey, machineId);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.reason || 'Введён неверный лицензионный ключ Pro-версии.',
      };
    }

    await this.getLicenseStatus(true);
    const firstLaunch = this.rawFirstLaunch || Date.now();

    const record: StoredLicenseData = {
      machineId,
      firstLaunch,
      lastSeen: Date.now(),
      signature: this.sign(machineId, firstLaunch),
      licenseKey: cleanKey,
    };

    await this.writeToRegistry(record);
    this.writeToFile(this.backupFilePath, record);
    this.writeToFile(this.userDataFilePath, record);

    this.cachedStatus = null;
    await this.getLicenseStatus(true);

    return { success: true, message: 'Лицензия Syncra Pro успешно активирована для этого устройства!' };
  }
}
