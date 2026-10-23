import React, { useState, useEffect, useRef } from 'react';
import { X, Server, Key, Lock, Globe, ShieldCheck, CheckCircle2, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { S3Profile } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: S3Profile) => Promise<boolean>;
  initialProfile?: S3Profile | null;
  isElectron?: boolean;
  allowedUrls?: string[];
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
  isElectron = true,
  allowedUrls = [],
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const defaultEndpoint = !isElectron && allowedUrls.length > 0 ? allowedUrls[0] : 'http://localhost:9000';
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [region, setRegion] = useState('us-east-1');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [useSSL, setUseSSL] = useState(false);
  const [forcePathStyle, setForcePathStyle] = useState(true);
  const [permissionRole, setPermissionRole] = useState<'auto' | 'admin' | 'readwrite' | 'readonly'>('auto');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 50);
    }
    if (initialProfile) {
      setName(initialProfile.name);
      // In web mode, ensure endpoint is in allowedUrls if possible
      if (!isElectron && allowedUrls.length > 0 && !allowedUrls.includes(initialProfile.endpoint)) {
        setEndpoint(allowedUrls[0]);
      } else {
        setEndpoint(initialProfile.endpoint);
      }
      setRegion(initialProfile.region);
      setAccessKey(initialProfile.accessKey);
      setSecretKey(initialProfile.secretKey);
      setUseSSL(initialProfile.useSSL);
      setForcePathStyle(initialProfile.forcePathStyle);
      setPermissionRole(initialProfile.permissionRole || 'auto');
    } else {
      setName('');
      setEndpoint(!isElectron && allowedUrls.length > 0 ? allowedUrls[0] : 'http://localhost:9000');
      setRegion('us-east-1');
      setAccessKey('');
      setSecretKey('');
      setUseSSL(false);
      setForcePathStyle(true);
      setPermissionRole('auto');
    }
    setTestResult(null);
    setError(null);
  }, [initialProfile, isOpen, isElectron, allowedUrls]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving && !testing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, testing, onClose]);

  if (!isOpen) return null;

  const currentProfileData: S3Profile = {
    id: initialProfile?.id || `profile_${Date.now()}`,
    name: name.trim() || 'MinIO Server',
    endpoint: endpoint.trim(),
    region: region.trim() || 'us-east-1',
    accessKey: accessKey.trim(),
    secretKey: secretKey.trim(),
    useSSL,
    forcePathStyle,
    permissionRole,
    createdAt: initialProfile?.createdAt || Date.now(),
  };

  const handleTestConnection = async () => {
    if (!endpoint || !accessKey || !secretKey) {
      setError(t('profile.errKeys'));
      return;
    }
    setError(null);
    setTesting(true);
    setTestResult(null);

    try {
      const res = await window.electronAPI.profiles.test(currentProfileData);
      if (res.success) {
        setTestResult({
          success: true,
          message: t('profile.testSuccess', { count: res.bucketsCount ?? 0 }),
        });
      } else {
        setTestResult({
          success: false,
          message: res.message || t('profile.testFailed'),
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || t('profile.testFailed'),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('profile.errName'));
      return;
    }
    if (!endpoint.trim()) {
      setError(t('profile.errEndpoint'));
      return;
    }
    if (!isElectron) {
      if (!allowedUrls || allowedUrls.length === 0) {
        setError(t('profile.errNoAllowedUrls'));
        return;
      }
      const clean = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '');
      const isAllowed = allowedUrls.some((u) => clean(u) === clean(endpoint));
      if (!isAllowed) {
        setError(t('profile.errWhitelist'));
        return;
      }
    }
    if (!accessKey.trim() || !secretKey.trim()) {
      setError(t('profile.errKeys'));
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const success = await onSave(currentProfileData);
      if (success) {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения профиля');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-plane-surface border border-border rounded-lg w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-foreground">
        {/* Shadcn Dialog Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {initialProfile ? t('profile.titleEdit') : t('profile.titleNew')}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {t('profile.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dialog Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-md flex items-start space-x-2 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('profile.name')}
            </label>
            <input
              ref={nameInputRef}
              type="text"
              placeholder={t('profile.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-border select-text transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-foreground">
                  {t('profile.endpoint')}
                </label>
                {!isElectron && (
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {t('profile.webWhitelistBadge')}
                  </span>
                )}
              </div>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5 z-10" />
                {!isElectron ? (
                  allowedUrls.length > 0 ? (
                    <div className="relative">
                      <select
                        value={endpoint}
                        onChange={(e) => setEndpoint(e.target.value)}
                        className="w-full bg-background border border-border rounded-md pl-9 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-border transition-all font-mono cursor-pointer appearance-none"
                      >
                        {allowedUrls.map((url) => (
                          <option key={url} value={url}>
                            {url}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  ) : (
                    <div className="p-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                      {t('profile.webNoUrls')}
                    </div>
                  )
                ) : (
                  <input
                    type="text"
                    placeholder="http://localhost:9000"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-border select-text transition-all font-mono"
                    required
                  />
                )}
              </div>
              {!isElectron && allowedUrls.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('profile.webRestrictedHint')}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                {t('profile.region')}
              </label>
              <input
                type="text"
                placeholder="us-east-1"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-border select-text transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('profile.accessKey')}
            </label>
            <div className="relative">
              <Key className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="minioadmin"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-border select-text transition-all font-mono"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('profile.secretKey')}
            </label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-border select-text transition-all font-mono"
                required
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="pt-2 border-t border-border space-y-2">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={forcePathStyle}
                onChange={(e) => setForcePathStyle(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary bg-background focus:ring-0"
              />
              <span className="text-xs text-foreground/90">
                {t('profile.pathStyle')}
              </span>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useSSL}
                onChange={(e) => setUseSSL(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary bg-background focus:ring-0"
              />
              <span className="text-xs text-foreground/90">{t('profile.useSsl')}</span>
            </label>
          </div>

          {/* Permission Mode Setting */}
          <div className="pt-2 border-t border-border space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              {t('profile.permissionsRole')}
            </label>
            <select
              value={permissionRole}
              onChange={(e) => setPermissionRole(e.target.value as any)}
              className="w-full bg-plane-surface border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="auto">{t('profile.roleAuto')}</option>
              <option value="admin">{t('profile.roleAdmin')}</option>
              <option value="readwrite">{t('profile.roleReadWrite')}</option>
              <option value="readonly">{t('profile.roleReadOnly')}</option>
            </select>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {t('profile.roleNotice')}
            </p>
          </div>

          {/* Test connection status badge */}
          {testResult && (
            <div
              className={`p-2.5 rounded-md text-xs flex items-center space-x-2 ${
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-destructive/10 border border-destructive/20 text-destructive'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="truncate">{testResult.message}</span>
            </div>
          )}

          {/* Shadcn Dialog Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors border border-border disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              )}
              <span>{t('profile.testPing')}</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-foreground border border-border bg-transparent hover:bg-muted rounded-md transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-3.5 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary-hover rounded-md transition-colors shadow-xs disabled:opacity-50"
              >
                {isSaving ? t('profile.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
