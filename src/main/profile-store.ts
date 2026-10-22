import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { S3Profile } from '../common/types';

export class ProfileStore {
  private filePath: string;
  private activeProfileIdFile: string;

  constructor() {
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
      fs.mkdirSync(userData, { recursive: true });
    }
    this.filePath = path.join(userData, 's3_profiles.json');
    this.activeProfileIdFile = path.join(userData, 's3_active_profile.txt');
  }

  public getProfiles(): S3Profile[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to read profiles:', err);
    }
    return [];
  }

  public saveProfile(profile: S3Profile, isPro: boolean = true): { success: boolean; error?: string } {
    const profiles = this.getProfiles();
    const existingIndex = profiles.findIndex((p) => p.id === profile.id);

    // Enforce max 3 profiles in Community edition if creating new and not Pro
    if (!isPro && existingIndex === -1 && profiles.length >= 3) {
      return {
        success: false,
        error: 'В Community Edition поддерживается до 3 профилей подключения. Активируйте Pro для неограниченного числа подключений.',
      };
    }

    if (existingIndex >= 0) {
      profiles[existingIndex] = profile;
    } else {
      profiles.push(profile);
    }

    try {
      fs.writeFileSync(this.filePath, JSON.stringify(profiles, null, 2), 'utf-8');
      if (profiles.length === 1) {
        this.setActiveProfileId(profile.id);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public deleteProfile(id: string): boolean {
    let profiles = this.getProfiles();
    profiles = profiles.filter((p) => p.id !== id);
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(profiles, null, 2), 'utf-8');
      if (this.getActiveProfileId() === id) {
        this.setActiveProfileId(profiles.length > 0 ? profiles[0].id : '');
      }
      return true;
    } catch (err) {
      console.error('Failed to delete profile:', err);
      return false;
    }
  }

  public getActiveProfileId(): string {
    try {
      if (fs.existsSync(this.activeProfileIdFile)) {
        return fs.readFileSync(this.activeProfileIdFile, 'utf-8').trim();
      }
    } catch (err) {
      console.error('Failed to read active profile id:', err);
    }
    return '';
  }

  public setActiveProfileId(id: string): void {
    try {
      fs.writeFileSync(this.activeProfileIdFile, id, 'utf-8');
    } catch (err) {
      console.error('Failed to set active profile id:', err);
    }
  }
}
