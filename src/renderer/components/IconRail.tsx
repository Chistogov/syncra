import React from 'react';
import {
  Database,
  ArrowDownUp,
  Settings,
  Sun,
  Moon,
  Sparkles,
  Layers,
  Server,
  Lock,
} from 'lucide-react';
import { LicenseStatus } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import syncraLogo from '../assets/logo.png';

interface IconRailProps {
  activeTab: 'storage' | 'transfers' | 'admin';
  onSelectTab: (tab: 'storage' | 'transfers' | 'admin') => void;
  activeTransferCount: number;
  onOpenSettings: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenProModal: () => void;
  isProActive: boolean;
  licenseStatus?: LicenseStatus | null;
  isElectron?: boolean;
  canAdminMinio?: boolean;
  onWebLogout?: () => void;
}

export const IconRail: React.FC<IconRailProps> = ({
  activeTab,
  onSelectTab,
  activeTransferCount,
  onOpenSettings,
  theme,
  onToggleTheme,
  onOpenProModal,
  isProActive,
  licenseStatus,
  isElectron = true,
  canAdminMinio = true,
  onWebLogout,
}) => {
  const { t } = useTranslation();

  return (
    <div className="hidden md:flex w-14 bg-plane-rail border-r border-border flex-col items-center justify-between py-3 select-none flex-shrink-0 z-20">
      {/* Top Brand Logo & Navigation Stack */}
      <div className="flex flex-col items-center space-y-4 w-full">
        {/* Syncra Brand Icon Button */}
        <div
          onClick={() => onSelectTab('storage')}
          className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shadow-md cursor-pointer hover:scale-105 active:scale-95 transition-all p-0.5 bg-background border border-border/60"
          title="Syncra"
        >
          <img src={syncraLogo} alt="Syncra" className="w-full h-full object-cover rounded-lg" />
        </div>

        {/* Navigation Items (Stacked with Icon + Label, exactly like Plane.so) */}
        <div className="flex flex-col items-center space-y-1 w-full px-1.5">
          {/* Storage / Buckets */}
          <button
            onClick={() => onSelectTab('storage')}
            className={`w-full flex flex-col items-center justify-center py-2 rounded-lg transition-colors group relative ${
              activeTab === 'storage'
                ? 'bg-accent text-foreground font-medium shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('nav.storage')}
          >
            <Layers className="w-4 h-4 mb-1 transition-transform group-hover:scale-105" />
            <span className="text-[10px] font-medium leading-none">{t('sidebar.buckets')}</span>
          </button>

          {/* Transfers / Queue */}
          <button
            onClick={() => onSelectTab('transfers')}
            className={`w-full flex flex-col items-center justify-center py-2 rounded-lg transition-colors group relative ${
              activeTab === 'transfers'
                ? 'bg-accent text-foreground font-medium shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('transfers.title')}
          >
            <div className="relative">
              <ArrowDownUp className="w-4 h-4 mb-1 transition-transform group-hover:scale-105" />
              {activeTransferCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center animate-pulse leading-none shadow-xs">
                  {activeTransferCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">{t('nav.transfers')}</span>
          </button>

          {/* Admin / MinIO Server & Storage Management */}
          {canAdminMinio && (
            <button
              onClick={() => onSelectTab('admin')}
              className={`w-full flex flex-col items-center justify-center py-2 rounded-lg transition-colors group relative ${
                activeTab === 'admin'
                  ? 'bg-accent text-foreground font-medium shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title={t('admin.dashboard')}
            >
              <Server className="w-4 h-4 mb-1 transition-transform group-hover:scale-105" />
              <span className="text-[10px] font-medium leading-none">{t('common.status')}</span>
            </button>
          )}

          {/* Pro Edition Pill */}
          <button
            onClick={onOpenProModal}
            className={`w-full flex flex-col items-center justify-center py-2 rounded-lg transition-colors group relative ${
              isProActive
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={
              licenseStatus?.licenseType === 'pro'
                ? t('sidebar.proEdition')
                : licenseStatus?.licenseType === 'trial'
                ? `${t('sidebar.proTrial')} (${t('sidebar.trialDaysLeft', { count: licenseStatus.trialDaysLeft })})`
                : t('settings.communityEdition')
            }
          >
            <Sparkles className="w-4 h-4 mb-1 transition-transform group-hover:scale-105 text-amber-400" />
            <span className="text-[10px] font-medium leading-none">
              {licenseStatus?.licenseType === 'pro'
                ? 'PRO'
                : licenseStatus?.licenseType === 'trial'
                ? `${licenseStatus.trialDaysLeft}d`
                : 'FREE'}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom Actions: Theme Toggle & Settings */}
      <div className="flex flex-col items-center space-y-1 w-full px-1.5 pt-2 border-t border-border/60">
        {/* Quick Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center justify-center py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
          title={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform group-hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-primary transition-transform group-hover:-rotate-12" />
          )}
        </button>

        {/* Settings (Plane.so Bottom Gear Icon) */}
        <button
          onClick={onOpenSettings}
          className="w-full flex flex-col items-center justify-center py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
          title={t('settings.title')}
        >
          <Settings className="w-4 h-4 mb-1 transition-transform group-hover:rotate-90" />
          <span className="text-[10px] font-medium leading-none">{t('nav.settings')}</span>
        </button>

        {/* Web PIN Lock / Logout */}
        {onWebLogout && (
          <button
            onClick={onWebLogout}
            className="w-full flex flex-col items-center justify-center py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors group"
            title={t('nav.lockTitle')}
          >
            <Lock className="w-4 h-4 mb-1 text-muted-foreground group-hover:text-destructive" />
            <span className="text-[10px] font-medium leading-none">{t('nav.lock')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
