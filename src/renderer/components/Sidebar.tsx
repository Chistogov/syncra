import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Database,
  Search,
  Sparkles,
  ChevronDown,
  RefreshCw,
  Settings2,
  Server,
  Layers,
  HardDrive,
  LogOut,
  X,
} from 'lucide-react';
import { S3Profile, S3Bucket, LicenseStatus } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

interface SidebarProps {
  profiles: S3Profile[];
  activeProfile: S3Profile | null;
  buckets: S3Bucket[];
  selectedBucket: string;
  onSelectBucket: (bucketName: string) => void;
  onSelectProfile: (profileId: string) => void;
  onOpenNewProfileModal: () => void;
  onOpenEditProfileModal: (profile: S3Profile) => void;
  onDeleteProfile: (profileId: string) => void;
  onRefreshBuckets: () => void;
  onOpenCreateBucketModal: () => void;
  onDeleteBucket: (bucketName: string) => void;
  isProActive: boolean;
  licenseStatus?: LicenseStatus | null;
  onOpenProModal: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isServerAvailable?: boolean;
  canCreateBucket?: boolean;
  canDeleteBucket?: boolean;
  roleName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  profiles,
  activeProfile,
  buckets,
  selectedBucket,
  onSelectBucket,
  onSelectProfile,
  onOpenNewProfileModal,
  onOpenEditProfileModal,
  onDeleteProfile,
  onRefreshBuckets,
  onOpenCreateBucketModal,
  onDeleteBucket,
  isProActive,
  licenseStatus,
  onOpenProModal,
  isMobileOpen = false,
  onCloseMobile,
  isServerAvailable = true,
  canCreateBucket = true,
  canDeleteBucket = true,
  roleName,
}) => {
  const { t } = useTranslation();
  const [bucketSearch, setBucketSearch] = useState('');
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const filteredBuckets = buckets.filter((b) =>
    b.name.toLowerCase().includes(bucketSearch.toLowerCase())
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden animate-fade-in"
        />
      )}

      <aside
        className={`bg-background border-r border-border flex flex-col h-full select-none flex-shrink-0 text-foreground transition-transform duration-200 z-50 ${
          isMobileOpen
            ? 'fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl translate-x-0'
            : 'fixed inset-y-0 left-0 w-72 max-w-[85vw] -translate-x-full md:relative md:w-64 md:translate-x-0 md:shadow-none'
        }`}
      >
        {/* Plane.so Workspace Switcher Header */}
        <div className="p-3 border-b border-border/80 flex items-center justify-between">
          <div className="relative flex-1 min-w-0">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border transition-all text-left group"
          >
            <div className="flex items-center space-x-2.5 truncate">
              {/* Workspace Avatar */}
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-primary flex items-center justify-center shadow-xs text-white flex-shrink-0 font-semibold text-xs">
                {activeProfile ? activeProfile.name.charAt(0).toUpperCase() : 'S'}
              </div>

              <div className="truncate">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {activeProfile ? activeProfile.name : 'Syncra'}
                  </span>
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0 ${
                      isServerAvailable
                        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                        : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)] animate-pulse'
                    }`}
                    title={
                      isServerAvailable
                        ? t('sidebar.serverOnline')
                        : t('sidebar.serverOffline')
                    }
                  />
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {activeProfile ? `${activeProfile.endpoint.replace(/^https?:\/\//, '')}${roleName ? ` • ${roleName}` : ''}` : 'Syncra Cloud'}
                </p>
              </div>
            </div>

            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 ml-1" />
          </button>

          {/* Profile Dropdown (Shadcn Popover Style) */}
          {profileDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-plane-surface border border-border rounded-lg shadow-xl py-1 text-xs backdrop-blur-md">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('sidebar.profiles')} ({profiles.length}/{isProActive ? '∞' : '3'})
              </div>

              {profiles.map((p) => {
                const isActive = p.id === activeProfile?.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProfile(p.id);
                      setProfileDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 mx-1 rounded-md cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div
                        className={`w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0 ${
                          isActive
                            ? isServerAvailable
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                            : 'bg-muted-foreground/40'
                        }`}
                        title={
                          isActive
                            ? isServerAvailable
                              ? t('sidebar.serverOnline')
                              : t('sidebar.serverOffline')
                            : undefined
                        }
                      />
                      <span className="truncate">{p.name}</span>
                    </div>

                    <div className="flex items-center space-x-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setProfileDropdownOpen(false);
                          onOpenEditProfileModal(p);
                        }}
                        className="p-1 hover:text-foreground text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                        title={t('sidebar.editProfile')}
                      >
                        <Settings2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProfile(p.id);
                        }}
                        className="p-1 hover:text-destructive text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                        title={t('sidebar.deleteProfile')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {activeProfile && (
                <div className="border-t border-border mt-1 pt-1 mx-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onDeleteProfile(activeProfile.id);
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-md transition-colors font-medium text-left"
                    title={t('sidebar.deleteProfile')}
                  >
                    <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{t('sidebar.deleteProfile')}</span>
                  </button>
                </div>
              )}

              <div className="border-t border-border mt-1 pt-1 mx-1">
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    if (!isProActive && profiles.length >= 3) {
                      onOpenProModal();
                      return;
                    }
                    onOpenNewProfileModal();
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 rounded-md transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('sidebar.newProfile')}</span>
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Mobile close button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 ml-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors flex-shrink-0"
              title={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

      {/* Buckets Section Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-medium uppercase tracking-wider">
          {t('sidebar.buckets')} ({buckets.length})
        </span>

        <div className="flex items-center space-x-0.5">
          <button
            onClick={onRefreshBuckets}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
            title={t('sidebar.refreshBuckets')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {canCreateBucket && (
            <button
              onClick={onOpenCreateBucketModal}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
              title={t('sidebar.newBucket')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bucket Search Box (Plane.so style input) */}
      <div className="px-3 py-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder={t('sidebar.searchBuckets')}
            value={bucketSearch}
            onChange={(e) => setBucketSearch(e.target.value)}
            className="w-full bg-plane-surface border border-border rounded-md pl-8 pr-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-1 focus:ring-ring/50 select-text transition-all"
          />
        </div>
      </div>

      {/* Buckets List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {filteredBuckets.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {!isServerAvailable ? (
              <div className="space-y-1 text-rose-400">
                <p className="font-medium text-xs">{t('sidebar.serverOffline')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('profile.testFailed')}
                </p>
              </div>
            ) : buckets.length === 0 ? (
              t('sidebar.noBuckets')
            ) : (
              t('sidebar.emptySearch')
            )}
          </div>
        ) : (
          filteredBuckets.map((bucket) => {
            const isSelected = bucket.name === selectedBucket;
            return (
              <div
                key={bucket.name}
                onClick={() => {
                  onSelectBucket(bucket.name);
                  onCloseMobile?.();
                }}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <Database
                    className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                      isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground/80'
                    }`}
                  />
                  <span className="truncate">{bucket.name}</span>
                </div>

                {canDeleteBucket && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBucket(bucket.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive text-muted-foreground transition-all rounded hover:bg-muted"
                    title={t('sidebar.deleteBucket')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Plane.so Bottom User / Pro Badge Pill */}
      <div className="p-2.5 border-t border-border">
        {(() => {
          const isPaidPro = licenseStatus?.licenseType === 'pro' && !licenseStatus?.isTrial;
          const isTrial = Boolean(licenseStatus?.isTrial);

          return (
            <div
              onClick={onOpenProModal}
              className="flex items-center justify-between p-2 rounded-lg bg-plane-surface hover:bg-muted/60 border border-border/80 cursor-pointer transition-all group"
            >
              <div className="flex items-center space-x-2 truncate">
                <div className="w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Sparkles className="w-3 h-3" />
                </div>
                <div className="truncate">
                  <span className="text-xs font-medium text-foreground block truncate">
                    {isPaidPro ? t('sidebar.proEdition') : isTrial ? t('sidebar.proTrial') : 'Community'}
                  </span>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {isPaidPro
                      ? t('sidebar.licenseActive')
                      : isTrial
                      ? t('sidebar.trialDaysLeft', { count: licenseStatus?.trialDaysLeft ?? 14 })
                      : t('sidebar.upgradeToPro')}
                  </span>
                </div>
              </div>

              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground group-hover:text-foreground transition-colors border border-border/60">
                {isPaidPro ? 'PRO' : isTrial ? 'TRIAL' : 'FREE'}
              </span>
            </div>
          );
        })()}
      </div>
      </aside>
    </>
  );
};
