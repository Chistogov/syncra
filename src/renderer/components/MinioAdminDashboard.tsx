import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { IAMPolicyEditor } from './IAMPolicyEditor';
import {
  HardDrive,
  Users,
  Shield,
  Layers,
  RefreshCw,
  Server,
  Plus,
  Key,
  Trash2,
  CheckCircle2,
  LogOut,
  Sparkles,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Search,
  Lock,
  Unlock,
  ShieldCheck,
  ChevronRight,
  Database,
  Info,
  Clock,
  Activity,
  FolderGit2,
  X,
  FileCode,
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Edit3,
  LayoutGrid,
  List,
  Box,
  Cpu,
  ExternalLink,
  BarChart2,
  PieChart,
  Settings,
  Globe,
  Code,
  Radio,
  FileText,
  Download,
  Upload,
  Minimize2,
} from 'lucide-react';
import {
  S3Profile,
  S3Bucket,
  MinioClusterInfo,
  MinioDriveInfo,
  MinioUser,
  MinioGroup,
  MinioPolicy,
  MinioBucketStat,
  MinioCompressionConfig,
  UserPermissions,
} from '../../common/types';
import {
  formatBytes,
  formatDuration,
  formatUptimeHuman,
  formatCompactNumber,
  formatDate,
} from '../utils/formatters';
import { useConfirm, useAlert } from '../context/ConfirmContext';

const SYSTEM_POLICY_ORDER = ['readwrite', 'readonly', 'writeonly', 'diagnostics', 'consoleAdmin'];

const sortPolicies = (list: MinioPolicy[]): MinioPolicy[] => {
  return [...list].sort((a, b) => {
    const idxA = SYSTEM_POLICY_ORDER.indexOf(a.name);
    const idxB = SYSTEM_POLICY_ORDER.indexOf(b.name);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
};

const DonutMeter: React.FC<{
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  centerText?: React.ReactNode;
}> = ({ percent, size = 90, strokeWidth = 10, color = 'rgb(14 165 233)', centerText }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(100, Math.max(0, isNaN(percent) ? 0 : percent));
  const offset = circumference - (clampedPercent / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {centerText && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 pointer-events-none">
          {centerText}
        </div>
      )}
    </div>
  );
};

interface MinioAdminDashboardProps {
  profile: S3Profile | null;
  buckets: S3Bucket[];
  theme: 'dark' | 'light';
  onGoToStorage: () => void;
  onSelectBucket?: (bucketName: string) => void;
  onOpenCreateBucket?: () => void;
  onRefreshBuckets?: () => void;
  onDeleteBucket?: (bucketName: string) => void;
  onDeleteProfile?: (profileId: string) => Promise<boolean> | void;
  isProActive?: boolean;
  onOpenProModal?: () => void;
  permissions?: UserPermissions;
}

export const MinioAdminDashboard: React.FC<MinioAdminDashboardProps> = ({
  profile,
  buckets,
  theme,
  onGoToStorage,
  onSelectBucket,
  onOpenCreateBucket,
  onRefreshBuckets,
  onDeleteBucket,
  onDeleteProfile,
  isProActive = true,
  onOpenProModal,
  permissions,
}) => {
  const canAdminMinio = permissions?.canAdminMinio ?? true;
  const canManageUsers = permissions?.canManageUsers ?? true;
  const canManageRoles = permissions?.canManageRoles ?? true;
  const canManagePolicies = permissions?.canManagePolicies ?? true;
  const confirm = useConfirm();
  const showAlert = useAlert();
  const [activeSubTab, setActiveSubTab] = useState<'metrics' | 'buckets' | 'users' | 'groups' | 'policies' | 'config'>('metrics');
  const [metricsSubTab, setMetricsSubTab] = useState<'info' | 'usage' | 'resources'>('info');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Configuration Tab state (Matching MinIO Console)
  const [activeConfigSection, setActiveConfigSection] = useState<
    'region' | 'compression' | 'scanner'
  >('compression');
  const [compressionConfig, setCompressionConfig] = useState<MinioCompressionConfig>({
    enable: false,
    allow_encryption: false,
    extensions: ['.txt', '.log', '.csv', '.json', '.tar', '.xml', '.bin'],
    mime_types: ['text/*', 'application/json', 'application/xml', 'binary/octet-stream'],
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [newExtensionInput, setNewExtensionInput] = useState('');
  const [newMimeInput, setNewMimeInput] = useState('');
  const [regionInput, setRegionInput] = useState(profile?.region || 'us-east-1');
  const [scannerSpeedInput, setScannerSpeedInput] = useState('default');
  const configFileInputRef = useRef<HTMLInputElement>(null);

  // Cluster & Drives state
  const [clusterInfo, setClusterInfo] = useState<MinioClusterInfo | null>(null);

  // Buckets state with persistent caching
  const [bucketStats, setBucketStats] = useState<Record<string, MinioBucketStat>>(() => {
    if (profile?.id) {
      try {
        const cached = localStorage.getItem(`s3_bucket_stats_${profile.id}`);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return {};
  });
  const [loadingBuckets, setLoadingBuckets] = useState<Record<string, boolean>>({});
  const [loadingBucketStats, setLoadingBucketStats] = useState(false);
  const isFetchingStatsRef = useRef(false);
  const [bucketSearchQuery, setBucketSearchQuery] = useState('');
  const [bucketViewMode, setBucketViewMode] = useState<'grid' | 'list'>('grid');
  const [bucketDetailView, setBucketDetailView] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<MinioUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newAccessKey, setNewAccessKey] = useState('');
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newUserPolicy, setNewUserPolicy] = useState('readwrite');
  const [editingPasswordUser, setEditingPasswordUser] = useState<string | null>(null);
  const [changePasswordVal, setChangePasswordVal] = useState('');

  // Groups state
  const [groups, setGroups] = useState<MinioGroup[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const [groupFormName, setGroupFormName] = useState('');
  const [groupFormSelectedMembers, setGroupFormSelectedMembers] = useState<string[]>([]);
  const [groupFormPolicy, setGroupFormPolicy] = useState('');
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  // Policies state
  const [policies, setPolicies] = useState<MinioPolicy[]>([]);
  const [selectedPolicyName, setSelectedPolicyName] = useState<string | null>(null);
  const [policyEditorContent, setPolicyEditorContent] = useState<string>('');
  const [isLoadingPolicyContent, setIsLoadingPolicyContent] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isCreatePolicyOpen, setIsCreatePolicyOpen] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyJson, setNewPolicyJson] = useState(
    JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:*'],
            Resource: ['arn:aws:s3:::*'],
          },
        ],
      },
      null,
      2
    )
  );

  // Bucket Settings state
  const [selectedBucketName, setSelectedBucketName] = useState<string>(buckets[0]?.name || '');
  const [bucketVersioning, setBucketVersioning] = useState<'Enabled' | 'Suspended' | 'None'>('None');
  const [bucketPolicyContent, setBucketPolicyContent] = useState<string>('');
  const [loadingBucketSettings, setLoadingBucketSettings] = useState(false);
  const [isSavingBucketPolicy, setIsSavingBucketPolicy] = useState(false);

  // Clear success notification after 4 seconds
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // Load Cluster Info
  const loadClusterInfo = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const info = await window.electronAPI.admin.getClusterInfo(profile);
      setClusterInfo(info);
      if (info.error) {
        setErrorMsg(info.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка подключения к MinIO Admin API');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  // Load Users
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!profile) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const uList = await window.electronAPI.admin.listUsers(profile);
      setUsers(Array.isArray(uList) ? uList : []);
    } catch (err: any) {
      console.warn('Failed to load users:', err);
      setUsersError(err.message || 'Ошибка получения списка пользователей');
    } finally {
      setLoadingUsers(false);
    }
  }, [profile]);

  // Load Groups
  const loadGroups = useCallback(async () => {
    if (!profile) return;
    try {
      const gList = await window.electronAPI.admin.listGroups(profile);
      setGroups(Array.isArray(gList) ? gList : []);
    } catch (err: any) {
      console.warn('Failed to load groups:', err);
    }
  }, [profile]);

  // Stable refs for policy document caching and request tracking
  const activePolicyFetchRef = useRef<string | null>(null);
  const policyDocsCacheRef = useRef<Record<string, string>>({});
  const handleSelectPolicyRef = useRef<(p: MinioPolicy) => Promise<void>>(async () => {});

  // Handle policy selection with immediate cache lookup, debounce/request-deduping, and race protection
  const handleSelectPolicy = useCallback(
    async (p: MinioPolicy) => {
      const policyName = p.name;
      setSelectedPolicyName(policyName);
      activePolicyFetchRef.current = policyName;

      // 1. Check memory cache first
      if (policyDocsCacheRef.current[policyName]) {
        setPolicyEditorContent(policyDocsCacheRef.current[policyName]);
        setIsLoadingPolicyContent(false);
        return;
      }

      // 2. Check if pre-loaded in policy object
      if (p.policy && p.policy.trim()) {
        policyDocsCacheRef.current[policyName] = p.policy;
        setPolicyEditorContent(p.policy);
        setIsLoadingPolicyContent(false);
        return;
      }

      // 3. Otherwise fetch from MinIO
      if (!profile) return;
      setIsLoadingPolicyContent(true);
      try {
        const doc = await window.electronAPI.admin.getPolicy(profile, policyName);
        const resolvedDoc = doc && doc.trim() ? doc : '{\n  "Version": "2012-10-17",\n  "Statement": []\n}';
        policyDocsCacheRef.current[policyName] = resolvedDoc;

        // CRITICAL: only set editor content if this policy is STILL the active selection!
        if (activePolicyFetchRef.current === policyName) {
          setPolicyEditorContent(resolvedDoc);
        }
      } catch (err: any) {
        console.warn(`Failed to fetch policy definition for ${policyName}:`, err);
        if (activePolicyFetchRef.current === policyName) {
          setPolicyEditorContent('{\n  "Version": "2012-10-17",\n  "Statement": []\n}');
        }
      } finally {
        if (activePolicyFetchRef.current === policyName) {
          setIsLoadingPolicyContent(false);
        }
      }
    },
    [profile]
  );

  useEffect(() => {
    handleSelectPolicyRef.current = handleSelectPolicy;
  }, [handleSelectPolicy]);

  // Load Policies (stably sorted, depends ONLY on [profile] to prevent loops)
  const loadPolicies = useCallback(
    async (targetPolicyToSelect?: string) => {
      if (!profile) return;
      try {
        const pList = await window.electronAPI.admin.listPolicies(profile);
        const sorted = sortPolicies(pList);
        setPolicies(sorted);

        if (sorted.length > 0) {
          setSelectedPolicyName((currentSelected) => {
            const desired =
              targetPolicyToSelect ||
              (currentSelected && sorted.some((p) => p.name === currentSelected)
                ? currentSelected
                : sorted[0].name);

            const targetPolicy = sorted.find((p) => p.name === desired) || sorted[0];
            handleSelectPolicyRef.current(targetPolicy);
            return desired;
          });
        } else {
          setSelectedPolicyName(null);
          setPolicyEditorContent('');
        }
      } catch (err: any) {
        console.warn('Failed to load policies:', err);
      }
    },
    [profile]
  );

  // Load Bucket Settings
  const loadBucketSettings = useCallback(async (bName: string) => {
    if (!profile || !bName) return;
    setLoadingBucketSettings(true);
    try {
      const [ver, pol] = await Promise.all([
        window.electronAPI.s3.getBucketVersioning(profile, bName),
        window.electronAPI.s3.getBucketPolicy(profile, bName),
      ]);
      setBucketVersioning(ver);
      setBucketPolicyContent(pol ? JSON.stringify(JSON.parse(pol), null, 2) : '');
    } catch (err: any) {
      console.warn('Failed to load bucket settings:', err);
    } finally {
      setLoadingBucketSettings(false);
    }
  }, [profile]);

  // Load cached stats when profile changes
  useEffect(() => {
    if (profile?.id) {
      try {
        const cached = localStorage.getItem(`s3_bucket_stats_${profile.id}`);
        if (cached) {
          setBucketStats(JSON.parse(cached));
        } else {
          setBucketStats({});
        }
      } catch {}
    }
  }, [profile?.id]);

  // Load Buckets Stats with progressive caching and timeout safety
  const loadBucketsStats = useCallback(
    async (force = false) => {
      if (!profile || buckets.length === 0) return;
      if (isFetchingStatsRef.current) return;
      isFetchingStatsRef.current = true;
      setLoadingBucketStats(true);

      const bucketsToFetch = buckets.filter((b) => force || !bucketStats[b.name]);
      if (bucketsToFetch.length === 0 && !force) {
        setLoadingBucketStats(false);
        isFetchingStatsRef.current = false;
        return;
      }

      // Mark only missing/target buckets as loading
      setLoadingBuckets((prev) => {
        const next = { ...prev };
        bucketsToFetch.forEach((b) => {
          next[b.name] = true;
        });
        return next;
      });

      try {
        await Promise.all(
          bucketsToFetch.map(async (b) => {
            try {
              const stat = await window.electronAPI.admin.getBucketStat(profile, b.name);
              setBucketStats((prev) => {
                const next = { ...prev, [b.name]: stat };
                if (profile?.id) {
                  try {
                    localStorage.setItem(`s3_bucket_stats_${profile.id}`, JSON.stringify(next));
                  } catch {}
                }
                return next;
              });
            } catch (err: any) {
              console.warn(`Failed to load stat for bucket ${b.name}:`, err);
              // Ensure we fallback so the card doesn't stay in loading state!
              setBucketStats((prev) => ({
                ...prev,
                [b.name]: prev[b.name] || {
                  name: b.name,
                  size: 0,
                  objectsCount: 0,
                  access: 'R/W',
                  versioning: 'None',
                },
              }));
            } finally {
              setLoadingBuckets((prev) => ({ ...prev, [b.name]: false }));
            }
          })
        );
      } finally {
        isFetchingStatsRef.current = false;
        setLoadingBucketStats(false);
      }
    },
    [profile, buckets, bucketStats]
  );

  // Aggregate bucket stats calculations
  const totalBucketUsage = useMemo(() => {
    return Object.values(bucketStats).reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [bucketStats]);

  const totalBucketObjects = useMemo(() => {
    return Object.values(bucketStats).reduce((acc, curr) => acc + (curr.objectsCount || 0), 0);
  }, [bucketStats]);

  const filteredBuckets = useMemo(() => {
    if (!bucketSearchQuery.trim()) return buckets;
    const q = bucketSearchQuery.toLowerCase();
    return buckets.filter((b) => b.name.toLowerCase().includes(q));
  }, [buckets, bucketSearchQuery]);

  // Initial load
  useEffect(() => {
    loadClusterInfo();
    if (canManageUsers) loadUsers();
    if (canManageRoles) loadGroups();
    if (canManagePolicies) loadPolicies();
  }, [loadClusterInfo, loadUsers, loadGroups, loadPolicies, canManageUsers, canManageRoles, canManagePolicies]);

  // Trigger stats update when buckets list becomes available
  useEffect(() => {
    if (profile && buckets.length > 0) {
      loadBucketsStats();
    }
  }, [profile?.id, buckets.length]);

  useEffect(() => {
    if (selectedBucketName) {
      loadBucketSettings(selectedBucketName);
    }
  }, [selectedBucketName, loadBucketSettings]);

  // Refresh all active data
  const handleRefreshAll = () => {
    loadClusterInfo();
    if (canManageUsers) loadUsers();
    if (canManageRoles) loadGroups();
    if (canManagePolicies) loadPolicies();
    loadBucketsStats(true);
    if (activeSubTab === 'config') loadCompressionConfig();
    if (onRefreshBuckets) onRefreshBuckets();
    if (selectedBucketName) loadBucketSettings(selectedBucketName);
  };

  // Compression Configuration actions
  const [configError, setConfigError] = useState<string | null>(null);

  const loadCompressionConfig = useCallback(async () => {
    if (!profile) return;
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const cfg = await window.electronAPI.admin.getCompressionConfig(profile);
      if (cfg) {
        setCompressionConfig({
          enable: Boolean(cfg.enable),
          allow_encryption: Boolean(cfg.allow_encryption),
          extensions: Array.isArray(cfg.extensions) && cfg.extensions.length > 0
            ? cfg.extensions
            : ['.txt', '.log', '.csv', '.json', '.tar', '.xml', '.bin'],
          mime_types: Array.isArray(cfg.mime_types) && cfg.mime_types.length > 0
            ? cfg.mime_types
            : ['text/*', 'application/json', 'application/xml', 'binary/octet-stream'],
        });
      }
    } catch (err: any) {
      console.warn('Failed to load compression config:', err);
      setConfigError(err.message || 'Ошибка загрузки настроек сжатия');
    } finally {
      setLoadingConfig(false);
    }
  }, [profile]);

  const handleSaveCompressionConfig = async () => {
    if (!profile) return;
    setIsSavingConfig(true);
    try {
      const res = await window.electronAPI.admin.setCompressionConfig(profile, compressionConfig);
      setSuccessMsg(res.message || 'Настройки сжатия успешно сохранены');
      await loadCompressionConfig();
    } catch (err: any) {
      await showAlert(`Ошибка сохранения настроек сжатия: ${err.message}`);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleResetCompressionConfig = async () => {
    if (!profile) return;
    const ok = await confirm({
      title: 'Сброс настроек сжатия',
      message: 'Восстановить настройки сжатия MinIO по умолчанию (Restore Defaults)?',
      confirmText: 'Сбросить',
      cancelText: 'Отмена',
      variant: 'warning',
    });
    if (!ok) return;
    setIsSavingConfig(true);
    try {
      await window.electronAPI.admin.resetCompressionConfig(profile);
      setSuccessMsg('Настройки сжатия сброшены до значений по умолчанию');
      await loadCompressionConfig();
    } catch (err: any) {
      await showAlert(`Ошибка сброса настроек: ${err.message}`);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleExportConfig = async () => {
    if (!profile) return;
    try {
      const exportText = await window.electronAPI.admin.exportConfig(profile);
      const blob = new Blob([exportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `minio_config_${profile.name || 'server'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg('Конфигурация MinIO успешно экспортирована');
    } catch (err: any) {
      await showAlert(`Ошибка экспорта конфигурации: ${err.message}`);
    }
  };

  const handleImportConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const content = reader.result as string;
        await window.electronAPI.admin.importConfig(profile, content);
        setSuccessMsg('Конфигурация MinIO успешно импортирована');
        loadCompressionConfig();
      } catch (err: any) {
        await showAlert(`Ошибка импорта конфигурации: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddExtension = () => {
    let ext = newExtensionInput.trim().toLowerCase();
    if (!ext) return;
    if (!ext.startsWith('.')) ext = `.${ext}`;
    setCompressionConfig((prev) => {
      const list = prev?.extensions || [];
      if (list.includes(ext)) return prev;
      return {
        ...prev,
        extensions: [...list, ext],
      };
    });
    setNewExtensionInput('');
  };

  const handleRemoveExtension = (extToRemove: string) => {
    setCompressionConfig((prev) => ({
      ...prev,
      extensions: (prev?.extensions || []).filter((ext) => ext !== extToRemove),
    }));
  };

  const handleAddMime = () => {
    const mime = newMimeInput.trim().toLowerCase();
    if (!mime) return;
    setCompressionConfig((prev) => {
      const list = prev?.mime_types || [];
      if (list.includes(mime)) return prev;
      return {
        ...prev,
        mime_types: [...list, mime],
      };
    });
    setNewMimeInput('');
  };

  const handleRemoveMime = (mimeToRemove: string) => {
    setCompressionConfig((prev) => ({
      ...prev,
      mime_types: (prev?.mime_types || []).filter((m) => m !== mimeToRemove),
    }));
  };

  // User Actions
  const handleToggleUserStatus = async (user: MinioUser) => {
    if (!profile) return;
    const nextStatus = user.status === 'enabled' ? 'disabled' : 'enabled';
    try {
      await window.electronAPI.admin.setUserStatus(profile, user.accessKey, nextStatus);
      setUsers((prev) =>
        prev.map((u) => (u.accessKey === user.accessKey ? { ...u, status: nextStatus } : u))
      );
      setSuccessMsg(`Статус пользователя ${user.accessKey} изменён на "${nextStatus}"`);
    } catch (err: any) {
      await showAlert(`Ошибка изменения статуса: ${err.message}`);
    }
  };

  const handleDeleteUser = async (accessKey: string) => {
    if (!profile) return;
    const ok = await confirm({
      title: `Удаление пользователя "${accessKey}"`,
      message: `Вы уверены, что хотите удалить пользователя "${accessKey}"? Пользователь потеряет доступ к MinIO.`,
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await window.electronAPI.admin.deleteUser(profile, accessKey);
      setUsers((prev) => prev.filter((u) => u.accessKey !== accessKey));
      setSuccessMsg(`Пользователь ${accessKey} успешно удалён`);
    } catch (err: any) {
      await showAlert(`Ошибка удаления пользователя: ${err.message}`);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newAccessKey || !newSecretKey) return;
    try {
      await window.electronAPI.admin.createUser(
        profile,
        newAccessKey.trim(),
        newSecretKey.trim(),
        newUserPolicy
      );
      setIsCreateUserOpen(false);
      setNewAccessKey('');
      setNewSecretKey('');
      setSuccessMsg(`Пользователь ${newAccessKey} успешно создан`);
      await loadUsers();
    } catch (err: any) {
      await showAlert(`Ошибка создания пользователя: ${err.message}`);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingPasswordUser || !changePasswordVal) return;
    try {
      const targetUser = users.find((u) => u.accessKey === editingPasswordUser);
      await window.electronAPI.admin.createUser(
        profile,
        editingPasswordUser,
        changePasswordVal.trim(),
        targetUser?.policyName
      );
      setEditingPasswordUser(null);
      setChangePasswordVal('');
      setSuccessMsg(`Пароль пользователя ${editingPasswordUser} обновлен`);
    } catch (err: any) {
      await showAlert(`Ошибка смены пароля: ${err.message}`);
    }
  };

  const generateRandomSecret = (setter: (val: string) => void) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
    let res = '';
    for (let i = 0; i < 20; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setter(res);
  };

  // Group Actions
  const handleOpenCreateGroup = () => {
    setEditingGroupName(null);
    setGroupFormName('');
    setGroupFormSelectedMembers([]);
    setGroupFormPolicy('');
    setGroupMemberSearch('');
    setIsCreatingGroup(true);
  };

  const handleOpenEditGroup = (group: MinioGroup) => {
    setEditingGroupName(group.name);
    setGroupFormName(group.name);
    setGroupFormSelectedMembers([...group.members]);
    setGroupFormPolicy(group.policy || '');
    setGroupMemberSearch('');
    setIsCreatingGroup(true);
  };

  const handleToggleGroupStatus = async (group: MinioGroup) => {
    if (!profile) return;
    const nextStatus = group.status === 'enabled' ? 'disabled' : 'enabled';
    try {
      await window.electronAPI.admin.setGroupStatus(profile, group.name, nextStatus);
      setGroups((prev) =>
        prev.map((g) => (g.name === group.name ? { ...g, status: nextStatus } : g))
      );
      setSuccessMsg(`Статус группы "${group.name}" изменён на "${nextStatus}"`);
    } catch (err: any) {
      await showAlert(`Ошибка изменения статуса группы: ${err.message}`);
    }
  };

  const handleDeleteGroup = async (groupName: string) => {
    if (!profile) return;
    const ok = await confirm({
      title: `Удаление группы "${groupName}"`,
      message: `Вы уверены, что хотите удалить группу пользователей "${groupName}"? Пользователи группы потеряют связанные с ней групповые права.`,
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await window.electronAPI.admin.deleteGroup(profile, groupName);
      setSuccessMsg(`Группа "${groupName}" удалена`);
      await loadGroups();
    } catch (err: any) {
      await showAlert(`Ошибка удаления группы: ${err.message}`);
    }
  };

  const handleSaveGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !groupFormName.trim()) return;
    if (groupFormSelectedMembers.length === 0) {
      await showAlert({
        title: 'Внимание',
        message: 'Необходимо выбрать как минимум одного пользователя для состава группы',
        variant: 'warning',
      });
      return;
    }

    setIsSavingGroup(true);
    try {
      await window.electronAPI.admin.createOrUpdateGroup(
        profile,
        groupFormName.trim(),
        groupFormSelectedMembers,
        groupFormPolicy
      );
      setSuccessMsg(`Группа "${groupFormName.trim()}" успешно сохранена`);
      setIsCreatingGroup(false);
      setEditingGroupName(null);
      await loadGroups();
    } catch (err: any) {
      await showAlert(`Ошибка сохранения группы: ${err.message}`);
    } finally {
      setIsSavingGroup(false);
    }
  };

  // Policy Actions
  const handleSavePolicy = async () => {
    if (!profile || !selectedPolicyName) return;
    setIsSavingPolicy(true);
    try {
      // Validate JSON syntax
      JSON.parse(policyEditorContent);
      await window.electronAPI.admin.addPolicy(profile, selectedPolicyName, policyEditorContent);
      setSuccessMsg(`Политика "${selectedPolicyName}" успешно сохранена`);
      policyDocsCacheRef.current[selectedPolicyName] = policyEditorContent;
    } catch (err: any) {
      await showAlert(`Ошибка сохранения политики: ${err.message}`);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handleDeletePolicy = async (name: string) => {
    if (!profile) return;
    if (SYSTEM_POLICY_ORDER.includes(name)) {
      await showAlert({
        title: 'Системная политика',
        message: 'Встроенные системные политики MinIO нельзя удалить',
        variant: 'warning',
      });
      return;
    }
    const ok = await confirm({
      title: `Удаление политики доступа "${name}"`,
      message: `Вы уверены, что хотите удалить политику доступа "${name}"? Это может повлиять на пользователей и группы, к которым она привязана.`,
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await window.electronAPI.admin.deletePolicy(profile, name);
      setSuccessMsg(`Политика "${name}" удалена`);
      delete policyDocsCacheRef.current[name];
      if (selectedPolicyName === name) {
        setSelectedPolicyName(null);
        setPolicyEditorContent('');
      }
      await loadPolicies();
    } catch (err: any) {
      await showAlert(`Ошибка удаления политики: ${err.message}`);
    }
  };

  const handleCreatePolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newPolicyName.trim() || !newPolicyJson.trim()) return;
    const trimmedName = newPolicyName.trim();
    const trimmedJson = newPolicyJson.trim();
    try {
      JSON.parse(trimmedJson);
      await window.electronAPI.admin.addPolicy(profile, trimmedName, trimmedJson);
      policyDocsCacheRef.current[trimmedName] = trimmedJson;
      setIsCreatePolicyOpen(false);
      setNewPolicyName('');
      setSuccessMsg(`Политика "${trimmedName}" успешно создана`);
      await loadPolicies(trimmedName);
    } catch (err: any) {
      await showAlert(`Ошибка создания политики: ${err.message}`);
    }
  };

  // Bucket Settings Actions
  const handleToggleVersioning = async () => {
    if (!profile || !selectedBucketName) return;
    const shouldEnable = bucketVersioning !== 'Enabled';
    try {
      await window.electronAPI.s3.setBucketVersioning(profile, selectedBucketName, shouldEnable);
      setBucketVersioning(shouldEnable ? 'Enabled' : 'Suspended');
      setSuccessMsg(
        `Версионирование бакета "${selectedBucketName}" ${shouldEnable ? 'включено' : 'приостановлено'}`
      );
    } catch (err: any) {
      await showAlert(`Ошибка изменения версионирования: ${err.message}`);
    }
  };

  const handleSaveBucketPolicy = async () => {
    if (!profile || !selectedBucketName) return;
    setIsSavingBucketPolicy(true);
    try {
      if (!bucketPolicyContent.trim()) {
        await window.electronAPI.s3.deleteBucketPolicy(profile, selectedBucketName);
        setSuccessMsg(`Политика бакета "${selectedBucketName}" удалена`);
      } else {
        JSON.parse(bucketPolicyContent);
        await window.electronAPI.s3.setBucketPolicy(profile, selectedBucketName, bucketPolicyContent.trim());
        setSuccessMsg(`Политика бакета "${selectedBucketName}" обновлена`);
      }
    } catch (err: any) {
      await showAlert(`Ошибка сохранения политики бакета: ${err.message}`);
    } finally {
      setIsSavingBucketPolicy(false);
    }
  };

  const handleApplyPublicReadPolicy = () => {
    if (!selectedBucketName) return;
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${selectedBucketName}/*`],
        },
      ],
    };
    setBucketPolicyContent(JSON.stringify(policy, null, 2));
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery) return users;
    const q = userSearchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.accessKey.toLowerCase().includes(q) ||
        (u.policyName && u.policyName.toLowerCase().includes(q))
    );
  }, [users, userSearchQuery]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!groupSearchQuery.trim()) return groups;
    const q = groupSearchQuery.toLowerCase();
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.policy && g.policy.toLowerCase().includes(q)) ||
        g.members.some((m) => m.toLowerCase().includes(q))
    );
  }, [groups, groupSearchQuery]);

  // Filtered members for group creation/edit
  const filteredMembersList = useMemo(() => {
    if (!groupMemberSearch.trim()) return users;
    const q = groupMemberSearch.toLowerCase();
    return users.filter((u) => u.accessKey.toLowerCase().includes(q));
  }, [users, groupMemberSearch]);

  if (!isProActive) {
    return (
      <div className="flex-1 flex flex-col h-full bg-background text-foreground select-none overflow-hidden relative">
        {/* Top Header */}
        <div className="min-h-[56px] md:min-h-[72px] px-3 md:px-6 py-2.5 md:py-4.5 border-b border-border bg-plane-surface/80 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2.5 md:space-x-3.5 min-w-0">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-xs flex-shrink-0">
              <Server className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-semibold text-foreground tracking-tight truncate">
                Управление сервером MinIO
              </h2>
              <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px] sm:max-w-md">
                {profile?.name} • {profile?.endpoint}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 md:space-x-2 flex-shrink-0">
            {onDeleteProfile && profile && (
              <button
                onClick={async () => {
                  const deleted = await onDeleteProfile(profile.id);
                  if (deleted !== false) {
                    onGoToStorage();
                  }
                }}
                className="p-2 md:px-3 md:py-2 rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-medium transition-colors shadow-2xs flex items-center space-x-1.5 whitespace-nowrap"
                title="Отключиться от сервера и удалить параметры подключения"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Отключиться</span>
              </button>
            )}
            <button
              onClick={onGoToStorage}
              className="p-2 md:px-3.5 md:py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-medium transition-colors shadow-2xs flex items-center space-x-1.5 whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">К бакетам</span>
            </button>
          </div>
        </div>

        {/* Locked Screen Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-lg animate-in zoom-in-95 duration-200">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Управление сервером MinIO и IAM доступно в Pro-версии
          </h2>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            В Community Edition доступна базовая работа с файлами и бакетами.
            Мониторинг метрик кластера, накопителей, управление IAM-пользователями, группами и политиками доступа входят в редакцию <strong>Pro Edition</strong>.
          </p>

          <div className="flex items-center space-x-3 mt-6">
            <button
              onClick={onOpenProModal}
              className="px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold shadow-xs flex items-center space-x-2 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Активировать Pro / 14 дней триала</span>
            </button>
            <button
              onClick={onGoToStorage}
              className="px-4 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors border border-border"
            >
              Вернуться к бакетам
            </button>
          </div>
        </div>
      </div>
    );
  }

  const adminNavTabs = [
    {
      id: 'metrics' as const,
      label: 'Метрики',
      icon: BarChart2,
      onClick: () => setActiveSubTab('metrics'),
      visible: canAdminMinio,
    },
    {
      id: 'buckets' as const,
      label: 'Бакеты',
      icon: Layers,
      badge: buckets.length,
      onClick: () => {
        setActiveSubTab('buckets');
        setBucketDetailView(null);
        if (Object.keys(bucketStats).length === 0) {
          loadBucketsStats();
        }
      },
      visible: true,
    },
    {
      id: 'users' as const,
      label: 'Пользователи',
      icon: Users,
      badge: users.length,
      onClick: () => {
        setActiveSubTab('users');
        loadUsers();
      },
      visible: canManageUsers,
    },
    {
      id: 'groups' as const,
      label: 'Группы',
      icon: FolderGit2,
      badge: groups.length,
      onClick: () => {
        setActiveSubTab('groups');
        setIsCreatingGroup(false);
        setEditingGroupName(null);
        loadGroups();
      },
      visible: canManageRoles,
    },
    {
      id: 'policies' as const,
      label: 'Политики IAM',
      icon: Shield,
      badge: policies.length,
      onClick: () => {
        setActiveSubTab('policies');
        loadPolicies();
      },
      visible: canManagePolicies,
    },
    {
      id: 'config' as const,
      label: 'Конфигурация',
      icon: Settings,
      onClick: () => {
        setActiveSubTab('config');
        loadCompressionConfig();
      },
      visible: canAdminMinio,
    },
  ].filter((t) => t.visible !== false);

  useEffect(() => {
    const isCurrentValid = adminNavTabs.some((t) => t.id === activeSubTab);
    if (!isCurrentValid && adminNavTabs.length > 0) {
      setActiveSubTab(adminNavTabs[0].id);
    }
  }, [adminNavTabs, activeSubTab]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background text-foreground select-none overflow-hidden relative">
      {/* Top Header / Sub-Navigation */}
      <div className="min-h-[56px] md:min-h-[72px] px-3 md:px-6 py-2.5 md:py-4.5 border-b border-border bg-plane-surface/80 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2.5 md:space-x-3.5 min-w-0">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs flex-shrink-0">
            <Server className="w-4 h-4 md:w-5 md:h-5" />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center space-x-2 md:space-x-3 h-6">
              <h2 className="text-sm md:text-base font-semibold text-foreground tracking-tight whitespace-nowrap truncate">
                Управление сервером
              </h2>
              {clusterInfo?.isMinio ? (
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[10px] md:text-[11px] font-mono font-medium items-center space-x-1.5 flex-shrink-0 h-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>MinIO {clusterInfo.mode}</span>
                </span>
              ) : (
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 text-[10px] md:text-[11px] font-mono font-medium items-center space-x-1.5 flex-shrink-0 h-5">
                  S3 режим
                </span>
              )}
            </div>
            <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono mt-0.5 h-4 flex items-center whitespace-nowrap truncate max-w-[180px] sm:max-w-md" title={profile?.endpoint}>
              {profile?.name} • {profile?.endpoint}
            </p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center space-x-1.5 md:space-x-2 flex-shrink-0">
          {onDeleteProfile && profile && (
            <button
              onClick={async () => {
                const deleted = await onDeleteProfile(profile.id);
                if (deleted !== false) {
                  onGoToStorage();
                }
              }}
              className="p-2 md:px-3 md:py-2 rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-medium transition-colors shadow-2xs flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0"
              title="Отключиться от сервера и удалить параметры подключения"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Отключиться</span>
            </button>
          )}
          <button
            onClick={handleRefreshAll}
            disabled={loading}
            className="p-2 rounded-lg border border-border bg-plane-surface hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-2xs whitespace-nowrap flex-shrink-0"
            title="Обновить данные"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>
          <button
            onClick={onGoToStorage}
            className="p-2 md:px-3.5 md:py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-medium transition-colors shadow-2xs flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0"
            title="Перейти к списку бакетов"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">К бакетам</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div className="absolute top-20 right-6 z-50 bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-xs animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-2 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2-Columns Body: Stack on mobile, Left Sidebar + Content on desktop */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Mobile Horizontal Navigation Tab Bar (md:hidden) */}
        <div className="md:hidden flex items-center space-x-1.5 overflow-x-auto px-3 py-2 bg-plane-surface border-b border-border no-scrollbar flex-shrink-0">
          {adminNavTabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={tab.onClick}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isSelected
                        ? 'bg-primary-foreground/20 text-primary-foreground font-bold'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Left Sidebar on Desktop */}
        <aside className="hidden md:flex w-64 bg-background border-r border-border flex-col h-full select-none flex-shrink-0 text-foreground">
          {/* Section Header */}
          <div className="px-3 pt-4 pb-2 flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Администрирование
            </span>
          </div>

          {/* Navigation Items List */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
            {adminNavTabs.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={tab.onClick}
                  className={`w-full group flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-accent text-accent-foreground font-semibold shadow-xs'
                      : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'text-primary'
                          : 'text-muted-foreground group-hover:text-foreground/80'
                      }`}
                    />
                    <span className="truncate">{tab.label}</span>
                  </div>
                  {tab.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                        isSelected
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Server Status Widget at Bottom */}
          <div className="p-3 border-t border-border bg-muted/20">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Статус сервера</span>
              <span className="flex items-center space-x-1 text-emerald-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Онлайн</span>
              </span>
            </div>
            <div className="space-y-1 text-[11px] font-mono text-muted-foreground/80">
              <div className="flex justify-between">
                <span>Режим:</span>
                <span className="text-foreground">{clusterInfo?.mode || 'MinIO'}</span>
              </div>
              <div className="flex justify-between">
                <span>Диски:</span>
                <span className="text-foreground">{clusterInfo?.drives?.length || 0} шт.</span>
              </div>
              {clusterInfo?.totalSpace ? (
                <div className="flex justify-between">
                  <span>Объём:</span>
                  <span className="text-foreground">{formatBytes(clusterInfo.totalSpace)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Main Tab Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-6">
        {/* Error / Non-Minio Warning Banner */}
        {errorMsg && activeSubTab !== 'buckets' && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-4 rounded-xl flex items-start space-x-3 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-amber-200">Ограничение доступа к MinIO Admin API</h4>
              <p className="mt-1 text-amber-300/90 leading-relaxed">{errorMsg}</p>
              <p className="mt-2 text-[11px] text-amber-400/80">
                Совет: Убедитесь, что подключены к инстансу MinIO с правами администратора (`consoleAdmin` или `minioadmin`). Стандартные политики бакетов и версионирование по-прежнему доступны на вкладке «Политики бакетов».
              </p>
            </div>
          </div>
        )}

        {/* 1. METRICS DASHBOARD (Matching MinIO Console Screenshot) */}
        {activeSubTab === 'metrics' && (
          <div className="space-y-6">
            {/* Sub-tabs under Metrics header */}
            <div className="flex items-center space-x-1 border-b border-border pb-3">
              <button
                onClick={() => setMetricsSubTab('info')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                  metricsSubTab === 'info'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Сводка</span>
              </button>
              <button
                onClick={() => setMetricsSubTab('usage')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                  metricsSubTab === 'usage'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span>Хранилище</span>
              </button>
              <button
                onClick={() => setMetricsSubTab('resources')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                  metricsSubTab === 'resources'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Ресурсы</span>
              </button>
            </div>

            {/* TAB: Info */}
            {metricsSubTab === 'info' && (
              <div className="space-y-6">
                {/* Header row with Sync button */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center space-x-2">
                    <span>Сведения о сервере</span>
                  </h3>
                  <button
                    onClick={() => {
                      loadClusterInfo();
                      loadBucketsStats();
                    }}
                    disabled={loading}
                    className="px-2.5 py-1 text-xs rounded-lg border border-border bg-plane-surface hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center space-x-1.5 shadow-xs"
                    title="Синхронизировать метрики сервера"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
                    <span>Синхронизировать</span>
                  </button>
                </div>

                {/* 5 KPI Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Card 1: Buckets */}
                  <div className="bg-plane-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground font-medium">Бакеты</span>
                      <div className="text-3xl font-bold font-mono tracking-tight text-foreground mt-2">
                        {clusterInfo?.bucketsCount ?? buckets.length}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveSubTab('buckets');
                        setBucketDetailView(null);
                      }}
                      className="text-xs text-primary hover:underline flex items-center space-x-1 mt-4 group"
                    >
                      <span>Обзор</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>

                  {/* Card 2: Objects */}
                  <div className="bg-plane-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground font-medium">Объекты</span>
                      <div className="text-3xl font-bold font-mono tracking-tight text-foreground mt-2">
                        {formatCompactNumber(clusterInfo?.objectsCount || totalBucketObjects)}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-4">
                      {clusterInfo?.objectsCount
                        ? `${clusterInfo.objectsCount.toLocaleString()} всего`
                        : `${totalBucketObjects.toLocaleString()} в ${buckets.length} бакетах`}
                    </div>
                  </div>

                  {/* Card 3: Reported Usage */}
                  <div className="bg-plane-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs text-muted-foreground font-medium">Используемый объём</span>
                        <div className="text-xl font-bold font-mono tracking-tight text-foreground mt-1">
                          {formatBytes(clusterInfo?.reportedUsage || clusterInfo?.usedSpace || totalBucketUsage || 0)}
                        </div>
                      </div>
                      <DonutMeter
                        size={52}
                        strokeWidth={6}
                        percent={clusterInfo?.percentUsed || 0}
                        color={
                          (clusterInfo?.percentUsed || 0) > 90
                            ? '#f43f5e'
                            : (clusterInfo?.percentUsed || 0) > 75
                            ? '#f59e0b'
                            : '#0284c7'
                        }
                        centerText={
                          <span className="text-[10px] font-bold font-mono text-foreground">
                            {clusterInfo?.percentUsed || 0}%
                          </span>
                        }
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 space-y-0.5 mt-3 pt-2 border-t border-border/50">
                      <div className="flex justify-between">
                        <span>С последнего восстановления:</span>
                        <span className="font-mono text-foreground">н/д</span>
                      </div>
                      <div className="flex justify-between">
                        <span>С последнего сканирования:</span>
                        <span className="font-mono text-foreground">н/д</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Время работы:</span>
                        <span className="font-mono text-foreground">{formatUptimeHuman(clusterInfo?.uptime || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Servers */}
                  <div className="bg-plane-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground font-medium">Серверы</span>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center space-x-2 text-sm font-semibold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>1 в сети</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground/70">
                          <span className="w-2 h-2 rounded-full bg-muted-foreground/40"></span>
                          <span>0 отключено</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-4 truncate" title={clusterInfo?.servers[0]?.endpoint || profile?.endpoint}>
                      {clusterInfo?.servers[0]?.endpoint || profile?.endpoint || '127.0.0.1:9000'}
                    </div>
                  </div>

                  {/* Card 5: Drives */}
                  <div className="bg-plane-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground font-medium">Накопители</span>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center space-x-2 text-sm font-semibold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>{clusterInfo?.onlineDisks ?? clusterInfo?.drives?.length ?? 1} в сети</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground/70">
                          <span className="w-2 h-2 rounded-full bg-muted-foreground/40"></span>
                          <span>{clusterInfo?.offlineDisks ?? 0} отключено</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-4">
                      {clusterInfo?.totalDisks ?? clusterInfo?.drives?.length ?? 1} физ. диск(ов)
                    </div>
                  </div>
                </div>

                {/* Sub-strip below KPI cards (Screenshot 2) */}
                <div className="bg-plane-surface border border-border rounded-xl p-3.5 flex flex-wrap items-center justify-between text-xs text-muted-foreground gap-4 shadow-xs">
                  <div className="flex items-center space-x-2">
                    <span>Тип хранилища:</span>
                    <span className="flex items-center space-x-1.5 font-semibold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{clusterInfo?.backendType || 'Erasure'}</span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>Четность Standard Storage:</span>
                    <span className="font-semibold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                      {clusterInfo?.standardSCParity || 'н/д'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>Четность Reduced Redundancy:</span>
                    <span className="font-semibold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                      {clusterInfo?.rrSCParity || 'н/д'}
                    </span>
                  </div>
                </div>

                {/* Servers Accordion & Drives breakdown (Screenshot 2) */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Серверы ({clusterInfo?.servers?.length || 1})
                  </h3>

                  <div className="bg-plane-surface border border-border rounded-xl overflow-hidden shadow-xs">
                    {/* Server header strip */}
                    <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center space-x-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"></span>
                        <span className="font-semibold font-mono text-foreground">
                          {clusterInfo?.servers[0]?.endpoint || profile?.endpoint || '127.0.0.1:9000'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4 text-muted-foreground flex-wrap">
                        <span className="flex items-center space-x-1 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>{clusterInfo?.onlineDisks ?? clusterInfo?.drives?.length ?? 1}/{clusterInfo?.totalDisks ?? clusterInfo?.drives?.length ?? 1} дисков</span>
                        </span>
                        <span className="flex items-center space-x-1 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>1/1 сеть</span>
                        </span>
                        <span className="font-mono text-foreground">
                          Время работы: {formatUptimeHuman(clusterInfo?.uptime || 0)}
                        </span>
                        <span className="text-muted-foreground font-mono text-[11px]">
                          Версия: {clusterInfo?.version || 'MinIO Server'}
                        </span>
                      </div>
                    </div>

                    {/* Drives section */}
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                          Диски ({clusterInfo?.drives?.length || 1})
                        </h4>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          Свободно: {formatBytes(clusterInfo?.freeSpace || 0)} / Всего: {formatBytes(clusterInfo?.totalSpace || 0)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {clusterInfo?.drives && clusterInfo.drives.length > 0 ? (
                          clusterInfo.drives.map((drive, idx) => (
                            <div
                              key={idx}
                              className="bg-muted/10 border border-border rounded-xl p-4 flex items-center space-x-5 hover:bg-muted/20 transition-colors"
                            >
                              {/* Left Donut gauge */}
                              <DonutMeter
                                size={88}
                                strokeWidth={9}
                                percent={drive.percentUsed}
                                color={
                                  drive.percentUsed > 90
                                    ? '#f43f5e'
                                    : drive.percentUsed > 75
                                    ? '#f59e0b'
                                    : '#0284c7'
                                }
                                centerText={
                                  <div className="leading-tight">
                                    <div className="text-[11px] font-bold font-mono text-foreground">
                                      {formatBytes(drive.usedSpace)}
                                    </div>
                                    <div className="text-[9px] text-muted-foreground">Занято</div>
                                  </div>
                                }
                              />

                              {/* Drive Details */}
                              <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                                <div>
                                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Путь накопителя</div>
                                  <div className="font-mono text-foreground font-medium truncate" title={drive.drivePath}>
                                    {drive.drivePath}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Используемый объём</div>
                                  <div className="font-mono text-foreground">
                                    {formatBytes(drive.usedSpace)} ({drive.percentUsed}% из {formatBytes(drive.totalSpace)})
                                  </div>
                                </div>

                                <div>
                                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Доступный объём</div>
                                  <div className="font-mono text-muted-foreground">
                                    {formatBytes(drive.freeSpace)} ({(100 - drive.percentUsed).toFixed(2)}% из {formatBytes(drive.totalSpace)})
                                  </div>
                                </div>

                                <div className="pt-1 flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Статус диска</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center space-x-1 ${
                                      drive.state === 'ok'
                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        drive.state === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'
                                      }`}
                                    />
                                    <span>{drive.state === 'ok' ? 'В сети' : 'Недоступен'}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 p-6 text-center text-xs text-muted-foreground">
                            Нет доступной информации о накопителях. Подключитесь с правами администратора к MinIO.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Usage */}
            {metricsSubTab === 'usage' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Распределение объёма по бакетам ({buckets.length})
                  </h3>
                  <span className="text-xs text-muted-foreground font-mono">
                    Суммарный объем: {formatBytes(totalBucketUsage)} • Объектов: {totalBucketObjects.toLocaleString()}
                  </span>
                </div>

                <div className="bg-plane-surface border border-border rounded-xl overflow-x-auto shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground bg-muted/10 font-medium">
                        <th className="py-2.5 px-4">Бакет</th>
                        <th className="py-2.5 px-4">Размер</th>
                        <th className="py-2.5 px-4 w-1/3">Доля в хранилище</th>
                        <th className="py-2.5 px-4">Объекты</th>
                        <th className="py-2.5 px-4 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {buckets.map((b) => {
                        const stat = bucketStats[b.name];
                        const bSize = stat ? stat.size : 0;
                        const bObjects = stat ? stat.objectsCount : 0;
                        const pct = totalBucketUsage > 0 ? (bSize / totalBucketUsage) * 100 : 0;

                        return (
                          <tr key={b.name} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4 font-mono font-medium text-foreground flex items-center space-x-2">
                              <Layers className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                              <span>{b.name}</span>
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-foreground">
                              {formatBytes(bSize)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-2">
                                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all duration-500 rounded-full"
                                    style={{ width: `${Math.min(100, Math.max(pct > 0 ? 3 : 0, pct))}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[11px] text-muted-foreground w-12 text-right">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-muted-foreground">
                              {bObjects.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  if (onSelectBucket) onSelectBucket(b.name);
                                }}
                                className="px-2 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors"
                              >
                                Открыть
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: Resources */}
            {metricsSubTab === 'resources' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-plane-surface border border-border rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center space-x-2 text-foreground font-semibold text-xs border-b border-border/60 pb-2">
                    <Cpu className="w-4 h-4 text-primary" />
                    <span>Вычислительные ресурсы MinIO</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Количество ядер CPU:</span>
                      <span className="font-mono font-semibold text-foreground">{clusterInfo?.numCpu || 1}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Архитектура:</span>
                      <span className="font-mono text-foreground">{clusterInfo?.backendType || 'Erasure Coding'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Режим:</span>
                      <span className="font-mono text-foreground">{clusterInfo?.mode || 'online'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Версия:</span>
                      <span className="font-mono text-foreground">{clusterInfo?.version || 'MinIO Server'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-plane-surface border border-border rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center space-x-2 text-foreground font-semibold text-xs border-b border-border/60 pb-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Использование оперативной памяти (Go Runtime)</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Alloc (Выделено):</span>
                      <span className="font-mono font-semibold text-foreground">
                        {clusterInfo?.memStats ? formatBytes(clusterInfo.memStats.Alloc) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">TotalAlloc (Всего выделено):</span>
                      <span className="font-mono text-foreground">
                        {clusterInfo?.memStats ? formatBytes(clusterInfo.memStats.TotalAlloc) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">HeapAlloc (Куча):</span>
                      <span className="font-mono text-foreground">
                        {clusterInfo?.memStats ? formatBytes(clusterInfo.memStats.HeapAlloc) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Frees (Освобождений):</span>
                      <span className="font-mono text-foreground">
                        {clusterInfo?.memStats ? clusterInfo.memStats.Frees.toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. USERS MANAGEMENT TAB */}
        {activeSubTab === 'users' && (
          <div className="bg-plane-surface border border-border rounded-xl overflow-hidden shadow-xs">
            {/* Toolbar */}
            <div className="p-3 sm:p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Поиск по пользователям..."
                    className="w-full pl-8 pr-3 py-1.5 bg-plane-bg border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                  />
                </div>
                <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">
                  Всего: {filteredUsers.length} пользователей
                </span>
                <button
                  type="button"
                  onClick={loadUsers}
                  disabled={loadingUsers}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors"
                  title="Обновить список пользователей"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin text-primary' : ''}`} />
                </button>
              </div>

              {canManageUsers && (
                <button
                  onClick={() => setIsCreateUserOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap self-end sm:self-auto"
                  title="Добавить пользователя"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить пользователя</span>
                </button>
              )}
            </div>

            {usersError && (
              <div className="m-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{usersError}</span>
                </div>
                <button
                  type="button"
                  onClick={loadUsers}
                  disabled={loadingUsers}
                  className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-medium transition-colors"
                >
                  Повторить
                </button>
              </div>
            )}

            {/* Users Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/10 font-medium">
                    <th className="py-2.5 px-4">Пользователь (Access Key)</th>
                    <th className="py-2.5 px-4">Статус</th>
                    <th className="py-2.5 px-4">Политика доступа</th>
                    <th className="py-2.5 px-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <tr key={user.accessKey} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-foreground flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                            {user.accessKey.charAt(0).toUpperCase()}
                          </div>
                          <span>{user.accessKey}</span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleUserStatus(user)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center space-x-1 transition-opacity hover:opacity-80 ${
                              user.status === 'enabled'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                            }`}
                            title="Нажмите, чтобы включить/отключить"
                          >
                            {user.status === 'enabled' ? (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>Активен</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Заблокирован</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">
                          {user.policyName ? (
                            <span className="px-2 py-0.5 rounded bg-muted/60 text-foreground font-semibold">
                              {user.policyName}
                            </span>
                          ) : (
                            <span className="italic text-muted-foreground/60">Нет назначенных политик</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => {
                                setEditingPasswordUser(user.accessKey);
                                setChangePasswordVal('');
                              }}
                              className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium flex items-center space-x-1 transition-colors"
                              title="Сменить пароль / Secret Key"
                            >
                              <Key className="w-3 h-3" />
                              <span>Сменить пароль</span>
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.accessKey)}
                              className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Удалить пользователя"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        {userSearchQuery ? 'Пользователи не найдены' : 'Список пользователей пуст или недоступен'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2.5 GROUPS MANAGEMENT TAB */}
        {activeSubTab === 'groups' && (
          <div>
            {isCreatingGroup ? (
              /* CREATE / EDIT GROUP VIEW (Matching MinIO Console Screenshot) */
              <div className="space-y-4">
                {/* Back button */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setIsCreatingGroup(false);
                      setEditingGroupName(null);
                    }}
                    className="flex items-center space-x-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Группы</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Create/Edit Group Form */}
                  <form
                    onSubmit={handleSaveGroupSubmit}
                    className="lg:col-span-2 space-y-5 bg-plane-surface border border-border rounded-xl p-6 shadow-xs"
                  >
                    <div className="flex items-center space-x-2 text-foreground font-semibold text-sm border-b border-border/60 pb-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                        <Users className="w-4 h-4" />
                      </div>
                      <span>
                        {editingGroupName
                          ? `Редактирование группы: ${editingGroupName}`
                          : 'Создать группу'}
                      </span>
                    </div>

                    {/* Group Name input */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                      <label className="text-xs font-semibold text-foreground">
                        Название группы <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!!editingGroupName}
                        value={groupFormName}
                        onChange={(e) => setGroupFormName(e.target.value)}
                        placeholder="например, developers или qa-team"
                        className="sm:col-span-3 px-3 py-2 bg-plane-bg border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:border-primary disabled:opacity-60"
                      />
                    </div>

                    {/* Group Policy select */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                      <label className="text-xs font-semibold text-foreground">
                        Политика доступа
                      </label>
                      <select
                        value={groupFormPolicy}
                        onChange={(e) => setGroupFormPolicy(e.target.value)}
                        className="sm:col-span-3 px-3 py-2 bg-plane-bg border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="">Без политики (наследуются персональные права)</option>
                        {SYSTEM_POLICY_ORDER.map((sp) => (
                          <option key={sp} value={sp}>
                            {sp} (системная)
                          </option>
                        ))}
                        {policies
                          .filter((p) => !SYSTEM_POLICY_ORDER.includes(p.name))
                          .map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name} (кастомная)
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Edit Members section matching screenshot */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-2 sm:gap-4">
                      <label className="text-xs font-semibold text-foreground pt-2">
                        Состав группы <span className="text-rose-400">*</span>
                      </label>
                      <div className="sm:col-span-3 space-y-3">
                        {/* Search / Filter Users matching screenshot */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            value={groupMemberSearch}
                            onChange={(e) => setGroupMemberSearch(e.target.value)}
                            placeholder="Поиск пользователей..."
                            className="w-full pl-8 pr-3 py-1.5 bg-plane-bg border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                          />
                        </div>

                        {/* Members selection table */}
                        <div className="border border-border rounded-lg overflow-hidden bg-plane-bg">
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold sticky top-0 bg-plane-surface">
                                  <th className="py-2.5 px-3 w-12 text-center">
                                    <input
                                      type="checkbox"
                                      checked={
                                        filteredMembersList.length > 0 &&
                                        filteredMembersList.every((u) =>
                                          groupFormSelectedMembers.includes(u.accessKey)
                                        )
                                      }
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          const toAdd = filteredMembersList.map((u) => u.accessKey);
                                          setGroupFormSelectedMembers((prev) =>
                                            Array.from(new Set([...prev, ...toAdd]))
                                          );
                                        } else {
                                          const toRemove = new Set(
                                            filteredMembersList.map((u) => u.accessKey)
                                          );
                                          setGroupFormSelectedMembers((prev) =>
                                            prev.filter((m) => !toRemove.has(m))
                                          );
                                        }
                                      }}
                                      className="rounded text-primary focus:ring-0 cursor-pointer"
                                      title="Выбрать всех / снять выбор"
                                    />
                                  </th>
                                  <th className="py-2.5 px-3">Пользователь (Access Key)</th>
                                  <th className="py-2.5 px-3 text-right">Статус</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {filteredMembersList.length > 0 ? (
                                  filteredMembersList.map((user) => {
                                    const isChecked = groupFormSelectedMembers.includes(user.accessKey);
                                    return (
                                      <tr
                                        key={user.accessKey}
                                        onClick={() => {
                                          setGroupFormSelectedMembers((prev) =>
                                            isChecked
                                              ? prev.filter((m) => m !== user.accessKey)
                                              : [...prev, user.accessKey]
                                          );
                                        }}
                                        className={`cursor-pointer transition-colors ${
                                          isChecked
                                            ? 'bg-primary/10 hover:bg-primary/15'
                                            : 'hover:bg-muted/30'
                                        }`}
                                      >
                                        <td
                                          className="py-2.5 px-3 text-center"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setGroupFormSelectedMembers((prev) => [
                                                  ...prev,
                                                  user.accessKey,
                                                ]);
                                              } else {
                                                setGroupFormSelectedMembers((prev) =>
                                                  prev.filter((m) => m !== user.accessKey)
                                                );
                                              }
                                            }}
                                            className="rounded text-primary focus:ring-0 cursor-pointer"
                                          />
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                                          {user.accessKey}
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                          <span
                                            className={`text-[10px] px-1.5 py-0.2 rounded font-sans ${
                                              user.status === 'enabled'
                                                ? 'bg-emerald-500/15 text-emerald-400'
                                                : 'bg-rose-500/15 text-rose-400'
                                            }`}
                                          >
                                            {user.status === 'enabled' ? 'Активен' : 'Отключен'}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td
                                      colSpan={3}
                                      className="py-6 text-center text-muted-foreground text-xs"
                                    >
                                      {groupMemberSearch
                                        ? 'Пользователи не найдены'
                                        : 'Список пользователей пуст. Создайте пользователей в разделе "Пользователи".'}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                          <span>
                            Выбрано: {groupFormSelectedMembers.length} из {users.length} пользователей
                          </span>
                          {groupFormSelectedMembers.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setGroupFormSelectedMembers([])}
                              className="text-primary hover:underline"
                            >
                              Снять выбор со всех
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions matching screenshot: Clear, Save */}
                    <div className="pt-4 flex items-center justify-end space-x-2 border-t border-border/60">
                      <button
                        type="button"
                        onClick={() => {
                          setGroupFormSelectedMembers([]);
                          setGroupFormPolicy('');
                          if (!editingGroupName) setGroupFormName('');
                        }}
                        className="px-4 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Сбросить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingGroup(false);
                          setEditingGroupName(null);
                        }}
                        className="px-4 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-medium text-foreground transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={
                          !groupFormName.trim() ||
                          groupFormSelectedMembers.length === 0 ||
                          isSavingGroup
                        }
                        className="px-5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-medium transition-colors shadow-xs flex items-center space-x-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingGroup ? 'Сохранение...' : 'Сохранить'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Right Column: Help Card matching screenshot */}
                  <div className="bg-plane-surface border border-border rounded-xl p-5 shadow-xs space-y-4 self-start">
                    <div className="flex items-center space-x-2 text-foreground font-semibold text-xs border-b border-border/60 pb-3">
                      <HelpCircle className="w-4 h-4 text-primary" />
                      <span>О группах</span>
                    </div>

                    <div className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                      <p>
                        Добавление групп позволяет назначать политики IAM сразу нескольким пользователям одновременно.
                      </p>
                      <p>
                        Пользователи наследуют права доступа к данным и ресурсам через группы, в которые они входят.
                      </p>
                      <p>
                        Один пользователь может состоять в нескольких группах одновременно.
                      </p>
                      <p className="text-[11px] bg-muted/30 p-2.5 rounded-lg border border-border/40">
                        Группы предоставляют удобный способ совместного управления правами для пользователей с общими шаблонами доступа. Клиенты не могут авторизоваться в хранилище от имени группы (группа не является учетной записью).
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border/60 space-y-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                          <Users className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Добавление пользователей в группу</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Выберите пользователей из списка для включения в группу. Эти пользователи автоматически унаследуют назначенную политику.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                          <Shield className="w-3.5 h-3.5 text-primary" />
                          <span>Назначение политик IAM для группы</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Вы можете назначить политику сразу при создании группы или изменить её в любой момент из общего списка групп.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* GROUPS LIST VIEW */
              <div className="bg-plane-surface border border-border rounded-xl overflow-hidden shadow-xs">
                {/* Toolbar */}
                <div className="p-3 sm:p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
                  <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={groupSearchQuery}
                        onChange={(e) => setGroupSearchQuery(e.target.value)}
                        placeholder="Поиск по группам..."
                        className="w-full pl-8 pr-3 py-1.5 bg-plane-bg border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">
                      Всего: {filteredGroups.length} групп
                    </span>
                  </div>

                  {canManageRoles && (
                    <button
                      onClick={handleOpenCreateGroup}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap self-end sm:self-auto"
                      title="Создать группу"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Создать группу</span>
                    </button>
                  )}
                </div>

                {/* Groups Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground bg-muted/10 font-medium">
                        <th className="py-2.5 px-4">Название группы</th>
                        <th className="py-2.5 px-4">Статус</th>
                        <th className="py-2.5 px-4">Участники</th>
                        <th className="py-2.5 px-4">Политика IAM</th>
                        <th className="py-2.5 px-4 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredGroups.length > 0 ? (
                        filteredGroups.map((group) => (
                          <tr key={group.name} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4 font-mono font-medium text-foreground flex items-center space-x-2.5">
                              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
                                <Users className="w-3.5 h-3.5" />
                              </div>
                              <span>{group.name}</span>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleToggleGroupStatus(group)}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center space-x-1 transition-opacity hover:opacity-80 ${
                                  group.status === 'enabled'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                                }`}
                                title="Нажмите, чтобы включить/отключить группу"
                              >
                                {group.status === 'enabled' ? (
                                  <>
                                    <Unlock className="w-3 h-3" />
                                    <span>Активна</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3 h-3" />
                                    <span>Отключена</span>
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground font-semibold">
                                  {group.members.length} уч.
                                </span>
                                {group.members.slice(0, 3).map((m) => (
                                  <span
                                    key={m}
                                    className="px-1.5 py-0.2 rounded bg-muted/60 text-[10px] font-mono text-foreground"
                                  >
                                    {m}
                                  </span>
                                ))}
                                {group.members.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{group.members.length - 3} ещё
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-muted-foreground">
                              {group.policy ? (
                                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold text-[11px]">
                                  {group.policy}
                                </span>
                              ) : (
                                <span className="italic text-muted-foreground/60 text-[11px]">
                                  Без политики
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => handleOpenEditGroup(group)}
                                  className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium flex items-center space-x-1 transition-colors"
                                  title="Редактировать состав группы и политику"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Изменить</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteGroup(group.name)}
                                  className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                  title="Удалить группу"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            {groupSearchQuery
                              ? 'Группы не найдены'
                              : 'Список групп пуст. Нажмите "Создать группу" для объединения пользователей.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. IAM POLICIES TAB */}
        {activeSubTab === 'policies' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 min-h-[500px] md:h-[640px]">
            {/* Policies List Sidebar */}
            <div className="bg-plane-surface border border-border rounded-xl overflow-hidden flex flex-col h-60 md:h-full shadow-xs">
              <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/20">
                <span className="text-xs font-semibold text-foreground">Политики MinIO ({policies.length})</span>
                {canManagePolicies && (
                  <button
                    onClick={() => setIsCreatePolicyOpen(true)}
                    className="p-1 rounded bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
                    title="Создать новую политику"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-border">
                {policies.map((p) => {
                  const isSelected = selectedPolicyName === p.name;
                  const isSystem = SYSTEM_POLICY_ORDER.includes(p.name);
                  return (
                    <div
                      key={p.name}
                      onClick={() => handleSelectPolicy(p)}
                      className={`p-3 text-xs cursor-pointer transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-primary/10 border-l-2 border-primary text-foreground font-medium'
                          : 'hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Shield className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-primary' : ''}`} />
                        <span className="font-mono truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        {isSystem ? (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-muted/60 text-muted-foreground font-sans">
                            система
                          </span>
                        ) : canManagePolicies ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePolicy(p.name);
                            }}
                            className="p-1 text-muted-foreground hover:text-rose-400 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        ) : null}
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dual Mode IAM Policy Editor */}
            <div className="md:col-span-2 flex flex-col min-h-[420px] md:h-full space-y-3">
              <div className="bg-plane-surface border border-border rounded-xl px-4 py-2.5 flex items-center justify-between shadow-xs">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold font-mono text-foreground">
                    {selectedPolicyName || 'Выберите политику'}
                  </span>
                  {SYSTEM_POLICY_ORDER.includes(selectedPolicyName || '') && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-sans">
                      Встроенная политика
                    </span>
                  )}
                  {isLoadingPolicyContent && (
                    <RefreshCw className="w-3 h-3 text-primary animate-spin" />
                  )}
                </div>
                <button
                  onClick={handleSavePolicy}
                  disabled={!selectedPolicyName || isSavingPolicy || isLoadingPolicyContent}
                  className="px-3 py-1 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-medium rounded-md transition-colors flex items-center space-x-1 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingPolicy ? 'Сохранение...' : 'Сохранить изменения'}</span>
                </button>
              </div>

              <div className="flex-1 overflow-hidden min-h-0 relative">
                {isLoadingPolicyContent && (
                  <div className="absolute inset-0 bg-plane-surface/50 backdrop-blur-[1px] z-10 flex items-center justify-center space-x-2 text-xs text-muted-foreground">
                    <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                    <span>Загрузка данных политики...</span>
                  </div>
                )}
                <IAMPolicyEditor
                  value={policyEditorContent}
                  onChange={setPolicyEditorContent}
                  buckets={buckets}
                  theme={theme}
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. BUCKETS VIEW & POLICIES (Matching MinIO Console Screenshot) */}
        {activeSubTab === 'buckets' && (
          <div>
            {bucketDetailView === null ? (
              /* ALL BUCKETS LIST / GRID VIEW */
              <div className="space-y-4">
                {/* Top Bar matching MinIO Console Buckets header */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Бакеты ({buckets.length})
                    </h3>
                    {loadingBucketStats && (
                      <span className="flex items-center space-x-1.5 text-xs text-muted-foreground">
                        <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                        <span>Подсчёт статистики...</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Search Buckets Input */}
                    <div className="relative w-56 sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={bucketSearchQuery}
                        onChange={(e) => setBucketSearchQuery(e.target.value)}
                        placeholder="Поиск бакетов..."
                        className="w-full pl-8 pr-7 py-1.5 bg-plane-surface border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary shadow-xs"
                      />
                      {bucketSearchQuery && (
                        <button
                          onClick={() => setBucketSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Grid / List Mode Toggle */}
                    <div className="flex items-center bg-muted/30 p-1 rounded-lg border border-border/60">
                      <button
                        onClick={() => setBucketViewMode('grid')}
                        className={`p-1.5 rounded-md transition-colors ${
                          bucketViewMode === 'grid'
                            ? 'bg-plane-surface text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title="Вид: Сетка"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setBucketViewMode('list')}
                        className={`p-1.5 rounded-md transition-colors ${
                          bucketViewMode === 'list'
                            ? 'bg-plane-surface text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title="Вид: Список"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Refresh */}
                    <button
                      onClick={() => {
                        loadBucketsStats();
                        if (onRefreshBuckets) onRefreshBuckets();
                      }}
                      disabled={loadingBucketStats}
                      className="p-1.5 rounded-lg border border-border bg-plane-surface hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-xs"
                      title="Обновить бакеты и статистику"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingBucketStats ? 'animate-spin text-primary' : ''}`} />
                    </button>

                    {/* Create Bucket + */}
                    {onOpenCreateBucket && (
                      <button
                        onClick={onOpenCreateBucket}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap flex-shrink-0"
                        title="Создать бакет"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Создать бакет</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Grid View */}
                {bucketViewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredBuckets.map((bucket) => {
                      const stat = bucketStats[bucket.name];
                      const isBucketLoading = !!loadingBuckets[bucket.name];
                      const sizeFormatted = stat ? formatBytes(stat.size) : null;
                      const objectsFormatted = stat ? stat.objectsCount.toLocaleString() : null;
                      const accessLabel = stat?.access && stat.access !== 'none' ? stat.access.toUpperCase() : 'R/W';
                      const createdDate = stat?.created || bucket.creationDate;

                      return (
                        <div
                          key={bucket.name}
                          className="bg-plane-surface border border-border rounded-xl p-5 hover:border-border/80 hover:shadow-md transition-all flex flex-col justify-between group"
                        >
                          <div>
                            {/* Card top */}
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex-1 min-w-0 pr-2">
                                <h4
                                  onClick={() => onSelectBucket && onSelectBucket(bucket.name)}
                                  className="text-sm font-bold text-foreground truncate cursor-pointer hover:text-primary transition-colors flex items-center space-x-1.5"
                                  title={bucket.name}
                                >
                                  <span>{bucket.name}</span>
                                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                </h4>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {formatDate(createdDate)}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                {accessLabel}
                              </span>
                            </div>

                            {/* Card middle: Big icon and usage / objects (matching MinIO console screenshot) */}
                            <div className="flex items-center space-x-4 my-5">
                              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center text-primary flex-shrink-0 shadow-inner">
                                <Layers className="w-7 h-7" />
                              </div>
                              <div className="space-y-1">
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Объём</span>
                                  <div className="text-xl font-bold font-mono tracking-tight text-foreground flex items-center space-x-1.5 min-h-[28px]">
                                    {sizeFormatted !== null ? (
                                      <span>{sizeFormatted}</span>
                                    ) : isBucketLoading ? (
                                      <span className="flex items-center space-x-1 text-xs text-muted-foreground font-normal">
                                        <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                                        <span>Подсчёт...</span>
                                      </span>
                                    ) : (
                                      <span>0 B</span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Объекты</span>
                                  <div className="text-xs font-mono font-medium text-muted-foreground">
                                    {objectsFormatted !== null ? (
                                      <span>{objectsFormatted}</span>
                                    ) : isBucketLoading ? (
                                      <span className="text-muted-foreground/60">—</span>
                                    ) : (
                                      <span>0</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Card footer actions */}
                          <div className="pt-3 border-t border-border flex items-center justify-between">
                            <div className="flex items-center space-x-1.5">
                              {stat?.versioning === 'Enabled' && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
                                  Версионирование
                                </span>
                              )}
                              {stat?.objectLock && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/25">
                                  Блокировка
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedBucketName(bucket.name);
                                  setBucketDetailView(bucket.name);
                                }}
                                className="px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center space-x-1"
                                title="Настройки, версионирование и политики бакета"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Настройки</span>
                              </button>
                              {onSelectBucket && (
                                <button
                                  onClick={() => onSelectBucket(bucket.name)}
                                  className="px-2.5 py-1 text-xs rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors flex items-center space-x-1"
                                  title="Перейти к просмотру файлов"
                                >
                                  <span>Файлы</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                              {onDeleteBucket && (
                                <button
                                  onClick={() => onDeleteBucket(bucket.name)}
                                  className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                  title="Удалить бакет"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* List View Table */
                  <div className="bg-plane-surface border border-border rounded-xl overflow-x-auto shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground bg-muted/10 font-medium">
                          <th className="py-3 px-4">Бакет</th>
                          <th className="py-3 px-4">Объём</th>
                          <th className="py-3 px-4">Объекты</th>
                          <th className="py-3 px-4">Доступ</th>
                          <th className="py-3 px-4">Версионирование</th>
                          <th className="py-3 px-4">Дата создания</th>
                          <th className="py-3 px-4 text-right">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredBuckets.map((bucket) => {
                          const stat = bucketStats[bucket.name];
                          const isBucketLoading = !!loadingBuckets[bucket.name];
                          const sizeFormatted = stat ? formatBytes(stat.size) : null;
                          const objectsFormatted = stat ? stat.objectsCount.toLocaleString() : null;
                          const accessLabel = stat?.access && stat.access !== 'none' ? stat.access.toUpperCase() : 'R/W';
                          const createdDate = stat?.created || bucket.creationDate;

                          return (
                            <tr key={bucket.name} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4 font-mono font-medium text-foreground">
                                <div
                                  onClick={() => onSelectBucket && onSelectBucket(bucket.name)}
                                  className="flex items-center space-x-2 cursor-pointer hover:text-primary transition-colors"
                                >
                                  <Layers className="w-4 h-4 text-primary flex-shrink-0" />
                                  <span>{bucket.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono font-semibold text-foreground">
                                {sizeFormatted !== null ? (
                                  sizeFormatted
                                ) : isBucketLoading ? (
                                  <span className="flex items-center space-x-1 text-xs text-muted-foreground font-normal font-sans">
                                    <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                                    <span>Подсчёт...</span>
                                  </span>
                                ) : (
                                  '0 B'
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-muted-foreground">
                                {objectsFormatted !== null ? objectsFormatted : isBucketLoading ? '—' : '0'}
                              </td>
                              <td className="py-3 px-4">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                  {accessLabel}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-muted-foreground">
                                {stat?.versioning === 'Enabled' ? (
                                  <span className="text-emerald-400 font-medium">Включено</span>
                                ) : stat?.versioning === 'Suspended' ? (
                                  <span className="text-amber-400 font-medium">Приостановлено</span>
                                ) : (
                                  <span className="text-muted-foreground/60">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-muted-foreground font-mono">
                                {formatDate(createdDate)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end space-x-2">
                                  <button
                                    onClick={() => {
                                      setSelectedBucketName(bucket.name);
                                      setBucketDetailView(bucket.name);
                                    }}
                                    className="px-2.5 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    Настройки
                                  </button>
                                  {onSelectBucket && (
                                    <button
                                      onClick={() => onSelectBucket(bucket.name)}
                                      className="px-2.5 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors"
                                    >
                                      Файлы
                                    </button>
                                  )}
                                  {onDeleteBucket && (
                                    <button
                                      onClick={() => onDeleteBucket(bucket.name)}
                                      className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                      title="Удалить бакет"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              /* BUCKET DETAIL VIEW (Versioning & Policy Editor) */
              <div className="space-y-6">
                {/* Back to Buckets list */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setBucketDetailView(null)}
                    className="flex items-center space-x-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors group"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                    <span>Назад ко всем бакетам</span>
                  </button>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-muted-foreground">Текущий бакет:</span>
                    <span className="px-2 py-0.5 rounded font-mono font-semibold text-xs bg-primary/10 text-primary border border-primary/20">
                      {selectedBucketName}
                    </span>
                  </div>
                </div>

                {/* Bucket Versioning Card */}
                <div className="bg-plane-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                  <div className="flex items-start space-x-3.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                        bucketVersioning === 'Enabled'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-muted border-border text-muted-foreground'
                      }`}
                    >
                      <FolderGit2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-xs font-semibold text-foreground">Версионирование объектов</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            bucketVersioning === 'Enabled'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                              : 'bg-muted text-muted-foreground border border-border'
                          }`}
                        >
                          {bucketVersioning === 'Enabled' ? 'Включено' : 'Приостановлено'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
                        Сохраняет все ревизии файлов при перезаписи или удалении, позволяя восстанавливать случайные изменения и старые версии объектов.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleToggleVersioning}
                    className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-xs whitespace-nowrap self-start sm:self-auto ${
                      bucketVersioning === 'Enabled'
                        ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30'
                        : 'bg-primary text-primary-foreground hover:bg-primary-hover'
                    }`}
                  >
                    {bucketVersioning === 'Enabled' ? 'Приостановить версионирование' : 'Включить версионирование'}
                  </button>
                </div>

                {/* Bucket Policy Dual-Mode Editor */}
                <div className="space-y-3">
                  <div className="bg-plane-surface border border-border rounded-xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 shadow-xs">
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <div>
                        <h3 className="text-xs font-semibold text-foreground">
                          Политика доступа бакета: <span className="font-mono text-primary">{selectedBucketName || '—'}</span>
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                          Bucket Policy определяет правила и условия прямого доступа к бакету и его объектам
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleApplyPublicReadPolicy}
                        className="px-2.5 py-1 text-[11px] rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
                      >
                        Шаблон: Публичное чтение
                      </button>
                      <button
                        onClick={handleSaveBucketPolicy}
                        disabled={isSavingBucketPolicy || !selectedBucketName}
                        className="px-3 py-1 text-xs font-medium rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground transition-colors shadow-xs flex items-center space-x-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingBucketPolicy ? 'Сохранение...' : 'Сохранить политику бакета'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="h-[520px]">
                    <IAMPolicyEditor
                      value={bucketPolicyContent}
                      onChange={setBucketPolicyContent}
                      buckets={buckets}
                      theme={theme}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. CONFIGURATION TAB (Matching MinIO Console Screenshot) */}
        {activeSubTab === 'config' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Hidden file input for import */}
            <input
              type="file"
              ref={configFileInputRef}
              onChange={handleImportConfig}
              className="hidden"
              accept=".txt,.json,.conf"
            />

            {/* Top Bar: MinIO Configuration Header & Actions */}
            <div className="bg-plane-surface border border-border rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground flex items-center space-x-2">
                    <span>Конфигурация MinIO:</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Централизованное управление параметрами сервера MinIO ({profile?.name || 'server'})
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => configFileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors flex items-center space-x-1.5 shadow-xs whitespace-nowrap flex-shrink-0"
                  title="Импорт конфигурации из файла (mc admin config import)"
                >
                  <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">Импорт</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportConfig}
                  className="px-3.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors flex items-center space-x-1.5 shadow-xs whitespace-nowrap flex-shrink-0"
                  title="Экспорт конфигурации сервера в файл (mc admin config export)"
                >
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">Экспорт</span>
                </button>
              </div>
            </div>

            {/* Sub-tabs under Configuration: Compression, Region, Scanner */}
            <div className="flex items-center space-x-1.5 border-b border-border pb-3">
              {[
                { id: 'compression', label: 'Сжатие', icon: Minimize2 },
                { id: 'region', label: 'Регион', icon: Globe },
                { id: 'scanner', label: 'Сканер', icon: Radio },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeConfigSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveConfigSection(item.id as any);
                      if (item.id === 'compression') loadCompressionConfig();
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Settings Panel */}
            <div className="w-full">
                {activeConfigSection === 'compression' && (
                  <div className="bg-plane-surface border border-border rounded-xl p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-4 gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground flex items-center space-x-2">
                          <Minimize2 className="w-4 h-4 text-primary" />
                          <span>Настройки сжатия</span>
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          MinIO автоматически сжимает объекты перед сохранением на диск для экономии дискового пространства.
                        </p>
                      </div>
                      <div className="flex items-center space-x-3">
                        {loadingConfig && (
                          <div className="flex items-center space-x-2 text-xs text-primary animate-pulse">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Загрузка с MinIO...</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={loadCompressionConfig}
                          disabled={loadingConfig}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors"
                          title="Обновить настройки сжатия"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingConfig ? 'animate-spin text-primary' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {configError && (
                      <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>{configError}</span>
                        </div>
                        <button
                          type="button"
                          onClick={loadCompressionConfig}
                          disabled={loadingConfig}
                          className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-medium transition-colors"
                        >
                          Повторить
                        </button>
                      </div>
                    )}

                    {/* 2-Columns: Extensions & Mime Types (Matching MinIO Console) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column: Extensions */}
                      <div className="border border-border/80 rounded-xl p-4 bg-muted/10 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                            <span>Расширения файлов</span>
                            <span
                              className="text-muted-foreground hover:text-foreground cursor-help"
                              title="Расширения файлов, которые сервер MinIO будет автоматически сжимать (например .txt, .csv, .json)"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </span>
                          </label>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {(compressionConfig?.extensions || []).length} элементов
                          </span>
                        </div>

                        {/* Extensions List */}
                        <div className="flex-1 min-h-[180px] max-h-[260px] overflow-y-auto space-y-1.5 pr-1 border border-border/60 rounded-lg p-2.5 bg-background">
                          {(compressionConfig?.extensions || []).length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic py-8">
                              Список расширений пуст
                            </div>
                          ) : (
                            (compressionConfig?.extensions || []).map((ext) => (
                              <div
                                key={ext}
                                className="group flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/40 hover:bg-muted border border-border/40 text-xs font-mono transition-colors"
                              >
                                <span className="text-foreground font-medium">{ext}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExtension(ext)}
                                  className="text-muted-foreground hover:text-destructive opacity-70 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                                  title={`Удалить ${ext}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add Extension Input */}
                        <div className="mt-3 flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="например, .pdf"
                            value={newExtensionInput}
                            onChange={(e) => setNewExtensionInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddExtension();
                              }
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={handleAddExtension}
                            className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors flex items-center space-x-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Добавить</span>
                          </button>
                        </div>
                      </div>

                      {/* Right Column: Mime Types */}
                      <div className="border border-border/80 rounded-xl p-4 bg-muted/10 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                            <span>MIME-типы</span>
                            <span
                              className="text-muted-foreground hover:text-foreground cursor-help"
                              title="MIME-типы файлов, которые сервер MinIO будет автоматически сжимать (например text/*, application/json)"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </span>
                          </label>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {(compressionConfig?.mime_types || []).length} элементов
                          </span>
                        </div>

                        {/* Mime Types List */}
                        <div className="flex-1 min-h-[180px] max-h-[260px] overflow-y-auto space-y-1.5 pr-1 border border-border/60 rounded-lg p-2.5 bg-background">
                          {(compressionConfig?.mime_types || []).length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic py-8">
                              Список MIME-типов пуст
                            </div>
                          ) : (
                            (compressionConfig?.mime_types || []).map((mime) => (
                              <div
                                key={mime}
                                className="group flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/40 hover:bg-muted border border-border/40 text-xs font-mono transition-colors"
                              >
                                <span className="text-foreground font-medium">{mime}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMime(mime)}
                                  className="text-muted-foreground hover:text-destructive opacity-70 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                                  title={`Удалить ${mime}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add Mime Input */}
                        <div className="mt-3 flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="например, application/pdf"
                            value={newMimeInput}
                            onChange={(e) => setNewMimeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddMime();
                              }
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={handleAddMime}
                            className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors flex items-center space-x-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Добавить</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Toggles / Checkboxes (Matching MinIO Console) */}
                    <div className="p-4 rounded-xl border border-border/70 bg-muted/10 space-y-4">
                      <div className="flex items-start space-x-3">
                        <input
                          id="enable-compression-chk"
                          type="checkbox"
                          checked={compressionConfig.enable}
                          onChange={(e) =>
                            setCompressionConfig((prev) => ({ ...prev, enable: e.target.checked }))
                          }
                          className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <div>
                          <label
                            htmlFor="enable-compression-chk"
                            className="text-xs font-semibold text-foreground cursor-pointer block"
                          >
                            Включить сжатие
                          </label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Включить сжатие для объектов с подходящими расширениями или MIME-типами. При отключении MinIO сохраняет файлы без сжатия.
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-border/40 pt-3 flex items-start space-x-3">
                        <input
                          id="allow-encryption-chk"
                          type="checkbox"
                          checked={compressionConfig.allow_encryption}
                          onChange={(e) =>
                            setCompressionConfig((prev) => ({ ...prev, allow_encryption: e.target.checked }))
                          }
                          className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <div>
                          <label
                            htmlFor="allow-encryption-chk"
                            className="text-xs font-semibold text-foreground cursor-pointer block"
                          >
                            Разрешить шифрование со сжатием
                          </label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Разрешить сжатие объектов перед их шифрованием на стороне сервера (Server-Side Encryption / SSE).
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: Restore Defaults & Save (Exact MinIO Console layout) */}
                    <div className="flex items-center justify-end space-x-3 pt-2">
                      <button
                        type="button"
                        onClick={handleResetCompressionConfig}
                        disabled={isSavingConfig}
                        className="px-4 py-2 rounded-lg border border-rose-500/50 hover:bg-rose-500/10 text-rose-400 text-xs font-medium transition-colors shadow-xs"
                      >
                        По умолчанию
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCompressionConfig}
                        disabled={isSavingConfig}
                        className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-medium transition-colors shadow-xs flex items-center space-x-1.5"
                      >
                        {isSavingConfig ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Сохранение...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Сохранить</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Other Config Sections: Informational Panels */}
                {activeConfigSection === 'region' && (
                  <div className="bg-plane-surface border border-border rounded-xl p-6 shadow-xs space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center space-x-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <span>Регион сервера</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Настройка географического региона MinIO кластера. Текущее значение региона используется в S3 Signature V4.
                    </p>
                    <div className="max-w-md space-y-2 pt-2">
                      <label className="text-xs font-medium text-foreground block">
                        Название региона сервера
                      </label>
                      <input
                        type="text"
                        value={regionInput}
                        onChange={(e) => setRegionInput(e.target.value)}
                        placeholder="например, us-east-1, ru-central1"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        MinIO по умолчанию использует регион <code className="text-primary font-mono">us-east-1</code>.
                      </p>
                    </div>
                  </div>
                )}

                {activeConfigSection === 'scanner' && (
                  <div className="bg-plane-surface border border-border rounded-xl p-6 shadow-xs space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center space-x-2">
                      <Radio className="w-4 h-4 text-primary" />
                      <span>Фоновый сканер дисков</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Сканер MinIO непрерывно инспектирует диски, проверяет контрольные суммы данных и очищает удалённые версии объектов.
                    </p>
                    <div className="max-w-md space-y-2 pt-2">
                      <label className="text-xs font-medium text-foreground block">
                        Скорость сканирования
                      </label>
                      <select
                        value={scannerSpeedInput}
                        onChange={(e) => setScannerSpeedInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="default">По умолчанию (Сбалансированная)</option>
                        <option value="slow">Медленная (Сниженная нагрузка на диски)</option>
                        <option value="slowest">Минимальная (Минимальное влияние на I/O)</option>
                        <option value="fast">Быстрая (Ускоренная зачистка и проверка)</option>
                      </select>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* MODAL: Create User */}
      {isCreateUserOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-plane-surface border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/20">
              <h3 className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-primary" />
                <span>Создание пользователя MinIO</span>
              </h3>
              <button onClick={() => setIsCreateUserOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Access Key (Логин пользователя)
                </label>
                <input
                  type="text"
                  required
                  value={newAccessKey}
                  onChange={(e) => setNewAccessKey(e.target.value)}
                  placeholder="например, backend-app или dev-user"
                  className="w-full px-3 py-2 bg-plane-bg border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-foreground">
                    Secret Key (Пароль)
                  </label>
                  <button
                    type="button"
                    onClick={() => generateRandomSecret(setNewSecretKey)}
                    className="text-[11px] text-primary hover:underline font-mono"
                  >
                    Сгенерировать
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newSecretKey}
                  onChange={(e) => setNewSecretKey(e.target.value)}
                  placeholder="Минимум 8 символов"
                  className="w-full px-3 py-2 bg-plane-bg border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Политика доступа (Роль)
                </label>
                <select
                  value={newUserPolicy}
                  onChange={(e) => setNewUserPolicy(e.target.value)}
                  className="w-full px-3 py-2 bg-plane-bg border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="readwrite">readwrite (Полный доступ к чтению и записи)</option>
                  <option value="readonly">readonly (Только чтение)</option>
                  <option value="writeonly">writeonly (Только запись)</option>
                  <option value="diagnostics">diagnostics (Диагностика)</option>
                  <option value="consoleAdmin">consoleAdmin (Администратор)</option>
                  {policies
                    .filter((p) => !SYSTEM_POLICY_ORDER.includes(p.name))
                    .map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} (кастомная)
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateUserOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs text-foreground font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium shadow-xs"
                >
                  Создать пользователя
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Change Password */}
      {editingPasswordUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-plane-surface border border-border rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/20">
              <h3 className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                <Key className="w-4 h-4 text-primary" />
                <span>Смена пароля: {editingPasswordUser}</span>
              </h3>
              <button
                onClick={() => setEditingPasswordUser(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-foreground">Новый пароль (Secret Key)</label>
                  <button
                    type="button"
                    onClick={() => generateRandomSecret(setChangePasswordVal)}
                    className="text-[11px] text-primary hover:underline font-mono"
                  >
                    Сгенерировать
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={changePasswordVal}
                  onChange={(e) => setChangePasswordVal(e.target.value)}
                  placeholder="Введите новый пароль"
                  className="w-full px-3 py-2 bg-plane-bg border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingPasswordUser(null)}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs text-foreground font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium shadow-xs"
                >
                  Обновить пароль
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Policy */}
      {isCreatePolicyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-plane-surface border border-border rounded-xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/20">
              <h3 className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                <Shield className="w-4 h-4 text-primary" />
                <span>Создание политики доступа IAM</span>
              </h3>
              <button
                onClick={() => setIsCreatePolicyOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePolicySubmit} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Название политики
                </label>
                <input
                  type="text"
                  required
                  value={newPolicyName}
                  onChange={(e) => setNewPolicyName(e.target.value)}
                  placeholder="например, my-custom-app-policy"
                  className="w-full px-3 py-2 bg-plane-bg border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-foreground">
                    Документ политики (JSON)
                  </label>
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Шаблон:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewPolicyJson(
                          JSON.stringify(
                            {
                              Version: '2012-10-17',
                              Statement: [
                                {
                                  Effect: 'Allow',
                                  Action: ['s3:*'],
                                  Resource: ['arn:aws:s3:::*'],
                                },
                              ],
                            },
                            null,
                            2
                          )
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] text-muted-foreground font-mono"
                    >
                      readwrite
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewPolicyJson(
                          JSON.stringify(
                            {
                              Version: '2012-10-17',
                              Statement: [
                                {
                                  Effect: 'Allow',
                                  Action: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'],
                                  Resource: ['arn:aws:s3:::*'],
                                },
                              ],
                            },
                            null,
                            2
                          )
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] text-muted-foreground font-mono"
                    >
                      readonly
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const b = buckets[0]?.name || 'my-bucket';
                        setNewPolicyJson(
                          JSON.stringify(
                            {
                              Version: '2012-10-17',
                              Statement: [
                                {
                                  Effect: 'Allow',
                                  Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                                  Resource: [`arn:aws:s3:::${b}/*`],
                                },
                                {
                                  Effect: 'Allow',
                                  Action: ['s3:ListBucket'],
                                  Resource: [`arn:aws:s3:::${b}`],
                                },
                              ],
                            },
                            null,
                            2
                          )
                        );
                      }}
                      className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] text-muted-foreground font-mono"
                    >
                      bucket-scoped
                    </button>
                  </div>
                </div>
                <div className="h-52 border border-border rounded-lg overflow-hidden">
                  <Editor
                    height="100%"
                    language="json"
                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                    value={newPolicyJson}
                    onChange={(val) => setNewPolicyJson(val || '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 11,
                      tabSize: 2,
                    }}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePolicyOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs text-foreground font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium shadow-xs"
                >
                  Создать политику
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
