import crypto from 'crypto';
import os from 'os';
import si from 'systeminformation';

export const LICENSE_SALT =
  process.env.SYNCRA_LICENSE_SALT || 'syncra_pro_license_secure_salt_hmac_v2_2026';

export const MASTER_DEVELOPER_KEY =
  process.env.SYNCRA_DEV_MASTER_KEY || (process.env.NODE_ENV === 'development' ? 'PRO-2026-STUDIO-MINIO-FULL' : '');

export interface HardwareDetails {
  cpuBrand: string;
  baseboardSerial: string;
  systemUuid: string;
  firstDiskSerial: string;
  osSerial: string;
  formulaString: string;
  hwid: string; // 32 lowercase hex characters
}

let cachedDetails: HardwareDetails | null = null;

/**
 * Checks if a string is empty or contains placeholder dummy values returned by some BIOS/VMs
 */
function isGenericPlaceholder(val: string): boolean {
  if (!val) return true;
  const clean = val.trim().toLowerCase();
  if (!clean) return true;
  const placeholders = [
    'none',
    'unknown',
    'default string',
    'to be filled by o.e.m.',
    'to be filled by oem',
    'o.e.m.',
    'oem',
    '0',
    '00000000',
    '-',
    'not applicable',
    'system serial number',
    'chassis serial number',
  ];
  return placeholders.includes(clean);
}

/**
 * Gathers hardware information across Ubuntu, macOS, and Windows
 * and calculates the exact HWID according to the algorithm:
 * 1. Gather CPU brand and Baseboard serial (with fallbacks for BIOS UUID / Disk / OS serial)
 * 2. Formula string: `${primarySerial}-${cpuBrand}`
 * 3. SHA-256 hash of formula string -> first 32 characters in lowercase hex
 */
export async function getHardwareDetails(): Promise<HardwareDetails> {
  if (cachedDetails) {
    return cachedDetails;
  }

  try {
    const [cpu, bb, sys, disks, osi] = await Promise.all([
      si.cpu().catch(() => ({} as any)),
      si.baseboard().catch(() => ({} as any)),
      si.system().catch(() => ({} as any)),
      si.diskLayout().catch(() => [] as any[]),
      si.osInfo().catch(() => ({} as any)),
    ]);

    // 1. CPU Brand (si.cpu().brand formats Intel/AMD/Apple Silicon cleanly)
    let cpuBrand = (cpu?.brand || '').trim();
    if (!cpuBrand) {
      const osCpus = os.cpus();
      cpuBrand = (osCpus && osCpus[0]?.model ? osCpus[0].model : 'Standard CPU').trim();
    }

    // 2. Hardware serials
    const baseboardSerial = (bb?.serial || '').trim();
    const systemUuid = (sys?.uuid || '').trim();
    const firstDiskSerial = (disks && disks[0]?.serialNum ? disks[0].serialNum : '').trim();
    const osSerial = (osi?.serial || '').trim();

    // 3. Determine primary hardware identifier:
    // Prefer baseboard serial if valid; otherwise fallback to systemUuid -> firstDiskSerial -> osSerial -> hostname
    let primarySerial = baseboardSerial;
    if (isGenericPlaceholder(primarySerial)) {
      if (!isGenericPlaceholder(systemUuid)) {
        primarySerial = systemUuid;
      } else if (!isGenericPlaceholder(firstDiskSerial)) {
        primarySerial = firstDiskSerial;
      } else if (!isGenericPlaceholder(osSerial)) {
        primarySerial = osSerial;
      } else {
        primarySerial = `${os.hostname()}-${os.platform()}`;
      }
    }

    // 4. Formula string: {primarySerial}-{cpuBrand}
    const formulaString = `${primarySerial}-${cpuBrand}`;

    // 5. Final HWID: First 32 characters of SHA-256 hash
    const hwid = crypto
      .createHash('sha256')
      .update(formulaString)
      .digest('hex')
      .substring(0, 32)
      .toLowerCase();

    cachedDetails = {
      cpuBrand,
      baseboardSerial,
      systemUuid,
      firstDiskSerial,
      osSerial,
      formulaString,
      hwid,
    };

    return cachedDetails;
  } catch (err) {
    // Ultimate fallback if system calls fail
    const fallbackFormula = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || 'cpu'}`;
    const hwid = crypto
      .createHash('sha256')
      .update(fallbackFormula)
      .digest('hex')
      .substring(0, 32)
      .toLowerCase();

    cachedDetails = {
      cpuBrand: os.cpus()[0]?.model || 'Generic CPU',
      baseboardSerial: '',
      systemUuid: '',
      firstDiskSerial: '',
      osSerial: '',
      formulaString: fallbackFormula,
      hwid,
    };

    return cachedDetails;
  }
}

/**
 * Returns current machine HWID (32 hex characters)
 */
export async function getMachineHwid(): Promise<string> {
  const details = await getHardwareDetails();
  return details.hwid;
}

/**
 * Generates a bound license key for a given Machine ID
 * Key format: PRO-XXXX-XXXX-YYYY-YYYY-YYYY (or SYNCRA-XXXX-XXXX-YYYY-YYYY-YYYY)
 * - XXXX-XXXX: First 8 characters of Machine ID (in uppercase)
 * - YYYY-YYYY-YYYY: 12-character HMAC-SHA256 signature of the full 32-character Machine ID
 */
export function generateLicenseKey(
  machineId: string,
  options: { prefix?: 'PRO' | 'SYNCRA'; wildcard?: boolean } = {}
): string {
  const prefix = options.prefix || 'PRO';

  if (options.wildcard) {
    // Wildcard key (not tied to a specific Machine ID, e.g. for enterprise site license)
    const payload = 'ENTERPRISE-SITE-WILDCARD-UNLIMITED';
    const sig = crypto
      .createHmac('sha256', LICENSE_SALT)
      .update(payload)
      .digest('hex')
      .toUpperCase()
      .substring(0, 12);

    return `${prefix}-SITE-CORP-${sig.substring(0, 4)}-${sig.substring(4, 8)}-${sig.substring(8, 12)}`;
  }

  const cleanId = machineId.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  if (cleanId.length !== 32) {
    throw new Error(`Machine ID must be exactly 32 hex characters (received: ${cleanId.length})`);
  }

  const hwidPart1 = cleanId.substring(0, 4).toUpperCase();
  const hwidPart2 = cleanId.substring(4, 8).toUpperCase();

  const signature = crypto
    .createHmac('sha256', LICENSE_SALT)
    .update(cleanId)
    .digest('hex')
    .toUpperCase();

  const sigPart1 = signature.substring(0, 4);
  const sigPart2 = signature.substring(4, 8);
  const sigPart3 = signature.substring(8, 12);

  return `${prefix}-${hwidPart1}-${hwidPart2}-${sigPart1}-${sigPart2}-${sigPart3}`;
}

/**
 * Validates whether a license key is valid for the given Machine ID.
 */
export function validateLicenseKeyForHwid(
  key: string,
  currentMachineId: string
): {
  valid: boolean;
  isMaster?: boolean;
  isWildcard?: boolean;
  reason?: string;
} {
  const cleanKey = key.trim().toUpperCase();

  // 1. Master developer demo key
  if (cleanKey === MASTER_DEVELOPER_KEY) {
    return { valid: true, isMaster: true };
  }

  const cleanCurrentId = currentMachineId.trim().toLowerCase().replace(/[^a-f0-9]/g, '');

  // 2. Normalize key into segments (separated by dashes)
  const parts = cleanKey.split('-').map((p) => p.trim());

  // Check prefix
  if (parts.length !== 6 || (parts[0] !== 'PRO' && parts[0] !== 'SYNCRA')) {
    // Check legacy 5-segment key or invalid format
    return {
      valid: false,
      reason: 'Неверный формат лицензионного ключа. Ожидается формат: PRO-XXXX-XXXX-XXXX-XXXX-XXXX',
    };
  }

  // 3. Check Wildcard site license: PRO-SITE-CORP-XXXX-XXXX-XXXX
  if (parts[1] === 'SITE' && parts[2] === 'CORP') {
    const payload = 'ENTERPRISE-SITE-WILDCARD-UNLIMITED';
    const expectedSig = crypto
      .createHmac('sha256', LICENSE_SALT)
      .update(payload)
      .digest('hex')
      .toUpperCase()
      .substring(0, 12);

    const providedSig = parts[3] + parts[4] + parts[5];
    if (providedSig === expectedSig) {
      return { valid: true, isWildcard: true };
    }
    return { valid: false, reason: 'Недействительная подпись корпоративного ключа' };
  }

  // 4. Bound license key: PRO-<HWID_1>-<HWID_2>-<SIG_1>-<SIG_2>-<SIG_3>
  const keyHwidPrefix = (parts[1] + parts[2]).toLowerCase();
  const currentHwidPrefix = cleanCurrentId.substring(0, 8);

  if (keyHwidPrefix !== currentHwidPrefix) {
    return {
      valid: false,
      reason: `Данный лицензионный ключ привязан к другому устройству (ID ключа: ${keyHwidPrefix.toUpperCase()}..., ID текущего ПК: ${currentHwidPrefix.toUpperCase()}...).`,
    };
  }

  // Verify HMAC signature of the full 32-character HWID
  const expectedSignature = crypto
    .createHmac('sha256', LICENSE_SALT)
    .update(cleanCurrentId)
    .digest('hex')
    .toUpperCase();

  const expectedSig12 = expectedSignature.substring(0, 12);
  const providedSig12 = parts[3] + parts[4] + parts[5];

  if (providedSig12 !== expectedSig12) {
    return {
      valid: false,
      reason: 'Неверная криптографическая подпись лицензионного ключа.',
    };
  }

  return { valid: true };
}
