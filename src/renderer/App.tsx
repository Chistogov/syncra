import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowDown,
  ChevronRight,
  X,
  Layers,
  Database,
  ArrowDownUp,
  Server,
  Settings,
} from 'lucide-react';
import { IconRail } from './components/IconRail';
import { Sidebar } from './components/Sidebar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { ObjectBrowser } from './components/ObjectBrowser';
import { ProfileModal } from './components/ProfileModal';
import { CreateBucketModal } from './components/CreateBucketModal';
import { RenameBucketModal } from './components/RenameBucketModal';
import { CreateFolderModal } from './components/CreateFolderModal';
import { PresignedUrlModal } from './components/PresignedUrlModal';
import { PreviewDrawer } from './components/PreviewDrawer';
import { TransferQueue } from './components/TransferQueue';
import { ProTrialModal } from './components/ProTrialModal';
import { SettingsModal } from './components/SettingsModal';
import { EditInPlaceNotification } from './components/EditInPlaceNotification';
import { MonacoEditorModal } from './components/MonacoEditorModal';
import { PdfViewerModal } from './components/PdfViewerModal';
import { ImageGalleryModal } from './components/ImageGalleryModal';
import { MinioAdminDashboard } from './components/MinioAdminDashboard';
import { WebPinModal } from './components/WebPinModal';
import { useConfirm } from './context/ConfirmContext';
import { useTranslation } from './context/LanguageContext';
import { formatSpeed, formatBytes } from './utils/formatters';
import {
  S3Profile,
  S3Bucket,
  S3Item,
  TransferProgress,
  WatcherEvent,
  AppSettings,
  LicenseStatus,
  WebServerStatus,
  UserPermissions,
} from '../common/types';

const DEFAULT_PERMISSIONS: UserPermissions = {
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

export const App: React.FC = () => {
  const confirm = useConfirm();
  const { t } = useTranslation();

  // Settings & Theme
  const defaultSettings: AppSettings = {
    theme: 'dark',
    transferConcurrency: 4,
    multipartChunkSizeMB: 10,
    thumbnailConcurrency: 4,
    autoSaveOnEditInPlace: false,
  };

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('s3_explorer_settings');
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch {}
    return defaultSettings;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'storage' | 'transfers' | 'admin'>('storage');
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Apply theme to document element
  useEffect(() => {
    const isDark = settings.theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('s3_explorer_settings', JSON.stringify(settings));
  }, [settings]);

  // Prevent default window behavior for unhandled drag & drop (stops Chromium from navigating away)
  useEffect(() => {
    const preventDragDefault = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDragDefault);
    window.addEventListener('drop', preventDragDefault);
    return () => {
      window.removeEventListener('dragover', preventDragDefault);
      window.removeEventListener('drop', preventDragDefault);
    };
  }, []);

  const toggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  };

  // Profiles
  const [profiles, setProfiles] = useState<S3Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<S3Profile | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [isServerAvailable, setIsServerAvailable] = useState<boolean>(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<S3Profile | null>(null);

  // Web Server state & Desktop Environment check
  const isElectronApp = (window as any).electronAPI?.isElectron !== false;
  const [webServerStatus, setWebServerStatus] = useState<WebServerStatus | null>(null);

  const refreshWebServerStatus = useCallback(async () => {
    try {
      if (window.electronAPI?.webServer?.getStatus) {
        const st = await window.electronAPI.webServer.getStatus();
        setWebServerStatus(st);
      }
    } catch (err) {
      console.error('Failed to get web server status:', err);
    }
  }, []);

  useEffect(() => {
    if (!isElectronApp) return;
    refreshWebServerStatus();
    // Poll every 5 seconds to keep status in sync in desktop app
    const interval = setInterval(refreshWebServerStatus, 5000);
    return () => clearInterval(interval);
  }, [refreshWebServerStatus, isElectronApp]);

  // Web Authentication & PIN Protection state
  const [webPinRequired, setWebPinRequired] = useState<boolean>(!isElectronApp);
  const [webAllowedUrls, setWebAllowedUrls] = useState<string[]>([]);
  const [isWebAuthenticated, setIsWebAuthenticated] = useState<boolean>(() => {
    if (isElectronApp) return true;
    const token = (window as any).electronAPI?.webAuth?.getStoredToken?.();
    return Boolean(token);
  });

  const checkWebAuthStatus = useCallback(async () => {
    if (isElectronApp) return;
    try {
      if ((window as any).electronAPI?.webAuth?.getConfig) {
        const cfg = await (window as any).electronAPI.webAuth.getConfig();
        if (cfg) {
          setWebPinRequired(Boolean(cfg.pinRequired));
          setWebAllowedUrls(cfg.allowedUrls || []);
          if (!cfg.pinRequired) {
            setIsWebAuthenticated(true);
          } else {
            const token = (window as any).electronAPI?.webAuth?.getStoredToken?.();
            setIsWebAuthenticated(Boolean(token));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load web server config:', err);
    }
  }, [isElectronApp]);

  useEffect(() => {
    if (isElectronApp) return;
    checkWebAuthStatus();

    const handleWebAuthRequired = () => {
      setIsWebAuthenticated(false);
      setActiveProfile(null);
      setBuckets([]);
      setSelectedBucket('');
      setItems([]);
    };

    window.addEventListener('s3:webAuthRequired', handleWebAuthRequired);
    return () => {
      window.removeEventListener('s3:webAuthRequired', handleWebAuthRequired);
    };
  }, [isElectronApp, checkWebAuthStatus]);

  const handleWebLogout = async () => {
    if ((window as any).electronAPI?.webAuth?.logout) {
      await (window as any).electronAPI.webAuth.logout();
    }
    setIsWebAuthenticated(false);
    setActiveProfile(null);
    setBuckets([]);
    setSelectedBucket('');
    setItems([]);
  };
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const isProActive = Boolean(licenseStatus ? licenseStatus.isPro : true);
  const [isProModalOpen, setIsProModalOpen] = useState<boolean>(false);

  const handleOpenMonaco = useCallback((item: S3Item) => {
    if (!isProActive) {
      setIsProModalOpen(true);
      return;
    }
    setEditingMonacoItem(item);
  }, [isProActive]);

  const refreshLicenseStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.license.getStatus();
      setLicenseStatus(status);
    } catch (err) {
      console.error('Failed to load license status:', err);
    }
  }, []);

  useEffect(() => {
    if (!isElectronApp && !isWebAuthenticated) return;
    refreshLicenseStatus();
  }, [refreshLicenseStatus, isElectronApp, isWebAuthenticated]);

  // Buckets & Navigation
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [currentPrefix, setCurrentPrefix] = useState<string>('');
  const [items, setItems] = useState<S3Item[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Modals
  const [isCreateBucketOpen, setIsCreateBucketOpen] = useState(false);
  const [renamingBucket, setRenamingBucket] = useState<S3Bucket | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [presignedItem, setPresignedItem] = useState<S3Item | null>(null);
  const [previewItem, setPreviewItem] = useState<S3Item | null>(null);
  const [previewingPdfItem, setPreviewingPdfItem] = useState<S3Item | null>(null);
  const [editingMonacoItem, setEditingMonacoItem] = useState<S3Item | null>(null);
  const [galleryItem, setGalleryItem] = useState<S3Item | null>(null);

  // Transfer Queue & Discovery State
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const transfersRef = useRef<TransferProgress[]>([]);
  const nextQueueIndexRef = useRef<number>(0);
  const stateFlushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastStateFlushRef = useRef<number>(0);

  const activeTaskIds = useRef<Set<string>>(new Set());
  const activeTaskStartTimes = useRef<Map<string, number>>(new Map());
  const taskIndexMap = useRef<Map<string, number>>(new Map());
  const isWorkerPumping = useRef<boolean>(false);

  const activeProfileRef = useRef<S3Profile | null>(activeProfile);
  activeProfileRef.current = activeProfile;

  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;

  const selectedBucketRef = useRef<string>(selectedBucket);
  selectedBucketRef.current = selectedBucket;

  const currentPrefixRef = useRef<string>(currentPrefix);
  currentPrefixRef.current = currentPrefix;

  const loadObjectsRef = useRef<() => void>(() => {});
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-refresh the current folder view when uploads complete
  const triggerDebouncedRefresh = useCallback((taskBucket: string, taskKey: string) => {
    if (taskBucket !== selectedBucketRef.current) return;
    const currentPfx = currentPrefixRef.current;
    if (taskKey.startsWith(currentPfx)) {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        loadObjectsRef.current();
      }, 500);
    }
  }, []);

  const [discoveryState, setDiscoveryState] = useState<{
    isActive: boolean;
    currentFolder: string;
    discoveredCount: number;
    discoveredBytes: number;
  }>({
    isActive: false,
    currentFolder: '',
    discoveredCount: 0,
    discoveredBytes: 0,
  });

  const activeDiscoveryCallbacks = useRef<
    Map<string, (batch: any[], isTruncated: boolean) => void>
  >(new Map());

  // Listen for streaming folder discovery batches from Main process
  useEffect(() => {
    const unsubDiscovery = window.electronAPI.s3.onDiscoveryBatch((payload) => {
      const cb = activeDiscoveryCallbacks.current.get(payload.discoveryId);
      if (cb) {
        cb(payload.objects, payload.isTruncated);
      }
    });

    return () => {
      unsubDiscovery();
    };
  }, []);

  // Toast notification state for starting downloads/uploads in bottom-right corner
  interface DownloadToast {
    id: string;
    title: string;
    message: string;
    subMessage?: string;
  }

  const [downloadToast, setDownloadToast] = useState<DownloadToast | null>(null);

  const showDownloadToast = useCallback((title: string, message: string, subMessage?: string) => {
    setDownloadToast({ id: String(Date.now()), title, message, subMessage });
  }, []);

  // Auto-dismiss toast after 4.5 seconds
  useEffect(() => {
    if (!downloadToast) return;
    const timer = setTimeout(() => {
      setDownloadToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [downloadToast]);

  // Aggregate transfer summary for the bottom status bar in "Buckets" view
  const transferSummary = useMemo(() => {
    let running = 0;
    let queued = 0;
    let completed = 0;
    let totalBytes = 0;
    let transferredBytes = 0;
    let totalSpeed = 0;

    for (let i = 0; i < transfers.length; i++) {
      const item = transfers[i];
      const st = item.status;
      if (st === 'in_progress') {
        running++;
        if (item.speedBytesPerSec) totalSpeed += item.speedBytesPerSec;
      } else if (st === 'queued' || st === 'pending') {
        queued++;
      } else if (st === 'completed') {
        completed++;
      }

      const itemTotal = item.totalBytes || 0;
      totalBytes += itemTotal;
      if (st === 'completed') {
        transferredBytes += itemTotal > 0 ? itemTotal : (item.transferredBytes || 0);
      } else if (st === 'in_progress') {
        transferredBytes += Math.min(itemTotal > 0 ? itemTotal : Infinity, item.transferredBytes || 0);
      }
    }

    const isActive = running > 0 || queued > 0 || discoveryState.isActive;
    let percentage = 0;
    if (completed === transfers.length && transfers.length > 0) {
      percentage = 100;
    } else if (totalBytes > 0) {
      percentage = Math.min(99.9, (transferredBytes / totalBytes) * 100);
    }

    return {
      isActive,
      runningCount: running,
      queuedCount: queued,
      completedCount: completed,
      totalCount: transfers.length,
      percentage,
      speedBytesPerSec: totalSpeed,
      transferredBytes,
      totalBytes,
      isDiscoveryActive: discoveryState.isActive,
      discoveryFolderName: discoveryState.currentFolder,
      discoveryCount: discoveryState.discoveredCount,
    };
  }, [transfers, discoveryState]);

  // Throttled UI state synchronization (flushes to React state at most every 150ms)
  const scheduleTransfersStateUpdate = useCallback((immediate = false) => {
    const doFlush = () => {
      if (stateFlushTimerRef.current) {
        clearTimeout(stateFlushTimerRef.current);
        stateFlushTimerRef.current = null;
      }
      lastStateFlushRef.current = Date.now();
      setTransfers(transfersRef.current.slice());
    };

    if (immediate) {
      doFlush();
      return;
    }

    const elapsed = Date.now() - lastStateFlushRef.current;
    if (elapsed >= 150) {
      doFlush();
    } else if (!stateFlushTimerRef.current) {
      stateFlushTimerRef.current = setTimeout(doFlush, 150 - elapsed);
    }
  }, []);

  // Helper to reliably update a task in both state and ref by ID
  const updateTask = useCallback(
    (id: string, updater: (task: TransferProgress) => TransferProgress) => {
      const list = transfersRef.current;
      let idx = taskIndexMap.current.get(id);
      if (idx === undefined || idx >= list.length || list[idx]?.id !== id) {
        idx = list.findIndex((t) => t.id === id);
        if (idx !== -1) {
          taskIndexMap.current.set(id, idx);
        }
      }
      if (idx !== -1 && idx < list.length) {
        list[idx] = updater(list[idx]);
        scheduleTransfersStateUpdate();
      }
    },
    [scheduleTransfersStateUpdate]
  );

  // Worker Queue Pump
  const pumpQueue = useCallback(() => {
    if (!activeProfileRef.current || isWorkerPumping.current) return;
    isWorkerPumping.current = true;

    try {
      const concurrency = Math.max(1, settingsRef.current.transferConcurrency || 4);
      const availableSlots = concurrency - activeTaskIds.current.size;

      if (availableSlots <= 0) return;

      const list = transfersRef.current;
      const tasksToStart: TransferProgress[] = [];
      let i = nextQueueIndexRef.current;
      let firstUnstarted = -1;

      while (i < list.length && tasksToStart.length < availableSlots) {
        const item = list[i];
        if (item.status === 'queued' || item.status === 'pending') {
          if (!activeTaskIds.current.has(item.id)) {
            tasksToStart.push(item);
            activeTaskIds.current.add(item.id);
          } else if (firstUnstarted === -1) {
            firstUnstarted = i;
          }
        }
        i++;
      }

      nextQueueIndexRef.current = firstUnstarted !== -1 ? firstUnstarted : i;

      if (tasksToStart.length === 0) return;

      // Mark tasks as 'in_progress' synchronously in transfersRef
      tasksToStart.forEach((t) => {
        let idx = taskIndexMap.current.get(t.id);
        if (idx === undefined || idx >= list.length || list[idx]?.id !== t.id) {
          idx = list.findIndex((x) => x.id === t.id);
          if (idx !== -1) taskIndexMap.current.set(t.id, idx);
        }
        if (idx !== -1 && idx < list.length) {
          list[idx] = { ...list[idx], status: 'in_progress' };
        }
      });
      scheduleTransfersStateUpdate();

      // Launch worker execution for each started task
      for (const task of tasksToStart) {
        activeTaskStartTimes.current.set(task.id, Date.now());
        (async () => {
          try {
            if (task.type === 'upload') {
              await window.electronAPI.s3.uploadFile(
                task.id,
                activeProfileRef.current!,
                task.bucket,
                task.key,
                task.localPath
              );

              updateTask(task.id, (t) => ({
                ...t,
                status: 'completed',
                progress: 100,
                transferredBytes: task.totalBytes,
                speed: 'Завершено',
              }));

              triggerDebouncedRefresh(task.bucket, task.key);
            } else {
              const res = await window.electronAPI.s3.downloadFile(
                task.id,
                activeProfileRef.current!,
                task.bucket,
                task.key,
                task.localPath
              );

              const finalSpeed = res?.averageSpeedBytesPerSec
                ? formatSpeed(res.averageSpeedBytesPerSec)
                : '';

              updateTask(task.id, (t) => ({
                ...t,
                status: 'completed',
                progress: 100,
                transferredBytes: task.totalBytes,
                speed: finalSpeed || t.speed || 'Завершено',
                speedBytesPerSec: res?.averageSpeedBytesPerSec || t.speedBytesPerSec,
              }));
            }
          } catch (err: any) {
            updateTask(task.id, (t) => ({
              ...t,
              status: 'error',
              error: err.message || 'Ошибка передачи',
            }));
          } finally {
            activeTaskIds.current.delete(task.id);
            activeTaskStartTimes.current.delete(task.id);

            // If all active upload tasks have completed and no more are queued, flush refresh immediately
            if (activeTaskIds.current.size === 0) {
              scheduleTransfersStateUpdate(true);
              const hasRemainingUploads = nextQueueIndexRef.current < transfersRef.current.length;
              if (!hasRemainingUploads && refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
                loadObjectsRef.current();
              }
            }

            // Trigger next task immediately
            setTimeout(pumpQueue, 0);
          }
        })();
      }
    } finally {
      isWorkerPumping.current = false;
    }
  }, [updateTask, scheduleTransfersStateUpdate, triggerDebouncedRefresh]);

  // Helper to ensure a clean queue if previous session was finished
  const prepareForNewTransfers = useCallback(() => {
    const isQueueIdle = !transfersRef.current.some(
      (t) => t.status === 'in_progress' || t.status === 'queued' || t.status === 'pending'
    );
    if (isQueueIdle) {
      activeTaskIds.current.clear();
      activeTaskStartTimes.current.clear();
      taskIndexMap.current.clear();
      nextQueueIndexRef.current = 0;
      transfersRef.current = [];
      setTransfers([]);
    }
  }, []);

  // Helper to append new tasks synchronously and start worker pump
  const addTransfers = useCallback(
    (newTasks: TransferProgress[]) => {
      if (newTasks.length === 0) return;
      const current = transfersRef.current;
      const startIndex = current.length;
      for (let i = 0; i < newTasks.length; i++) {
        taskIndexMap.current.set(newTasks[i].id, startIndex + i);
      }
      const updated = current.concat(newTasks);
      transfersRef.current = updated;
      scheduleTransfersStateUpdate(true);
      setTimeout(pumpQueue, 0);
    },
    [pumpQueue, scheduleTransfersStateUpdate]
  );

  // Heartbeat to guarantee queue health & detect any zombie tasks
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (!activeProfileRef.current) return;
      const now = Date.now();

      // Failsafe watchdog: check for any active task stuck for > 60 seconds
      activeTaskIds.current.forEach((taskId) => {
        const startedAt = activeTaskStartTimes.current.get(taskId);
        if (startedAt && now - startedAt > 60000) {
          console.warn(`[Watchdog] Task ${taskId} timed out in active state after 60s, releasing slot`);
          activeTaskIds.current.delete(taskId);
          activeTaskStartTimes.current.delete(taskId);
          updateTask(taskId, (t) => ({
            ...t,
            status: 'error',
            error: 'Превышено максимальное время ожидания передачи (60с)',
          }));
        }
      });

      const concurrency = Math.max(1, settingsRef.current.transferConcurrency || 4);
      if (activeTaskIds.current.size < concurrency) {
        const hasQueued = transfersRef.current.some(
          (t) =>
            (t.status === 'queued' || t.status === 'pending') &&
            !activeTaskIds.current.has(t.id)
        );
        if (hasQueued) {
          pumpQueue();
        }
      }
    }, 1000);

    return () => clearInterval(heartbeat);
  }, [pumpQueue, updateTask]);

  // Throttled Real-time transfer progress buffer (flushes every 150ms)
  const progressBuffer = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    const unsubProgress = window.electronAPI.transfers.onProgress((payload) => {
      progressBuffer.current.set(payload.id, payload);
    });

    const interval = setInterval(() => {
      if (progressBuffer.current.size === 0) return;
      const updates = new Map(progressBuffer.current);
      progressBuffer.current.clear();

      const current = transfersRef.current;
      let changed = false;

      updates.forEach((upd, id) => {
        let idx = taskIndexMap.current.get(id);
        if (idx === undefined || idx >= current.length || current[idx]?.id !== id) {
          idx = current.findIndex((t) => t.id === id);
          if (idx !== -1) {
            taskIndexMap.current.set(id, idx);
          }
        }

        if (idx !== -1 && idx < current.length) {
          const currentItem = current[idx];
          // CRITICAL: NEVER touch tasks that are completed, error, or cancelled!
          if (currentItem.status === 'in_progress') {
            changed = true;
            current[idx] = {
              ...currentItem,
              transferredBytes: upd.transferredBytes,
              totalBytes: upd.totalBytes,
              progress: upd.progress,
              speedBytesPerSec: upd.speedBytesPerSec,
              speed: formatSpeed(upd.speedBytesPerSec),
            };
          }
        }
      });

      if (changed) {
        scheduleTransfersStateUpdate();
      }
    }, 150);

    return () => {
      unsubProgress();
      clearInterval(interval);
    };
  }, [scheduleTransfersStateUpdate]);

  // Edit-in-Place Watcher
  const [watcherEvent, setWatcherEvent] = useState<WatcherEvent | null>(null);
  const [isSavingWatcher, setIsSavingWatcher] = useState(false);

  // 1. Initial Load of profiles
  useEffect(() => {
    if (!isElectronApp && !isWebAuthenticated) return;
    loadProfiles();

    // Listen for Edit-in-Place file changes
    const unsubscribe = window.electronAPI.watcher?.onFileChanged
      ? window.electronAPI.watcher.onFileChanged((event) => {
          setWatcherEvent(event);
        })
      : () => {};

    return () => {
      unsubscribe();
    };
  }, [isElectronApp, isWebAuthenticated]);

  const loadProfiles = async () => {
    try {
      const list = await window.electronAPI.profiles.list();
      setProfiles(list);
      if (list.length > 0) {
        const activeId = await window.electronAPI.profiles.getActiveId();
        const found = list.find((p) => p.id === activeId) || list[0];
        setActiveProfile(found);
      } else {
        // Automatically prompt modal if no profiles exist
        setActiveProfile(null);
        setBuckets([]);
        setSelectedBucket('');
        setItems([]);
        setIsProfileModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
    }
  };

  const loadPermissions = useCallback(async (profile: S3Profile, bucketName?: string) => {
    try {
      if (window.electronAPI?.auth?.checkPermissions) {
        const perms = await window.electronAPI.auth.checkPermissions(profile, bucketName);
        setPermissions(perms);
        if (!perms.canAdminMinio && activeTab === 'admin') {
          setActiveTab('storage');
        }
      }
    } catch (err) {
      console.warn('Failed to check permissions:', err);
    }
  }, [activeTab]);

  // 2. Load Buckets & Permissions whenever active profile changes
  useEffect(() => {
    if (activeProfile) {
      loadBuckets(activeProfile);
      loadPermissions(activeProfile, selectedBucket);
    } else {
      setBuckets([]);
      setSelectedBucket('');
      setItems([]);
      setPermissions(DEFAULT_PERMISSIONS);
    }
  }, [activeProfile, loadPermissions]);

  useEffect(() => {
    if (activeProfile && selectedBucket) {
      loadPermissions(activeProfile, selectedBucket);
    }
  }, [selectedBucket, activeProfile, loadPermissions]);

  const loadBuckets = async (profile: S3Profile) => {
    try {
      const bucketList = await window.electronAPI.s3.listBuckets(profile);
      setBuckets(bucketList);
      setIsServerAvailable(true);
      if (bucketList.length > 0 && !selectedBucket) {
        setSelectedBucket(bucketList[0].name);
      }
    } catch (err) {
      console.error('Failed to list buckets:', err);
      setBuckets([]);
      setIsServerAvailable(false);
    }
  };

  // 3. Load Objects whenever selected bucket or prefix changes
  const loadObjects = useCallback(async () => {
    if (!activeProfile || !selectedBucket) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      const res = await window.electronAPI.s3.listObjects(
        activeProfile,
        selectedBucket,
        currentPrefix
      );
      setItems(res.items);
      setIsServerAvailable(true);
    } catch (err) {
      console.error('Failed to load objects:', err);
      setItems([]);
      setIsServerAvailable(false);
    } finally {
      setLoadingItems(false);
    }
  }, [activeProfile, selectedBucket, currentPrefix]);

  loadObjectsRef.current = loadObjects;

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  // Periodic connection health-check for active profile
  useEffect(() => {
    if (!activeProfile) return;

    let isMounted = true;
    const checkConnection = async () => {
      try {
        const res = await window.electronAPI.profiles.test(activeProfile);
        if (isMounted) {
          setIsServerAvailable(res.success);
        }
      } catch {
        if (isMounted) {
          setIsServerAvailable(false);
        }
      }
    };

    // Periodic check every 25 seconds
    const interval = setInterval(checkConnection, 25000);

    // Check on window focus
    const handleFocus = () => {
      checkConnection();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeProfile]);

  // Whenever active profile changes, pump queue if needed
  useEffect(() => {
    if (activeProfile) {
      setTimeout(pumpQueue, 0);
    }
  }, [activeProfile, pumpQueue]);

  // Handle Profile Actions
  const handleSaveProfile = async (profile: S3Profile) => {
    const res = await window.electronAPI.profiles.save(profile);
    if (res.success) {
      await loadProfiles();
      setActiveProfile(profile);
      return true;
    } else {
      alert(res.error || 'Ошибка сохранения профиля');
      return false;
    }
  };

  const handleDeleteProfile = async (profileId: string): Promise<boolean> => {
    const prof = profiles.find((p) => p.id === profileId);
    const profName = prof ? prof.name : 'Server';
    const ok = await confirm({
      title: t('sidebar.deleteProfileTitle'),
      message: t('sidebar.deleteProfileConfirm', { name: profName }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
    });
    if (!ok) return false;

    try {
      try {
        localStorage.removeItem('s3_bucket_stats_' + profileId);
      } catch {}
      await window.electronAPI.profiles.delete(profileId);
      await loadProfiles();
      return true;
    } catch (err: any) {
      console.error('Failed to delete profile:', err);
      alert(`${t('common.error')}: ${err.message}`);
      return false;
    }
  };

  const handleSelectProfile = (profileId: string) => {
    const found = profiles.find((p) => p.id === profileId);
    if (found) {
      setActiveProfile(found);
      window.electronAPI.profiles.setActiveId(profileId);
      setSelectedBucket('');
      setCurrentPrefix('');
    }
  };

  const isAccessDeniedError = (err: any) => {
    const msg = (err?.message || err?.name || '').toLowerCase();
    return (
      msg.includes('access denied') ||
      msg.includes('accessdenied') ||
      msg.includes('forbidden') ||
      msg.includes('403')
    );
  };

  // Handle Bucket Actions
  const handleCreateBucket = async (bucketName: string) => {
    if (!activeProfile) throw new Error('Нет активного профиля подключения');
    try {
      await window.electronAPI.s3.createBucket(activeProfile, bucketName);
      await loadBuckets(activeProfile);
      setSelectedBucket(bucketName);
      setCurrentPrefix('');
    } catch (err: any) {
      if (isAccessDeniedError(err)) {
        setPermissions((p) => ({ ...p, canCreateBucket: false }));
        alert('Отказано в доступе: у вашей учетной записи нет прав на создание бакетов.');
      } else {
        alert(`Ошибка создания бакета: ${err.message}`);
      }
    }
  };

  const handleRenameBucket = async (oldBucketName: string, newBucketName: string) => {
    if (!activeProfile) throw new Error('Нет активного профиля подключения');
    await window.electronAPI.s3.renameBucket(activeProfile, oldBucketName, newBucketName);
    await loadBuckets(activeProfile);
    if (selectedBucket === oldBucketName) {
      setSelectedBucket(newBucketName);
      setCurrentPrefix('');
    }
  };

  const handleDeleteBucket = async (bucketName: string): Promise<boolean> => {
    if (!activeProfile) return false;
    const ok = await confirm({
      title: t('sidebar.deleteBucketTitle'),
      message: t('sidebar.deleteBucketConfirm', { name: bucketName }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
    });
    if (!ok) return false;

    try {
      await window.electronAPI.s3.deleteBucket(activeProfile, bucketName);
      if (selectedBucket === bucketName) {
        setSelectedBucket('');
        setCurrentPrefix('');
      }
      await loadBuckets(activeProfile);
      return true;
    } catch (err: any) {
      if (isAccessDeniedError(err)) {
        setPermissions((p) => ({ ...p, canDeleteBucket: false }));
        alert('Отказано в доступе: у вас нет прав на удаление бакетов.');
      } else {
        alert(`${t('common.error')}: ${err.message}`);
      }
      return false;
    }
  };

  // Handle Folder & File Actions
  const handleCreateFolder = async (folderName: string) => {
    if (!activeProfile || !selectedBucket) return;
    const folderKey = currentPrefix ? `${currentPrefix}${folderName}/` : `${folderName}/`;
    try {
      await window.electronAPI.s3.createFolder(activeProfile, selectedBucket, folderKey);
      await loadObjects();
    } catch (err: any) {
      if (isAccessDeniedError(err)) {
        setPermissions((p) => ({ ...p, canCreateFolder: false, canUpload: false }));
        alert('Отказано в доступе: у вас нет прав на создание папок и загрузку файлов в этом бакете.');
      } else {
        alert(`${t('common.error')}: ${err.message}`);
      }
    }
  };

  const handleDeleteItems = async (keys: string[]) => {
    if (!activeProfile || !selectedBucket || keys.length === 0) return;

    const isMultiple = keys.length > 1;
    const rawName = keys[0].split('/').filter(Boolean).pop() || keys[0];
    const isFolder = keys.length === 1 && keys[0].endsWith('/');

    const title = isMultiple
      ? t('browser.deleteSelectedTitle')
      : isFolder
      ? t('browser.deleteFolderTitle')
      : t('browser.deleteItemTitle');

    const message = isMultiple
      ? t('browser.deleteConfirm', { count: keys.length })
      : isFolder
      ? t('browser.deleteFolderConfirm', { name: rawName })
      : t('browser.deleteItemConfirm', { name: rawName });

    const ok = await confirm({
      title,
      message,
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
      items: keys.map((k) => k.split('/').filter(Boolean).pop() || k),
    });
    if (!ok) return;

    try {
      await window.electronAPI.s3.deleteObjects(activeProfile, selectedBucket, keys);
      await loadObjects();
    } catch (err: any) {
      if (isAccessDeniedError(err)) {
        setPermissions((p) => ({ ...p, canDeleteItems: false }));
        alert('Отказано в доступе: у вас нет прав на удаление объектов.');
      } else {
        alert(`${t('common.error')}: ${err.message}`);
      }
    }
  };

  // Handle Uploads
  const handleUploadFiles = async () => {
    if (!activeProfile || !selectedBucket) return;
    const filePaths = await window.electronAPI.dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
    });
    if (filePaths && filePaths.length > 0) {
      handleFilesUploadProcess(filePaths);
    }
  };

  const handleUploadFolder = async () => {
    if (!activeProfile || !selectedBucket) return;
    try {
      const folderPaths = await window.electronAPI.dialog.showOpenDialog({
        properties: ['openDirectory'],
      });
      if (!folderPaths || folderPaths.length === 0) return;

      // Web Browser Mode: folderPaths contains all relative file paths from the selected folder
      if (!isElectronApp) {
        const newTasks: TransferProgress[] = [];
        for (const virtualPath of folderPaths) {
          const file = (window.electronAPI as any).getBrowserFile
            ? (window.electronAPI as any).getBrowserFile(virtualPath)
            : null;
          const cleanRel = virtualPath.replace(/\\/g, '/').replace(/^\/+/, '');
          const key = currentPrefix ? `${currentPrefix}${cleanRel}` : cleanRel;
          newTasks.push({
            id: `up_f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'upload',
            bucket: selectedBucket,
            key,
            localPath: virtualPath,
            totalBytes: file?.size || 0,
            transferredBytes: 0,
            progress: 0,
            speed: '',
            status: 'queued',
          });
        }

        if (newTasks.length > 0) {
          prepareForNewTransfers();
          addTransfers(newTasks);
          const topFolder = folderPaths[0].split(/[/\\]/)[0] || 'folder';
          showDownloadToast('Загрузка запущена', `Папка "${topFolder}"`, `Файлов: ${newTasks.length}`);
        }
        return;
      }

      // Electron Desktop Mode:
      const folderPath = folderPaths[0];
      const folderBaseName = folderPath.split(/[/\\]/).filter(Boolean).pop() || 'folder';
      showDownloadToast('Сканирование...', `Анализ папки "${folderBaseName}"`);

      const scannedFiles = await window.electronAPI.s3.scanLocalPath(folderPath);
      if (!scannedFiles || scannedFiles.length === 0) {
        alert('Выбранная папка пуста');
        return;
      }

      const newTasks: TransferProgress[] = scannedFiles.map((file) => {
        const cleanRel = file.relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
        const key = currentPrefix ? `${currentPrefix}${cleanRel}` : cleanRel;
        return {
          id: `up_f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'upload',
          bucket: selectedBucket,
          key,
          localPath: file.localPath,
          totalBytes: file.size,
          transferredBytes: 0,
          progress: 0,
          speed: '',
          status: 'queued',
        };
      });

      prepareForNewTransfers();
      addTransfers(newTasks);
      showDownloadToast('Загрузка запущена', `Папка "${folderBaseName}"`, `Файлов: ${newTasks.length}`);
    } catch (err: any) {
      alert(`Ошибка при выборе папки: ${err.message}`);
    }
  };

  const handleFilesUploadProcess = async (filePaths: string[]) => {
    if (!activeProfile || !selectedBucket || filePaths.length === 0) return;

    try {
      const newTasks: TransferProgress[] = [];

      if (!isElectronApp) {
        for (const filePath of filePaths) {
          const file = (window.electronAPI as any).getBrowserFile
            ? (window.electronAPI as any).getBrowserFile(filePath)
            : null;
          const cleanRel = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
          const key = currentPrefix ? `${currentPrefix}${cleanRel}` : cleanRel;
          newTasks.push({
            id: `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'upload',
            bucket: selectedBucket,
            key,
            localPath: filePath,
            totalBytes: file?.size || 0,
            transferredBytes: 0,
            progress: 0,
            speed: '',
            status: 'queued',
          });
        }
      } else {
        if (filePaths.length > 1) {
          showDownloadToast('Сканирование...', `Подготовка ${filePaths.length} элементов к загрузке`);
        }

        const scannedFiles = window.electronAPI.s3.scanLocalPaths
          ? await window.electronAPI.s3.scanLocalPaths(filePaths)
          : (await Promise.all(filePaths.map((fp) => window.electronAPI.s3.scanLocalPath(fp)))).flat();

        for (const file of scannedFiles) {
          const rel = (file.relativePath || file.localPath.split(/[/\\]/).pop() || 'file')
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');
          const key = currentPrefix ? `${currentPrefix}${rel}` : rel;
          newTasks.push({
            id: `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'upload',
            bucket: selectedBucket,
            key,
            localPath: file.localPath,
            totalBytes: file.size,
            transferredBytes: 0,
            progress: 0,
            speed: '',
            status: 'queued',
          });
        }
      }

      if (newTasks.length > 0) {
        prepareForNewTransfers();
        addTransfers(newTasks);
        showDownloadToast('Загрузка запущена', `Файлов для загрузки: ${newTasks.length}`);
      }
    } catch (err: any) {
      console.error('Failed to process dropped files:', err);
      alert(`Ошибка добавления файлов: ${err.message}`);
    }
  };

  const triggerBrowserDownload = useCallback((bucket: string, key: string, filename?: string) => {
    if (!activeProfile) return;
    const cleanFilename = filename || key.split('/').filter(Boolean).pop() || 'download';
    const downloadUrl = `/api/s3/download?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(
      key
    )}&profile=${encodeURIComponent(JSON.stringify(activeProfile))}`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [activeProfile]);

  const triggerBrowserDownloadZip = useCallback((bucket: string, prefix: string, folderName?: string) => {
    if (!activeProfile) return;
    const cleanFolderName = folderName || prefix.replace(/\/+$/, '').split('/').filter(Boolean).pop() || 'folder';
    const downloadUrl = `/api/s3/download-zip?bucket=${encodeURIComponent(bucket)}&prefix=${encodeURIComponent(
      prefix
    )}&profile=${encodeURIComponent(JSON.stringify(activeProfile))}`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${cleanFolderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [activeProfile]);

  const triggerBrowserDownloadBulkZip = useCallback((bucket: string, keys: string[]) => {
    if (!activeProfile) return;
    const downloadUrl = `/api/s3/download-zip?bucket=${encodeURIComponent(bucket)}&keys=${encodeURIComponent(
      JSON.stringify(keys)
    )}&profile=${encodeURIComponent(JSON.stringify(activeProfile))}`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `archive_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [activeProfile]);

  // Handle Downloads
  const handleDownloadItem = async (item: S3Item) => {
    if (!activeProfile || !selectedBucket) return;

    // Web Browser Mode: directly trigger native browser download or streaming ZIP for folders
    if (!isElectronApp) {
      if (item.isPrefix) {
        triggerBrowserDownloadZip(selectedBucket, item.key, item.name);
        showDownloadToast('Скачивание архива папки', `Папка "${item.name}"`, 'Формирование ZIP-архива на лету...');
        return;
      }

      triggerBrowserDownload(selectedBucket, item.key, item.name);
      showDownloadToast('Скачивание файла', item.name, formatBytes(item.size || 0));
      return;
    }

    if (item.isPrefix) {
      try {
        const targetDirs = await window.electronAPI.dialog.showOpenDialog({
          properties: ['openDirectory'],
        });
        if (!targetDirs || targetDirs.length === 0) return;
        const targetDir = targetDirs[0];
        const folderName = item.name || 'folder';

        // Clear previous finished transfers so that progress bar and volume reset cleanly
        prepareForNewTransfers();

        showDownloadToast(
          'Скачивание запущено',
          `Папка "${folderName}"`,
          'Файлы добавляются в очередь в фоновом режиме'
        );
        setDiscoveryState({
          isActive: true,
          currentFolder: item.name || item.key,
          discoveredCount: 0,
          discoveredBytes: 0,
        });

        const discoveryId = `disc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        // Stream files into the transfer queue as S3 returns pages of objects
        activeDiscoveryCallbacks.current.set(discoveryId, (objects, isTruncated) => {
          if (objects && objects.length > 0) {
            let batchBytes = 0;
            const newTasks: TransferProgress[] = objects.map((obj) => {
              batchBytes += obj.size;
              let rel = obj.key.startsWith(item.key) ? obj.key.slice(item.key.length) : obj.key;
              rel = rel.replace(/^\/+/, '');
              const localPath = `${targetDir.replace(/[\\/]+$/, '')}/${folderName}/${rel}`;

              return {
                id: `down_f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                type: 'download',
                bucket: selectedBucket,
                key: obj.key,
                localPath,
                totalBytes: obj.size,
                transferredBytes: 0,
                progress: 0,
                speed: '',
                status: 'queued',
              };
            });

            addTransfers(newTasks);
            setDiscoveryState((prev) => ({
              ...prev,
              discoveredCount: prev.discoveredCount + objects.length,
              discoveredBytes: prev.discoveredBytes + batchBytes,
              isActive: isTruncated,
            }));
          }

          if (!isTruncated) {
            activeDiscoveryCallbacks.current.delete(discoveryId);
            setDiscoveryState((prev) => ({ ...prev, isActive: false }));
          }
        });

        await window.electronAPI.s3.streamFolderDiscovery(
          discoveryId,
          activeProfile,
          selectedBucket,
          item.key
        );
      } catch (err: any) {
        alert(`Ошибка получения содержимого папки: ${err.message}`);
        setDiscoveryState((prev) => ({ ...prev, isActive: false }));
      }
      return;
    }

    const targetPath = await window.electronAPI.dialog.showSaveDialog({
      defaultPath: item.name,
    });
    if (!targetPath) return;

    prepareForNewTransfers();

    const newTask: TransferProgress = {
      id: `down_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type: 'download',
      bucket: selectedBucket,
      key: item.key,
      localPath: targetPath,
      totalBytes: item.size || 0,
      transferredBytes: 0,
      progress: 0,
      speed: '',
      status: 'queued',
    };

    addTransfers([newTask]);
    showDownloadToast('Скачивание запущено', item.name, formatBytes(item.size || 0));
  };

  // Handle Multiple Downloads (from selection bar)
  const handleDownloadMultiple = async (selectedItems: S3Item[]) => {
    if (!activeProfile || !selectedBucket || selectedItems.length === 0) return;

    if (selectedItems.length === 1 && !selectedItems[0].isPrefix) {
      await handleDownloadItem(selectedItems[0]);
      return;
    }

    // Web Browser Mode: trigger ZIP archive download for multiple items
    if (!isElectronApp) {
      const keys = selectedItems.map((i) => i.key);
      triggerBrowserDownloadBulkZip(selectedBucket, keys);
      showDownloadToast(
        'Скачивание выбранных объектов',
        `Выбрано: ${selectedItems.length} объектов`,
        'Формирование единого ZIP-архива на лету...'
      );
      return;
    }

    const targetDirs = await window.electronAPI.dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (!targetDirs || targetDirs.length === 0) return;
    const targetDir = targetDirs[0];

    prepareForNewTransfers();

    showDownloadToast(
      'Скачивание запущено',
      `Выбрано: ${selectedItems.length} объектов`,
      'Загрузка выполняется в фоновом режиме'
    );

    const directFileTasks: TransferProgress[] = [];
    const foldersToDiscover: S3Item[] = [];

    for (const item of selectedItems) {
      if (item.isPrefix) {
        foldersToDiscover.push(item);
      } else {
        const localPath = `${targetDir.replace(/[\\/]+$/, '')}/${item.name}`;
        directFileTasks.push({
          id: `down_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'download',
          bucket: selectedBucket,
          key: item.key,
          localPath,
          totalBytes: item.size || 0,
          transferredBytes: 0,
          progress: 0,
          speed: '',
          status: 'queued',
        });
      }
    }

    if (directFileTasks.length > 0) {
      addTransfers(directFileTasks);
    }

    if (foldersToDiscover.length > 0) {
      setDiscoveryState({
        isActive: true,
        currentFolder: `${foldersToDiscover.length} папок`,
        discoveredCount: 0,
        discoveredBytes: 0,
      });

      for (const item of foldersToDiscover) {
        const folderName = item.name || 'folder';
        const discoveryId = `disc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        activeDiscoveryCallbacks.current.set(discoveryId, (objects, isTruncated) => {
          if (objects && objects.length > 0) {
            let batchBytes = 0;
            const newTasks: TransferProgress[] = objects.map((obj) => {
              batchBytes += obj.size;
              let rel = obj.key.startsWith(item.key) ? obj.key.slice(item.key.length) : obj.key;
              rel = rel.replace(/^\/+/, '');
              const localPath = `${targetDir.replace(/[\\/]+$/, '')}/${folderName}/${rel}`;

              return {
                id: `down_f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                type: 'download',
                bucket: selectedBucket,
                key: obj.key,
                localPath,
                totalBytes: obj.size,
                transferredBytes: 0,
                progress: 0,
                speed: '',
                status: 'queued',
              };
            });

            addTransfers(newTasks);
            setDiscoveryState((prev) => ({
              ...prev,
              discoveredCount: prev.discoveredCount + objects.length,
              discoveredBytes: prev.discoveredBytes + batchBytes,
            }));
          }

          if (!isTruncated) {
            activeDiscoveryCallbacks.current.delete(discoveryId);
          }
        });

        try {
          await window.electronAPI.s3.streamFolderDiscovery(
            discoveryId,
            activeProfile,
            selectedBucket,
            item.key
          );
        } catch (err: any) {
          console.error('Failed to stream folder discovery:', item.key, err);
        }
      }

      setDiscoveryState((prev) => ({ ...prev, isActive: false }));
    }
  };

  const handleCancelTransfer = (id: string) => {
    activeTaskIds.current.delete(id);
    activeTaskStartTimes.current.delete(id);
    updateTask(id, (t) => ({ ...t, status: 'cancelled', speed: 'Отменено' }));
    setTimeout(pumpQueue, 0);
  };

  const handleCancelAllTransfers = () => {
    activeTaskIds.current.clear();
    activeTaskStartTimes.current.clear();
    const next = transfersRef.current.map((t) =>
      t.status === 'in_progress' || t.status === 'queued' || t.status === 'pending'
        ? { ...t, status: 'cancelled' as const, speed: 'Отменено' }
        : t
    );
    transfersRef.current = next;
    scheduleTransfersStateUpdate(true);
  };

  const handleResumeTransfer = (id: string) => {
    nextQueueIndexRef.current = 0;
    updateTask(id, (t) => ({
      ...t,
      status: 'queued',
      error: undefined,
      speed: '',
      progress: 0,
      transferredBytes: 0,
      speedBytesPerSec: 0,
    }));
    setTimeout(pumpQueue, 0);
  };

  const handleStartAll = () => {
    nextQueueIndexRef.current = 0;
    const next = transfersRef.current.map((t) =>
      t.status === 'cancelled' || t.status === 'error'
        ? {
            ...t,
            status: 'queued' as const,
            error: undefined,
            speed: '',
            progress: 0,
            transferredBytes: 0,
            speedBytesPerSec: 0,
          }
        : t
    );
    transfersRef.current = next;
    scheduleTransfersStateUpdate(true);
    setTimeout(pumpQueue, 0);
  };

  const handleRestartAll = () => {
    activeTaskIds.current.clear();
    activeTaskStartTimes.current.clear();
    nextQueueIndexRef.current = 0;
    const next = transfersRef.current.map((t) => ({
      ...t,
      status: 'queued' as const,
      error: undefined,
      speed: '',
      progress: 0,
      transferredBytes: 0,
      speedBytesPerSec: 0,
    }));
    transfersRef.current = next;
    scheduleTransfersStateUpdate(true);
    setTimeout(pumpQueue, 0);
  };

  const handleClearCompleted = () => {
    const next = transfersRef.current.filter((t) => t.status !== 'completed');
    taskIndexMap.current.clear();
    next.forEach((t, i) => taskIndexMap.current.set(t.id, i));
    nextQueueIndexRef.current = 0;
    transfersRef.current = next;
    scheduleTransfersStateUpdate(true);
  };

  const handleChangeConcurrency = (threads: number) => {
    setSettings((prev) => {
      const updated = { ...prev, transferConcurrency: threads };
      settingsRef.current = updated;
      return updated;
    });
    setTimeout(pumpQueue, 0);
  };

  // Handle Open in External App (Edit-in-Place)
  const handleOpenExternal = async (item: S3Item) => {
    if (!activeProfile || !selectedBucket) return;
    try {
      const res = await window.electronAPI.s3.openExternal(
        activeProfile,
        selectedBucket,
        item.key,
        isProActive // Pro feature: auto-watch for changes!
      );
      if (!res.success && res.error) {
        alert(`Не удалось открыть файл: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Ошибка открытия файла: ${err.message}`);
    }
  };

  // Save back from watcher (Edit-in-Place save)
  const handleSaveWatcherFile = async (bucket: string, key: string) => {
    try {
      setIsSavingWatcher(true);
      await window.electronAPI.watcher.saveBackToS3(bucket, key);
      setWatcherEvent(null);
      if (bucket === selectedBucket) {
        await loadObjects();
      }
    } catch (err: any) {
      alert(`Ошибка сохранения в S3: ${err.message}`);
    } finally {
      setIsSavingWatcher(false);
    }
  };

  // Handle Preview (routes to right drawer for all file types)
  const handlePreviewItem = (item: S3Item) => {
    setPreviewItem(item);
  };

  // Handle path entered into Breadcrumbs address bar
  const handleApplyNavigationPath = async (inputPath: string) => {
    if (!activeProfile) return;
    const raw = inputPath.trim();
    if (!raw) {
      setCurrentPrefix('');
      return;
    }

    const clean = raw.replace(/^s3:\/\//i, '').replace(/^\/+/, '');
    if (!clean) {
      setCurrentPrefix('');
      return;
    }

    const segments = clean.split('/').filter(Boolean);
    if (segments.length === 0) {
      setCurrentPrefix('');
      return;
    }

    const firstSegment = segments[0];
    const isFirstSegmentBucket =
      firstSegment === selectedBucket || buckets.some((b) => b.name === firstSegment);

    let targetBucket = selectedBucket;
    let targetKey = '';

    if (isFirstSegmentBucket) {
      targetBucket = firstSegment;
      targetKey = segments.slice(1).join('/');
    } else {
      targetKey = segments.join('/');
    }

    const isExplicitFolder = raw.endsWith('/');

    if (!isExplicitFolder && targetKey) {
      try {
        const fileItem = await window.electronAPI.s3.headObject(
          activeProfile,
          targetBucket,
          targetKey
        );
        if (fileItem && !fileItem.isPrefix) {
          // It's an existing file! Open its containing parent folder and show its preview drawer
          const lastSlash = targetKey.lastIndexOf('/');
          const parentPrefix = lastSlash >= 0 ? targetKey.substring(0, lastSlash + 1) : '';

          if (targetBucket !== selectedBucket) {
            setSelectedBucket(targetBucket);
          }
          setCurrentPrefix(parentPrefix);
          setPreviewItem(fileItem);
          return;
        }
      } catch (err) {
        console.warn('headObject failed, navigating as folder:', err);
      }
    }

    // It's a folder or does not exist as a file: navigate as folder
    const folderPrefix = targetKey ? (targetKey.endsWith('/') ? targetKey : `${targetKey}/`) : '';
    if (targetBucket !== selectedBucket) {
      setSelectedBucket(targetBucket);
    }
    setCurrentPrefix(folderPrefix);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 1. Left Vertical Icon Rail (Plane.so) */}
      <IconRail
        activeTab={activeTab}
        canAdminMinio={permissions.canAdminMinio}
        onSelectTab={(tab) => {
          if (tab === 'admin') {
            if (!permissions.canAdminMinio) return;
            if (!isProActive) {
              setIsProModalOpen(true);
              return;
            }
          }
          setActiveTab(tab);
          if (tab === 'transfers' || tab === 'admin') {
            setPreviewItem(null);
            setPreviewingPdfItem(null);
          }
        }}
        activeTransferCount={
          transfers.filter((t) => t.status === 'in_progress' || t.status === 'pending').length
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        theme={settings.theme === 'light' ? 'light' : 'dark'}
        onToggleTheme={toggleTheme}
        onOpenProModal={() => setIsProModalOpen(true)}
        isProActive={isProActive}
        licenseStatus={licenseStatus}
        isElectron={isElectronApp}
        onWebLogout={!isElectronApp && webPinRequired ? handleWebLogout : undefined}
      />

      {/* 2. Main Area: Storage View OR Transfers View */}
      {activeTab === 'storage' ? (
        <>
          {/* Secondary Sidebar (Plane.so Project/Bucket Tree) */}
          <Sidebar
            profiles={profiles}
            activeProfile={activeProfile}
            buckets={buckets}
            selectedBucket={selectedBucket}
            onSelectBucket={(b) => {
              setSelectedBucket(b);
              setCurrentPrefix('');
              setIsMobileSidebarOpen(false);
              setActiveTab('storage');
            }}
            onSelectProfile={handleSelectProfile}
            onOpenNewProfileModal={() => {
              setEditingProfile(null);
              setIsProfileModalOpen(true);
            }}
            onOpenEditProfileModal={(p) => {
              setEditingProfile(p);
              setIsProfileModalOpen(true);
            }}
            onDeleteProfile={handleDeleteProfile}
            onRefreshBuckets={() => activeProfile && loadBuckets(activeProfile)}
            onOpenCreateBucketModal={() => setIsCreateBucketOpen(true)}
            onDeleteBucket={handleDeleteBucket}
            onRenameBucket={(b) => setRenamingBucket(b)}
            isProActive={isProActive}
            licenseStatus={licenseStatus}
            onOpenProModal={() => setIsProModalOpen(true)}
            isMobileOpen={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
            isServerAvailable={isServerAvailable}
            canCreateBucket={permissions.canCreateBucket}
            canDeleteBucket={permissions.canDeleteBucket}
            roleName={permissions.roleName}
          />

          {/* Main Content Pane */}
          <div className="flex-1 flex flex-col h-full overflow-hidden pb-14 md:pb-0">
            {/* Navigation Breadcrumbs */}
            <Breadcrumbs
              bucket={selectedBucket}
              prefix={currentPrefix}
              buckets={buckets}
              onNavigate={(newPrefix) => setCurrentPrefix(newPrefix)}
              onApplyPath={handleApplyNavigationPath}
              onSelectBucket={(b) => {
                setSelectedBucket(b);
                setCurrentPrefix('');
              }}
              onRootClick={() => setCurrentPrefix('')}
              onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
            />

            {/* Central Object Browser */}
            {selectedBucket ? (
              <ObjectBrowser
                items={items}
                bucket={selectedBucket}
                prefix={currentPrefix}
                profile={activeProfile}
                loading={loadingItems}
                onRefresh={loadObjects}
                onOpenFolder={(folderKey) => setCurrentPrefix(folderKey)}
                onPreview={handlePreviewItem}
                onDownloadItem={handleDownloadItem}
                onOpenExternal={handleOpenExternal}
                onPresignedUrl={(item) => setPresignedItem(item)}
                onOpenMonaco={handleOpenMonaco}
                onOpenPdf={(item) => setPreviewingPdfItem(item)}
                onOpenGallery={(item) => setGalleryItem(item)}
                onDeleteItems={handleDeleteItems}
                onDownloadSelected={handleDownloadMultiple}
                onCreateFolderClick={() => setIsCreateFolderOpen(true)}
                onUploadFilesClick={handleUploadFiles}
                onUploadFolderClick={handleUploadFolder}
                onFilesDropped={handleFilesUploadProcess}
                transferSummary={transferSummary}
                onOpenTransfers={() => setActiveTab('transfers')}
                permissions={permissions}
                isProActive={isProActive}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Layers className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-xs mb-3">Выберите бакет для просмотра объектов</p>
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="md:hidden px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg shadow-xs flex items-center space-x-1.5"
                >
                  <Layers className="w-4 h-4" />
                  <span>Выбрать бакет</span>
                </button>
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'transfers' ? (
        /* Full Workspace Transfers Queue Table View */
        <div className="flex-1 flex flex-col h-full overflow-hidden pb-14 md:pb-0">
          <TransferQueue
            transfers={transfers}
            discoveryState={discoveryState}
            transferConcurrency={settings.transferConcurrency || 4}
            onChangeConcurrency={handleChangeConcurrency}
            onClearCompleted={handleClearCompleted}
            onCancelTransfer={handleCancelTransfer}
            onCancelAll={handleCancelAllTransfers}
            onStartAll={handleStartAll}
            onRestartAll={handleRestartAll}
            onResumeTransfer={handleResumeTransfer}
            onGoToStorage={() => setActiveTab('storage')}
          />
        </div>
      ) : (
        /* MinIO Server & Storage Admin Dashboard */
        <div className="flex-1 flex flex-col h-full overflow-hidden pb-14 md:pb-0">
          <MinioAdminDashboard
            profile={activeProfile}
            buckets={buckets}
            theme={settings.theme === 'light' ? 'light' : 'dark'}
            onGoToStorage={() => setActiveTab('storage')}
            onSelectBucket={(bName) => {
              setSelectedBucket(bName);
              setActiveTab('storage');
            }}
            onOpenCreateBucket={() => setIsCreateBucketOpen(true)}
            onRefreshBuckets={() => activeProfile && loadBuckets(activeProfile)}
            onDeleteBucket={handleDeleteBucket}
            onDeleteProfile={handleDeleteProfile}
            isProActive={isProActive}
            onOpenProModal={() => setIsProModalOpen(true)}
            permissions={permissions}
          />
        </div>
      )}

      {/* 3. Mobile Bottom Navigation Bar (md:hidden) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-plane-surface/95 backdrop-blur-md border-t border-border flex items-center justify-around h-14 px-2 select-none">
        {/* Files / Storage Tab */}
        <button
          onClick={() => {
            setActiveTab('storage');
            setIsMobileSidebarOpen(false);
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'storage' && !isSettingsOpen
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Database className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Файлы</span>
        </button>

        {/* Transfers Queue Tab */}
        <button
          onClick={() => {
            setActiveTab('transfers');
            setIsMobileSidebarOpen(false);
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors relative ${
            activeTab === 'transfers' && !isSettingsOpen
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="relative">
            <ArrowDownUp className="w-5 h-5 mb-0.5" />
            {transfers.filter((t) => t.status === 'in_progress' || t.status === 'pending').length > 0 && (
              <span className="absolute -top-1 -right-2.5 w-4 h-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {transfers.filter((t) => t.status === 'in_progress' || t.status === 'pending').length}
              </span>
            )}
          </div>
          <span className="text-[10px]">Очередь</span>
        </button>

        {/* Server Admin Tab */}
        {permissions.canAdminMinio && (
          <button
            onClick={() => {
              if (!isProActive) {
                setIsProModalOpen(true);
              } else {
                setActiveTab('admin');
              }
              setIsMobileSidebarOpen(false);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
              activeTab === 'admin' && !isSettingsOpen
                ? 'text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Server className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Сервер</span>
          </button>
        )}

        {/* Settings Tab */}
        <button
          onClick={() => {
            setIsSettingsOpen(true);
            setIsMobileSidebarOpen(false);
          }}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            isSettingsOpen
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Настройки</span>
        </button>
      </nav>

      {/* Modals & Overlays */}
      <CreateBucketModal
        isOpen={isCreateBucketOpen}
        onClose={() => setIsCreateBucketOpen(false)}
        onCreate={handleCreateBucket}
      />

      <RenameBucketModal
        isOpen={Boolean(renamingBucket)}
        bucket={renamingBucket}
        onClose={() => setRenamingBucket(null)}
        onRename={handleRenameBucket}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
        initialProfile={editingProfile}
        isElectron={isElectronApp}
        allowedUrls={webAllowedUrls}
      />

      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        onCreate={handleCreateFolder}
        currentPrefix={currentPrefix}
      />

      {presignedItem && activeProfile && (
        <PresignedUrlModal
          isOpen={Boolean(presignedItem)}
          onClose={() => setPresignedItem(null)}
          profile={activeProfile}
          bucket={selectedBucket}
          itemKey={presignedItem.key}
        />
      )}

      <PreviewDrawer
        isOpen={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        item={previewItem}
        profile={activeProfile}
        bucket={selectedBucket}
        onDownload={handleDownloadItem}
        onOpenExternal={handleOpenExternal}
        onPresignedUrl={(item) => setPresignedItem(item)}
        onOpenMonaco={handleOpenMonaco}
        onOpenPdf={(item) => setPreviewingPdfItem(item)}
        onOpenGallery={(item) => setGalleryItem(item)}
        canEditTags={permissions.canEditTags}
        isProActive={isProActive}
      />

      {/* Monaco Editor Modal */}
      <MonacoEditorModal
        isOpen={Boolean(editingMonacoItem)}
        onClose={() => setEditingMonacoItem(null)}
        item={editingMonacoItem}
        profile={activeProfile}
        bucket={selectedBucket}
        theme={settings.theme === 'light' ? 'light' : 'dark'}
        onFileSaved={loadObjects}
        isProActive={isProActive}
        onOpenProModal={() => setIsProModalOpen(true)}
      />

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={Boolean(previewingPdfItem)}
        onClose={() => setPreviewingPdfItem(null)}
        item={previewingPdfItem}
        profile={activeProfile}
        bucket={selectedBucket}
        onDownload={handleDownloadItem}
        onOpenExternal={handleOpenExternal}
      />

      {/* Image Gallery Modal */}
      <ImageGalleryModal
        isOpen={Boolean(galleryItem)}
        onClose={() => setGalleryItem(null)}
        items={items}
        initialItem={galleryItem}
        profile={activeProfile}
        bucket={selectedBucket}
        onDownload={handleDownloadItem}
      />

      {/* Edit-in-Place notification banner */}
      <EditInPlaceNotification
        event={watcherEvent}
        onSave={handleSaveWatcherFile}
        onDismiss={() => setWatcherEvent(null)}
        isSaving={isSavingWatcher}
      />

      {/* Pro Trial modal */}
      <ProTrialModal
        isOpen={isProModalOpen}
        onClose={() => setIsProModalOpen(false)}
        licenseStatus={licenseStatus}
        onRefreshLicense={refreshLicenseStatus}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings(newSettings)}
        isProActive={isProActive}
        licenseStatus={licenseStatus}
        onTogglePro={() => setIsProModalOpen(true)}
        isElectron={isElectronApp}
        webServerStatus={isElectronApp ? webServerStatus : null}
        onRefreshWebServerStatus={refreshWebServerStatus}
        profiles={profiles}
      />

      {/* Toast Notification for starting transfers */}
      {downloadToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-start space-x-3 bg-plane-surface border border-border shadow-2xl rounded-xl p-3.5 max-w-sm text-foreground select-none animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-0.5">
            <ArrowDown className="w-4 h-4 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="text-xs font-semibold text-foreground">{downloadToast.title}</h4>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={downloadToast.message}>
              {downloadToast.message}
            </p>
            {downloadToast.subMessage && (
              <p className="text-[10px] text-muted-foreground/75 font-mono mt-0.5">
                {downloadToast.subMessage}
              </p>
            )}
            <button
              onClick={() => {
                setDownloadToast(null);
                setActiveTab('transfers');
              }}
              className="mt-2 text-[11px] font-medium text-primary hover:text-primary-hover flex items-center space-x-1 transition-colors"
            >
              <span>Открыть очередь</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={() => setDownloadToast(null)}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors -mr-1 -mt-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Web Banking PIN Protection Screen */}
      {!isElectronApp && webPinRequired && !isWebAuthenticated && (
        <WebPinModal
          onAuthenticated={(_token, allowed) => {
            setIsWebAuthenticated(true);
            if (allowed && allowed.length > 0) {
              setWebAllowedUrls(allowed);
            }
          }}
        />
      )}
    </div>
  );
};
export default App;
