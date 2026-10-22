import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Sun,
  Moon,
  Laptop,
  Check,
  Cpu,
  Sparkles,
  HardDrive,
  RefreshCw,
  Zap,
  Globe,
  Play,
  Square,
  ExternalLink,
  Copy,
  Wifi,
  Smartphone,
  Tablet,
  Monitor,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Shuffle,
  ArrowDownToLine,
  Server,
  Languages,
} from 'lucide-react';
import { AppSettings, WebServerStatus, ConnectedDevice, WebServerConfig, S3Profile, LicenseStatus } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import syncraLogo from '../assets/logo.png';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  isProActive: boolean;
  licenseStatus?: LicenseStatus | null;
  onTogglePro: () => void;
  isElectron?: boolean;
  webServerStatus?: WebServerStatus | null;
  onRefreshWebServerStatus?: () => Promise<void>;
  profiles?: S3Profile[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isProActive,
  licenseStatus,
  onTogglePro,
  isElectron = true,
  webServerStatus,
  onRefreshWebServerStatus,
  profiles = [],
}) => {
  const { t, language, setLanguage } = useTranslation();
  const [activeTab, setActiveTab] = useState<'appearance' | 'transfers' | 'webserver' | 'about'>('appearance');
  const [theme, setTheme] = useState(settings.theme);
  const [transferConcurrency, setTransferConcurrency] = useState(settings.transferConcurrency);
  const [thumbnailConcurrency, setThumbnailConcurrency] = useState(settings.thumbnailConcurrency);
  const [multipartChunkSizeMB, setMultipartChunkSizeMB] = useState(settings.multipartChunkSizeMB);
  const [autoSaveOnEditInPlace, setAutoSaveOnEditInPlace] = useState(settings.autoSaveOnEditInPlace);
  const [savedBadge, setSavedBadge] = useState(false);

  // Web Server State inside Settings
  const [webServerAutoStart, setWebServerAutoStart] = useState<boolean>(
    Boolean(settings.webServerAutoStart)
  );
  const [webServerPortInput, setWebServerPortInput] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('s3_webserver_port');
      if (saved) return saved;
    } catch {}
    return String(settings.webServerPort || webServerStatus?.port || 8080);
  });
  const [webServerLoading, setWebServerLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [webServerError, setWebServerError] = useState<string | null>(null);

  // Web Server Security & Whitelist & Device tracking State
  const [pinProtected, setPinProtected] = useState<boolean>(false);
  const [pinCode, setPinCode] = useState<string>('123456');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [allowedUrls, setAllowedUrls] = useState<string[]>(['http://localhost:9000']);
  const [newUrlInput, setNewUrlInput] = useState<string>('');
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState<boolean>(false);

  const isWebServerRunning = Boolean(webServerStatus?.running);

  // Synchronize port when server is running
  useEffect(() => {
    if (webServerStatus?.running && webServerStatus.port) {
      setWebServerPortInput(String(webServerStatus.port));
    }
  }, [webServerStatus?.running, webServerStatus?.port]);

  // Synchronize status changes
  useEffect(() => {
    if (webServerStatus?.devices) {
      setDevices(webServerStatus.devices);
    }
    if (webServerStatus?.pinProtected !== undefined) {
      setPinProtected(webServerStatus.pinProtected);
    }
    if (webServerStatus?.pin) {
      setPinCode(webServerStatus.pin);
    }
    if (webServerStatus?.allowedUrls) {
      setAllowedUrls(webServerStatus.allowedUrls);
    }
  }, [webServerStatus]);

  const loadDevices = async () => {
    if (window.electronAPI?.webServer?.getDevices) {
      setDevicesLoading(true);
      try {
        const devs = await window.electronAPI.webServer.getDevices();
        setDevices(devs || []);
      } catch (err) {
        console.error('Failed to get devices:', err);
      } finally {
        setDevicesLoading(false);
      }
    }
  };

  const loadWebServerFullConfig = async () => {
    if (window.electronAPI?.webServer?.getConfig) {
      try {
        const cfg = await window.electronAPI.webServer.getConfig();
        if (cfg) {
          setWebServerAutoStart(Boolean(cfg.autoStart));
          if (!webServerStatus?.running && cfg.port) {
            setWebServerPortInput(String(cfg.port));
          }
          setPinProtected(Boolean(cfg.pinProtected));
          setPinCode(cfg.pin || '123456');
          setAllowedUrls(cfg.allowedUrls || ['http://localhost:9000']);
        }
      } catch (err) {
        console.error('Failed to load webserver config:', err);
      }
    }
    loadDevices();
  };

  // Load configuration from main process on open
  useEffect(() => {
    if (!isOpen) return;
    loadWebServerFullConfig();
  }, [isOpen, webServerStatus?.running]);

  useEffect(() => {
    if (isOpen) {
      setTheme(settings.theme);
      setTransferConcurrency(settings.transferConcurrency);
      setThumbnailConcurrency(settings.thumbnailConcurrency);
      setMultipartChunkSizeMB(settings.multipartChunkSizeMB);
      setAutoSaveOnEditInPlace(settings.autoSaveOnEditInPlace);
      setWebServerAutoStart(Boolean(settings.webServerAutoStart));
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleConcurrencyChange = (val: number) => {
    const clamped = Math.max(1, Math.min(32, val));
    setTransferConcurrency(clamped);
    onUpdateSettings({
      ...settings,
      theme,
      transferConcurrency: clamped,
      thumbnailConcurrency,
      multipartChunkSizeMB,
      autoSaveOnEditInPlace,
      webServerAutoStart,
      webServerPort: parseInt(webServerPortInput.trim(), 10) || 8080,
    });
  };

  const handleWebServerPortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 5);
    setWebServerPortInput(cleaned);
    setWebServerError(null);
    if (cleaned) {
      try {
        localStorage.setItem('s3_webserver_port', cleaned);
      } catch {}
    }
  };

  const handleSelectPresetPort = (preset: number) => {
    if (isWebServerRunning) return;
    const str = String(preset);
    setWebServerPortInput(str);
    setWebServerError(null);
    try {
      localStorage.setItem('s3_webserver_port', str);
    } catch {}
  };

  const saveWebConfig = async (patch: Partial<WebServerConfig>) => {
    if (window.electronAPI?.webServer?.saveConfig) {
      try {
        const port = parseInt(webServerPortInput.trim(), 10) || 8080;
        await window.electronAPI.webServer.saveConfig({
          autoStart: webServerAutoStart,
          port,
          pinProtected,
          pin: pinCode,
          allowedUrls,
          ...patch,
        });
        if (onRefreshWebServerStatus) {
          await onRefreshWebServerStatus();
        }
      } catch (err) {
        console.error('Failed to save webserver config:', err);
      }
    }
  };

  const handleToggleAutoStart = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setWebServerAutoStart(val);
    const port = parseInt(webServerPortInput.trim(), 10) || 8080;
    saveWebConfig({ autoStart: val, port });
  };

  const handleTogglePinProtected = (checked: boolean) => {
    setPinProtected(checked);
    saveWebConfig({ pinProtected: checked, pin: pinCode });
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPinCode(val);
    if (val.length === 6) {
      saveWebConfig({ pin: val });
    }
  };

  const handleGeneratePin = () => {
    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    setPinCode(generated);
    saveWebConfig({ pin: generated });
  };

  const handleAddUrl = () => {
    let clean = newUrlInput.trim();
    if (!clean) return;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    clean = clean.replace(/\/+$/, '');
    if (!allowedUrls.includes(clean)) {
      const updated = [...allowedUrls, clean];
      setAllowedUrls(updated);
      saveWebConfig({ allowedUrls: updated });
    }
    setNewUrlInput('');
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    const updated = allowedUrls.filter((u) => u !== urlToRemove);
    setAllowedUrls(updated);
    saveWebConfig({ allowedUrls: updated });
  };

  const handleImportFromProfiles = () => {
    if (!profiles || profiles.length === 0) return;
    const endpoints = profiles
      .map((p) => p.endpoint?.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    const set = new Set([...allowedUrls, ...endpoints]);
    const updated = Array.from(set);
    setAllowedUrls(updated);
    saveWebConfig({ allowedUrls: updated });
  };

  const handleForgetDevice = async (deviceId: string) => {
    if (window.electronAPI?.webServer?.forgetDevice) {
      await window.electronAPI.webServer.forgetDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    }
  };

  const handleClearDevices = async () => {
    if (window.electronAPI?.webServer?.clearDevices) {
      await window.electronAPI.webServer.clearDevices();
      setDevices([]);
    }
  };

  const handleToggleWebServer = async () => {
    setWebServerLoading(true);
    setWebServerError(null);
    try {
      if (isWebServerRunning) {
        await window.electronAPI?.webServer?.stop();
      } else {
        const port = parseInt(webServerPortInput.trim(), 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          setWebServerError('Укажите корректный номер порта от 1 до 65535 (например, 8080 или 3000)');
          setWebServerLoading(false);
          return;
        }
        try {
          localStorage.setItem('s3_webserver_port', String(port));
        } catch {}

        const res = await window.electronAPI?.webServer?.start(port);
        if (res && !res.success && res.error) {
          setWebServerError(res.error);
        }
      }
      if (onRefreshWebServerStatus) {
        await onRefreshWebServerStatus();
      }
    } catch (err: any) {
      setWebServerError(err.message || 'Ошибка управления Web-сервером');
    } finally {
      setWebServerLoading(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleOpenBrowser = (url?: string) => {
    if (window.electronAPI?.webServer?.openInBrowser) {
      window.electronAPI.webServer.openInBrowser(url);
    } else if (url) {
      window.open(url, '_blank');
    }
  };

  const handleSave = () => {
    const portNum = parseInt(webServerPortInput.trim(), 10) || 8080;
    if (window.electronAPI?.webServer?.saveConfig) {
      window.electronAPI.webServer.saveConfig({
        autoStart: webServerAutoStart,
        port: portNum,
        pinProtected,
        pin: pinCode,
        allowedUrls,
      }).catch(() => {});
    }
    const updated: AppSettings = {
      theme,
      language,
      transferConcurrency,
      thumbnailConcurrency,
      multipartChunkSizeMB,
      autoSaveOnEditInPlace,
      webServerAutoStart,
      webServerPort: portNum,
    };
    onUpdateSettings(updated);
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in text-foreground">
      <div className="bg-plane-surface border border-border rounded-xl w-full max-w-3xl max-h-[92vh] sm:h-[620px] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-3.5 border-b border-border/80 bg-plane-surface flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">{t('settings.title')}</h2>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                {t('settings.subtitle')}
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

        {/* Modal Content with Tabs Sidebar */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Inner Left Nav Tabs */}
          <div className="w-full sm:w-48 bg-muted/20 border-b sm:border-b-0 sm:border-r border-border p-1.5 sm:p-2 flex sm:flex-col space-x-1 sm:space-x-0 sm:space-y-1 overflow-x-auto select-none flex-shrink-0 no-scrollbar">
            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center space-x-2 px-3 py-1.5 sm:py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 text-left ${
                activeTab === 'appearance'
                  ? 'bg-accent text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Sun className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{t('settings.tabAppearance')}</span>
            </button>

            <button
              onClick={() => setActiveTab('transfers')}
              className={`flex items-center space-x-2 px-3 py-1.5 sm:py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 text-left ${
                activeTab === 'transfers'
                  ? 'bg-accent text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{t('settings.tabTransfers')}</span>
            </button>

            {isElectron !== false && (
              <button
                onClick={() => setActiveTab('webserver')}
                className={`flex items-center space-x-2 px-3 py-1.5 sm:py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 text-left ${
                  activeTab === 'webserver'
                    ? 'bg-accent text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                  {isWebServerRunning && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </div>
                <span>{t('settings.tabWebserver')}</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('about')}
              className={`flex items-center space-x-2 px-3 py-1.5 sm:py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 text-left ${
                activeTab === 'about'
                  ? 'bg-accent text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>{t('settings.tabAbout')}</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
            {/* 1. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                {/* Language Selection Card */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Languages className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-semibold text-foreground">{t('settings.langTitle')}</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    {t('settings.langDesc')}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Russian */}
                    <div
                      onClick={() => setLanguage('ru')}
                      className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                        language === 'ru'
                          ? 'bg-primary/10 border-primary ring-1 ring-primary/40 shadow-xs'
                          : 'bg-background border-border hover:border-border/80 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-base select-none leading-none">🇷🇺</span>
                          <span className="text-xs font-semibold text-foreground">{t('settings.langRu')}</span>
                        </div>
                        {language === 'ru' && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Русский язык интерфейса
                      </p>
                    </div>

                    {/* English */}
                    <div
                      onClick={() => setLanguage('en')}
                      className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                        language === 'en'
                          ? 'bg-primary/10 border-primary ring-1 ring-primary/40 shadow-xs'
                          : 'bg-background border-border hover:border-border/80 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-base select-none leading-none">🇬🇧</span>
                          <span className="text-xs font-semibold text-foreground">{t('settings.langEn')}</span>
                        </div>
                        {language === 'en' && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        English interface language
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <h3 className="text-xs font-semibold text-foreground mb-1">{t('settings.themeTitle')}</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    {t('settings.themeDesc')}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Dark Theme Card */}
                    <div
                      onClick={() => setTheme('dark')}
                      className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                        theme === 'dark'
                          ? 'bg-primary/10 border-primary ring-1 ring-primary/40 shadow-xs'
                          : 'bg-background border-border hover:border-border/80 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Moon className="w-4 h-4 text-primary" />
                          <span className="text-xs font-semibold text-foreground">{t('settings.themeDark')}</span>
                        </div>
                        {theme === 'dark' && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <div className="h-10 rounded bg-[#0c0c0e] border border-zinc-800 p-1 flex items-center space-x-1">
                        <div className="w-2 h-full rounded bg-zinc-800" />
                        <div className="flex-1 h-full rounded bg-zinc-900 border border-zinc-800" />
                      </div>
                    </div>

                    {/* Light Theme Card */}
                    <div
                      onClick={() => setTheme('light')}
                      className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                        theme === 'light'
                          ? 'bg-primary/10 border-primary ring-1 ring-primary/40 shadow-xs'
                          : 'bg-background border-border hover:border-border/80 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Sun className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-semibold text-foreground">{t('settings.themeLight')}</span>
                        </div>
                        {theme === 'light' && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      <div className="h-10 rounded bg-white border border-zinc-200 p-1 flex items-center space-x-1">
                        <div className="w-2 h-full rounded bg-zinc-100" />
                        <div className="flex-1 h-full rounded bg-zinc-50 border border-zinc-200" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <h3 className="text-xs font-semibold text-foreground mb-1">{t('settings.styleTitle')}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.styleDesc')}
                  </p>
                </div>
              </div>
            )}

            {/* 2. TRANSFERS & PERFORMANCE TAB */}
            {activeTab === 'transfers' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        {t('settings.concurrencyTitle')}
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        {t('settings.concurrencyDesc')}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      {transferConcurrency} {transferConcurrency === 1 ? t('settings.thread') : t('settings.threads')}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={transferConcurrency}
                    onChange={(e) => handleConcurrencyChange(parseInt(e.target.value, 10))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1 font-mono">
                    <span>{t('settings.slowNet')}</span>
                    <span>{t('settings.recommended')}</span>
                    <span>8</span>
                    <span>{t('settings.fastNet')}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        {t('settings.thumbnailTitle')}
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        {t('settings.thumbnailDesc')}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      {thumbnailConcurrency} {t('settings.threads')}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={thumbnailConcurrency}
                    onChange={(e) => setThumbnailConcurrency(parseInt(e.target.value, 10))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                </div>

                <div className="pt-4 border-t border-border">
                  <h3 className="text-xs font-semibold text-foreground mb-1">
                    {t('settings.chunkSizeTitle')}
                  </h3>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {[5, 10, 25, 50].map((mb) => (
                      <button
                        key={mb}
                        type="button"
                        onClick={() => setMultipartChunkSizeMB(mb)}
                        className={`py-1.5 text-xs font-mono font-medium rounded-md border transition-colors ${
                          multipartChunkSizeMB === mb
                            ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                            : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {mb} MB
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSaveOnEditInPlace}
                      onChange={(e) => setAutoSaveOnEditInPlace(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-border text-primary bg-background focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-medium text-foreground block">
                        {t('settings.autoSaveTitle')}
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        {t('settings.autoSaveDesc')}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* 3. WEB SERVER TAB */}
            {activeTab === 'webserver' && (
              <div className="space-y-5">
                {/* Server Status Control Card */}
                <div className="p-4 rounded-xl border border-border bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center space-x-3.5">
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                        isWebServerRunning
                          ? 'bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20'
                          : 'bg-muted-foreground/40'
                      }`}
                    />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-foreground">
                          {isWebServerRunning ? t('settings.webRunning') : t('settings.webStopped')}
                        </span>
                        {isWebServerRunning && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {t('settings.portInput')} {webServerStatus?.port}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isWebServerRunning
                          ? t('settings.webRunningDesc')
                          : t('settings.webStoppedDesc')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2.5 flex-shrink-0 self-end sm:self-auto">
                    {!isWebServerRunning && (
                      <div className="flex items-center space-x-1.5 bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border focus-within:border-primary transition-colors">
                        <span className="text-[11px] text-muted-foreground font-medium select-none">
                          {t('settings.portInput')}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="8080"
                          value={webServerPortInput}
                          onChange={handleWebServerPortChange}
                          className="w-16 bg-transparent text-xs font-mono font-bold text-foreground text-center focus:outline-none placeholder:text-muted-foreground/40"
                          title="Port number (e.g., 8080, 3000, 8000)"
                        />
                      </div>
                    )}

                    <button
                      onClick={handleToggleWebServer}
                      disabled={webServerLoading || (!isWebServerRunning && !webServerPortInput.trim())}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-2 transition-all ${
                        isWebServerRunning
                          ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
                          : 'bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50'
                      }`}
                    >
                      {webServerLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : isWebServerRunning ? (
                        <Square className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>{isWebServerRunning ? t('settings.stop') : t('settings.start')}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Preset Port Pills */}
                {!isWebServerRunning && (
                  <div className="flex items-center space-x-2 text-[11px] text-muted-foreground -mt-2 px-1">
                    <span>{t('settings.quickPort')}</span>
                    {[8080, 3000, 8000, 9090].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleSelectPresetPort(preset)}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                          webServerPortInput === String(preset)
                            ? 'bg-primary/10 text-primary border-primary/30 font-bold'
                            : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}

                {/* Auto-start setting card */}
                <div className="p-3.5 rounded-xl border border-border bg-background/60 shadow-2xs">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webServerAutoStart}
                      onChange={handleToggleAutoStart}
                      className="w-4 h-4 mt-0.5 rounded border-border text-primary bg-background focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-semibold text-foreground block">
                        {t('settings.autoStartTitle')}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-0.5 leading-relaxed">
                        {t('settings.autoStartDesc')}
                      </span>
                    </div>
                  </label>
                </div>

                {webServerError && (
                  <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{webServerError}</span>
                  </div>
                )}

                {/* Active Network URLs List */}
                {isWebServerRunning && webServerStatus && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                      <Wifi className="w-3.5 h-3.5 text-primary" />
                      <span>{t('settings.webLinksTitle')}</span>
                    </h4>

                    <div className="space-y-2">
                      {webServerStatus.networkUrls.map((url) => {
                        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
                        return (
                          <div
                            key={url}
                            className="p-3 rounded-lg border border-border bg-background/70 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                              <div className="p-1.5 rounded-md bg-muted text-muted-foreground flex-shrink-0">
                                {isLocal ? <Laptop className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                              </div>
                              <div className="truncate">
                                <span className="font-mono font-medium text-foreground text-xs select-all">
                                  {url}
                                </span>
                                <span className="text-[10px] text-muted-foreground block">
                                  {isLocal
                                    ? t('settings.webLinkLocal')
                                    : t('settings.webLinkLan')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-1.5 flex-shrink-0">
                              <button
                                onClick={() => handleCopyUrl(url)}
                                className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title={t('settings.copyUrl')}
                              >
                                {copiedUrl === url ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => handleOpenBrowser(url)}
                                className="px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors flex items-center space-x-1"
                                title={t('settings.openInBrowser')}
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="hidden sm:inline">{t('settings.openInBrowser')}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 1. PIN Security Protection */}
                <div className="p-4 rounded-xl border border-border bg-background shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-foreground">
                            {t('settings.pinTitle')}
                          </span>
                          {pinProtected ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {t('settings.pinEnabled')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                              {t('settings.pinDisabled')}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground block mt-0.5">
                          {t('settings.pinDesc')}
                        </span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={pinProtected}
                        onChange={(e) => handleTogglePinProtected(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {pinProtected && (
                    <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="text-[11px] text-muted-foreground">
                        {t('settings.pinPrompt')}
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <input
                            type={showPin ? 'text' : 'password'}
                            inputMode="numeric"
                            maxLength={6}
                            value={pinCode}
                            onChange={handlePinChange}
                            placeholder="123456"
                            className="w-28 bg-muted/30 border border-border rounded-md px-2.5 py-1.5 text-xs font-mono font-bold tracking-widest text-center text-foreground focus:outline-none focus:border-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPin(!showPin)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                            title={showPin ? t('settings.hidePin') : t('settings.showPin')}
                          >
                            {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleGeneratePin}
                          className="px-2.5 py-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-foreground text-xs font-medium flex items-center space-x-1.5 transition-colors"
                          title={t('settings.randomPin')}
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t('settings.randomPin')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Allowed S3 URLs Whitelist */}
                <div className="p-4 rounded-xl border border-border bg-background shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-foreground">
                            {t('settings.whitelistTitle')}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
                            {allowedUrls.length}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground block mt-0.5">
                          {t('settings.whitelistDesc')}
                        </span>
                      </div>
                    </div>

                    {profiles && profiles.length > 0 && (
                      <button
                        type="button"
                        onClick={handleImportFromProfiles}
                        className="px-2.5 py-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-foreground text-xs font-medium flex items-center space-x-1.5 transition-colors flex-shrink-0"
                        title={t('settings.fromProfiles')}
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5 text-primary" />
                        <span className="hidden sm:inline">{t('settings.fromProfiles')}</span>
                      </button>
                    )}
                  </div>

                  {/* Add URL input */}
                  <div className="flex items-center space-x-2 pt-1">
                    <div className="relative flex-1">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder={t('settings.urlPlaceholder')}
                        value={newUrlInput}
                        onChange={(e) => setNewUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddUrl();
                          }
                        }}
                        className="w-full bg-muted/20 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddUrl}
                      disabled={!newUrlInput.trim()}
                      className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-foreground text-xs font-medium flex items-center space-x-1 transition-colors flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('settings.addUrl')}</span>
                    </button>
                  </div>

                  {/* Allowed URLs List */}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                    {allowedUrls.length === 0 ? (
                      <div className="p-3 rounded-lg border border-dashed border-border/80 bg-muted/10 text-center text-xs text-muted-foreground">
                        {t('settings.whitelistEmpty')}
                      </div>
                    ) : (
                      allowedUrls.map((url) => (
                        <div
                          key={url}
                          className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/70 bg-muted/20 text-xs hover:border-border transition-colors"
                        >
                          <div className="flex items-center space-x-2 truncate pr-2">
                            <Server className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-mono text-foreground font-medium truncate select-all">
                              {url}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveUrl(url)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                            title={t('settings.deleteFromWhitelist')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Connected Devices */}
                <div className="p-4 rounded-xl border border-border bg-background shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-foreground">
                            {t('settings.devicesTitle')}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
                            {devices.length}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground block mt-0.5">
                          {t('settings.devicesDesc')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={loadDevices}
                        disabled={devicesLoading}
                        className="p-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={t('settings.refreshDevices')}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${devicesLoading ? 'animate-spin text-primary' : ''}`} />
                      </button>
                      {devices.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearDevices}
                          className="px-2 py-1 rounded-md border border-border bg-destructive/10 hover:bg-destructive/20 text-destructive text-[11px] font-medium transition-colors"
                          title={t('settings.clearDevices')}
                        >
                          {t('settings.clearDevices')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Device cards */}
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {devices.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-border/80 bg-muted/10 text-center text-xs text-muted-foreground">
                        {t('settings.devicesEmpty')}
                      </div>
                    ) : (
                      devices.map((device) => {
                        const renderDeviceIcon = () => {
                          if (device.deviceType === 'mobile') return <Smartphone className="w-4 h-4 text-emerald-400" />;
                          if (device.deviceType === 'tablet') return <Tablet className="w-4 h-4 text-indigo-400" />;
                          return <Monitor className="w-4 h-4 text-blue-400" />;
                        };

                        const formatDeviceDate = (isoStr: string) => {
                          try {
                            const date = new Date(isoStr);
                            const now = new Date();
                            const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
                            if (diffSec < 60) return t('settings.justNow');
                            if (diffSec < 3600) return t('settings.minsAgo', { count: Math.floor(diffSec / 60) });
                            if (diffSec < 86400) return t('settings.hoursAgo', { count: Math.floor(diffSec / 3600) });
                            return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                          } catch {
                            return isoStr;
                          }
                        };

                        return (
                          <div
                            key={device.id}
                            className="p-3 rounded-lg border border-border/80 bg-muted/20 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <div className="p-2 rounded-lg bg-background border border-border flex-shrink-0">
                                {renderDeviceIcon()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold text-foreground truncate">
                                    {device.deviceName}
                                  </span>
                                  {device.isOnline ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                                      {t('common.online')}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border flex-shrink-0">
                                      {t('common.offline')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-3 text-[11px] text-muted-foreground mt-0.5 font-mono">
                                  <span>IP: {device.ip}</span>
                                  <span>•</span>
                                  <span>{t('settings.deviceActivity', { time: formatDeviceDate(device.lastSeen) })}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleForgetDevice(device.id)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                              title={t('settings.forgetDevice')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Privacy and Architecture Notice */}
                <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-1.5 text-muted-foreground">
                  <div className="flex items-center space-x-2 text-foreground font-medium text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{t('settings.securityTitle')}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {t('settings.securityDesc')}
                  </p>
                </div>
              </div>
            )}

            {/* 4. ABOUT & PRO TAB */}
            {activeTab === 'about' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-background border border-border">
                  <div className="flex items-center space-x-3 mb-2">
                    <img
                      src={syncraLogo}
                      alt="Syncra"
                      className="w-9 h-9 rounded-xl object-cover shadow-xs border border-border/60 flex-shrink-0"
                    />
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">
                        {t('settings.aboutAppTitle')}
                      </h4>
                      <p className="text-[10px] text-muted-foreground">{t('settings.aboutAppVersion')}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    {t('settings.aboutAppDesc')}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                  {(() => {
                    const isPaidPro = licenseStatus?.licenseType === 'pro' && !licenseStatus?.isTrial;
                    const isTrial = Boolean(licenseStatus?.isTrial);

                    return (
                      <>
                        <div>
                          <span className="text-xs font-semibold text-amber-300 block">{t('settings.licenseTier')}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {isPaidPro
                              ? t('settings.proLicenseActive')
                              : isTrial
                              ? t('settings.proTrialActive', { days: licenseStatus?.trialDaysLeft ?? 14 })
                              : t('settings.communityEdition')}
                          </span>
                        </div>
                        <button
                          onClick={onTogglePro}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors shadow-xs"
                        >
                          {isPaidPro
                            ? t('settings.manageLicense')
                            : isTrial
                            ? t('settings.enterLicenseKey')
                            : t('settings.activatePro')}
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-border bg-plane-surface flex-shrink-0">
          <div className="flex items-center space-x-1.5 text-emerald-400 text-xs">
            {savedBadge && (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{t('common.settingsSaved')}</span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-foreground border border-border bg-transparent hover:bg-muted rounded-md transition-colors"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3.5 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary-hover rounded-md transition-colors shadow-xs"
            >
              {t('common.applySettings')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
