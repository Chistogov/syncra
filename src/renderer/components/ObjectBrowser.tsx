import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  Download,
  FolderPlus,
  FolderUp,
  RefreshCw,
  Trash2,
  LayoutGrid,
  List,
  Search,
  UploadCloud,
  CheckSquare,
  ArrowDown,
  CheckCircle2,
  X,
  Copy,
  Check,
  AlertTriangle,
  Tag,
  Filter,
  Lock,
} from 'lucide-react';
import { S3Item, S3Profile, S3Tag, UserPermissions } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import { ObjectTable } from './ObjectTable';
import { ObjectGrid } from './ObjectGrid';
import { ItemContextMenu } from './ItemContextMenu';
import { FolderContextMenu } from './FolderContextMenu';
import { ObjectTagsModal } from './ObjectTagsModal';
import { TagFilterPopover, TagFilterMode } from './TagFilterPopover';
import { formatBytes, formatSpeed } from '../utils/formatters';

export interface TransferSummary {
  isActive: boolean;
  runningCount: number;
  queuedCount: number;
  completedCount: number;
  totalCount: number;
  percentage: number;
  speedBytesPerSec: number;
  transferredBytes: number;
  totalBytes: number;
  isDiscoveryActive?: boolean;
  discoveryFolderName?: string;
  discoveryCount?: number;
}

interface ObjectBrowserProps {
  items: S3Item[];
  bucket: string;
  prefix: string;
  profile: S3Profile | null;
  loading: boolean;
  transferSummary?: TransferSummary;
  onOpenTransfers?: () => void;
  onRefresh: () => void;
  onOpenFolder: (folderPrefix: string) => void;
  onPreview: (item: S3Item) => void;
  onDownloadItem: (item: S3Item) => void;
  onOpenExternal: (item: S3Item) => void;
  onPresignedUrl: (item: S3Item) => void;
  onOpenMonaco: (item: S3Item) => void;
  onOpenPdf?: (item: S3Item) => void;
  onOpenGallery?: (item: S3Item) => void;
  onDeleteItems: (keys: string[]) => void;
  onDownloadSelected: (items: S3Item[]) => void;
  onCreateFolderClick: () => void;
  onUploadFilesClick: () => void;
  onUploadFolderClick: () => void;
  onFilesDropped: (filePaths: string[]) => void;
  permissions?: UserPermissions;
  isProActive?: boolean;
}

const isTextInputElement = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    const textTypes = ['text', 'search', 'password', 'email', 'number', 'url', 'tel'];
    return textTypes.includes(target.type?.toLowerCase() || 'text');
  }
  return false;
};

export const ObjectBrowser: React.FC<ObjectBrowserProps> = ({
  items,
  bucket,
  prefix,
  profile,
  loading,
  transferSummary,
  onOpenTransfers,
  onRefresh,
  onOpenFolder,
  onPreview,
  onDownloadItem,
  onOpenExternal,
  onPresignedUrl,
  onOpenMonaco,
  onOpenPdf,
  onOpenGallery,
  onDeleteItems,
  onDownloadSelected,
  onCreateFolderClick,
  onUploadFilesClick,
  onUploadFolderClick,
  onFilesDropped,
  permissions,
  isProActive = true,
}) => {
  const { t } = useTranslation();
  const canUpload = permissions?.canUpload ?? true;
  const canCreateFolder = permissions?.canCreateFolder ?? true;
  const canDeleteItems = permissions?.canDeleteItems ?? true;
  const canEditTags = permissions?.canEditTags ?? true;
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [copyState, setCopyState] = useState<{
    isCopying: boolean;
    message: string;
    type: 'info' | 'success' | 'error';
  } | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    item: S3Item;
    position: { x: number; y: number };
  } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);
  const [taggingItems, setTaggingItems] = useState<S3Item[] | null>(null);
  const [tagsMap, setTagsMap] = useState<Record<string, S3Tag[]>>({});
  const [tagFilterMode, setTagFilterMode] = useState<TagFilterMode>('all');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [customTagQuery, setCustomTagQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  // Sorting
  const [sortField, setSortField] = useState<'name' | 'size' | 'lastModified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleResetTagFilters = useCallback(() => {
    setTagFilterMode('all');
    setSelectedTags(new Set());
    setCustomTagQuery('');
  }, []);

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    // Ignore right clicks on interactive elements like buttons, inputs, links, or table headers
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a, thead')) {
      return;
    }

    e.preventDefault();
    setContextMenu(null);
    setFolderContextMenu({
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  useEffect(() => {
    setSelectedKeys(new Set());
    setFilterQuery('');
    setTagFilterMode('all');
    setSelectedTags(new Set());
    setCustomTagQuery('');
    setIsMobileSearchOpen(false);
    setContextMenu(null);
    setFolderContextMenu(null);
  }, [bucket, prefix]);

  // Fetch tags in background for current folder items
  useEffect(() => {
    let isMounted = true;
    if (!profile || !bucket || items.length === 0) {
      setTagsMap({});
      return;
    }

    const fileKeys = items.filter((i) => !i.isPrefix).map((i) => i.key);
    if (fileKeys.length === 0) {
      setTagsMap({});
      return;
    }

    window.electronAPI.s3
      .getBatchObjectTags(profile, bucket, fileKeys)
      .then((res) => {
        if (isMounted && res) {
          setTagsMap(res);
        }
      })
      .catch((err) => {
        console.warn('Failed to load batch object tags:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [profile, bucket, prefix, items]);

  // Listen for tag update events across the app (PreviewDrawer, modals)
  useEffect(() => {
    const handleTagsUpdatedEvent = (e: any) => {
      const { bucket: eventBucket, key, tags } = e.detail || {};
      if (eventBucket && eventBucket !== bucket) return;
      if (!key) return;

      setTagsMap((prev) => {
        const next = { ...prev };
        if (!tags || tags.length === 0) {
          delete next[key];
        } else {
          next[key] = tags;
        }
        return next;
      });
    };

    window.addEventListener('s3:tags-updated', handleTagsUpdatedEvent);
    return () => window.removeEventListener('s3:tags-updated', handleTagsUpdatedEvent);
  }, [bucket]);

  // Auto-close mobile search when screen expands to desktop width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 640 && isMobileSearchOpen) {
        setIsMobileSearchOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileSearchOpen]);

  const handleSort = (field: 'name' | 'size' | 'lastModified') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleToggleSelect = (key: string, isShift: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedKeys.size === items.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(items.map((i) => i.key)));
    }
  };

  const onItemDoubleClick = (item: S3Item) => {
    if (item.isPrefix) {
      onOpenFolder(item.key);
    } else {
      onPreview(item);
    }
  };

  const handleCopySelected = useCallback(
    async (targetItems?: S3Item[]) => {
      if (!window.electronAPI?.isElectron || !profile) return;
      const itemsToCopy =
        targetItems && targetItems.length > 0
          ? targetItems
          : items.filter((i) => selectedKeys.has(i.key));

      if (itemsToCopy.length === 0) return;

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }

      setCopyState({
        isCopying: true,
        message:
          itemsToCopy.length > 1
            ? t('browser.copyingFiles', { count: itemsToCopy.length })
            : t('browser.copyingFile', { name: itemsToCopy[0].name }),
        type: 'info',
      });

      try {
        const res = await window.electronAPI.copyToClipboard({
          profile,
          bucket,
          items: itemsToCopy,
        });

        if (res.success) {
          setCopyState({
            isCopying: false,
            message: t('browser.copiedToClipboard', { count: res.count }),
            type: 'success',
          });
          copyTimeoutRef.current = setTimeout(() => {
            setCopyState(null);
          }, 4500);
        } else {
          setCopyState({
            isCopying: false,
            message: res.error || t('browser.copyFailed'),
            type: 'error',
          });
          copyTimeoutRef.current = setTimeout(() => {
            setCopyState(null);
          }, 4500);
        }
      } catch (err: any) {
        setCopyState({
          isCopying: false,
          message: err?.message || t('browser.copyError'),
          type: 'error',
        });
        copyTimeoutRef.current = setTimeout(() => {
          setCopyState(null);
        }, 4500);
      }
    },
    [profile, bucket, items, selectedKeys, t]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Layout-independent Ctrl + F to focus search
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === 'KeyF' || e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'а')
      ) {
        e.preventDefault();
        if (window.innerWidth < 640) {
          setIsMobileSearchOpen(true);
          setTimeout(() => {
            mobileSearchInputRef.current?.focus();
            mobileSearchInputRef.current?.select();
          }, 50);
        } else {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
        return;
      }

      // Clipboard Copy (Ctrl+C / Cmd+C) - supports English 'c' and Russian 'с' layouts
      const isCKey =
        e.code === 'KeyC' ||
        e.key.toLowerCase() === 'c' ||
        e.key.toLowerCase() === 'с';

      if ((e.ctrlKey || e.metaKey) && isCKey) {
        if (!isTextInputElement(e.target)) {
          if (selectedKeys.size > 0) {
            e.preventDefault();
            handleCopySelected();
            return;
          }
        }
      }

      if (isTextInputElement(e.target)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (selectedKeys.size === 1) {
          const selectedKey = Array.from(selectedKeys)[0];
          const item = items.find((i) => i.key === selectedKey);
          if (item && !item.isPrefix) {
            onPreview(item);
          }
        }
      } else if (e.code === 'Delete') {
        if (selectedKeys.size > 0 && canDeleteItems) {
          onDeleteItems(Array.from(selectedKeys));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKeys, items, onPreview, onDeleteItems, handleCopySelected]);

  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragOver(false);

      if (!canUpload) {
        return;
      }

      // Web Browser Mode: recursively scan dropped files & folders via HTML5 webkitGetAsEntry
      if (!window.electronAPI?.isElectron) {
        const scanFn = (window.electronAPI as any)?.scanDroppedItems;
        if (scanFn && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
          try {
            const virtualPaths = await scanFn(e.dataTransfer.items);
            if (virtualPaths && virtualPaths.length > 0) {
              onFilesDropped(virtualPaths);
              return;
            }
          } catch (err) {
            console.error('Failed to scan dropped items in web mode:', err);
          }
        }
      }

      // Desktop Electron Mode:
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const paths: string[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          const p = window.electronAPI?.getPathForFile
            ? window.electronAPI.getPathForFile(file)
            : (file as any).path;
          if (p) {
            paths.push(p);
          }
        }
        if (paths.length > 0) {
          onFilesDropped(paths);
        }
      }
    },
    [onFilesDropped]
  );

  const isTagFilterActive =
    tagFilterMode !== 'all' || selectedTags.size > 0 || customTagQuery.trim().length > 0;

  const filteredItems = items
    .filter((item) => {
      const itemTags = tagsMap[item.key] || [];
      const hasTags = !item.isPrefix && itemTags.length > 0;

      // 1. Tag mode filter
      if (tagFilterMode === 'tagged_only') {
        if (item.isPrefix || !hasTags) return false;
      } else if (tagFilterMode === 'untagged_only') {
        if (!item.isPrefix && hasTags) return false;
      }

      // 2. Selected specific tags filter
      if (selectedTags.size > 0) {
        if (item.isPrefix) return false;
        const matchesSelected = itemTags.some((t) => {
          const id = t.value ? `${t.key}=${t.value}` : t.key;
          return selectedTags.has(id) || selectedTags.has(t.key);
        });
        if (!matchesSelected) return false;
      }

      // 3. Custom tag query filter (from tag dropdown)
      if (customTagQuery.trim()) {
        if (item.isPrefix) return false;
        const q = customTagQuery.trim().toLowerCase();
        const matchesCustom = itemTags.some((t) => {
          const id = t.value ? `${t.key}=${t.value}` : t.key;
          return (
            t.key.toLowerCase().includes(q) ||
            t.value.toLowerCase().includes(q) ||
            id.toLowerCase().includes(q)
          );
        });
        if (!matchesCustom) return false;
      }

      // 4. Main search input filter (matches file name or tag key/value)
      if (filterQuery.trim()) {
        const q = filterQuery.trim().toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesTag =
          !item.isPrefix &&
          itemTags.some(
            (t) =>
              t.key.toLowerCase().includes(q) ||
              t.value.toLowerCase().includes(q) ||
              (t.value && `${t.key}=${t.value}`.toLowerCase().includes(q))
          );
        if (!matchesName && !matchesTag) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (a.isPrefix && !b.isPrefix) return -1;
      if (!a.isPrefix && b.isPrefix) return 1;

      let compareVal = 0;
      if (sortField === 'name') {
        compareVal = a.name.localeCompare(b.name);
      } else if (sortField === 'size') {
        compareVal = (a.size || 0) - (b.size || 0);
      } else if (sortField === 'lastModified') {
        compareVal = (a.lastModified || '').localeCompare(b.lastModified || '');
      }

      return sortOrder === 'asc' ? compareVal : -compareVal;
    });

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full bg-plane-bg overflow-hidden relative text-foreground"
    >
      {/* Plane.so Drag & Drop Backdrop Overlay */}
      {isDragOver && canUpload && (
        <div className="absolute inset-0 z-50 bg-plane-bg/90 border-2 border-dashed border-primary flex flex-col items-center justify-center pointer-events-none backdrop-blur-sm animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
            <UploadCloud className="w-7 h-7 animate-bounce" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {t('browser.dropFilesTitle')}
          </h3>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            /{bucket}/{prefix}
          </p>
        </div>
      )}

      {/* Plane.so Toolbar Header */}
      <div className="h-12 px-3 sm:px-4 border-b border-border flex items-center justify-between text-xs bg-plane-surface/40">
        {isMobileSearchOpen ? (
          /* Mobile Search Bar: Hides actions and spans across entire toolbar */
          <div className="flex-1 flex items-center space-x-2 animate-in fade-in duration-150">
            <div className="relative flex-1 flex items-center">
              <Search className="w-3.5 h-3.5 text-primary absolute left-2.5 pointer-events-none" />
              <input
                ref={mobileSearchInputRef}
                autoFocus
                type="text"
                placeholder={t('browser.searchInFolder')}
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (filterQuery) {
                      setFilterQuery('');
                    } else {
                      setIsMobileSearchOpen(false);
                    }
                  }
                }}
                className="w-full bg-plane-surface border border-primary/50 focus:border-primary rounded-md pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs select-text"
              />
              {filterQuery && (
                <button
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 p-1 text-muted-foreground hover:text-foreground"
                  title={t('browser.clear')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setFilterQuery('');
                setIsMobileSearchOpen(false);
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors whitespace-nowrap flex-shrink-0"
            >
              {t('browser.cancel')}
            </button>
          </div>
        ) : (
          <>
            {/* Left Actions (Shadcn Buttons) */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 min-w-0">
              {canUpload && (
                <button
                  onClick={onUploadFilesClick}
                  className="flex items-center space-x-1.5 p-1.5 sm:px-3 sm:py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-md transition-colors shadow-xs whitespace-nowrap flex-shrink-0"
                  title={t('browser.uploadFilesTooltip')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('browser.uploadFiles')}</span>
                </button>
              )}

              {canUpload && (
                <button
                  onClick={onUploadFolderClick}
                  className="flex items-center space-x-1.5 p-1.5 sm:px-3 sm:py-1.5 bg-plane-surface hover:bg-muted text-foreground border border-border rounded-md transition-colors font-medium shadow-xs whitespace-nowrap flex-shrink-0"
                  title={t('browser.uploadFolderTooltip')}
                >
                  <FolderUp className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">{t('browser.uploadFolder')}</span>
                </button>
              )}

              {canCreateFolder && (
                <button
                  onClick={onCreateFolderClick}
                  className="flex items-center space-x-1.5 p-1.5 sm:px-3 sm:py-1.5 bg-plane-surface hover:bg-muted text-foreground border border-border rounded-md transition-colors font-medium whitespace-nowrap flex-shrink-0"
                  title={t('browser.newFolderTooltip')}
                >
                  <FolderPlus className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="hidden md:inline">{t('browser.newFolder')}</span>
                </button>
              )}

              {!canUpload && !canCreateFolder && (
                <div
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-muted/60 border border-border text-muted-foreground text-[11px] font-medium whitespace-nowrap flex-shrink-0"
                  title={t('browser.readOnlyTooltip')}
                >
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{t('browser.readOnlyBadge')}</span>
                </div>
              )}

              <button
                onClick={onRefresh}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-transparent hover:border-border whitespace-nowrap flex-shrink-0"
                title={t('browser.refreshTooltip')}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
              </button>

              {/* Selection Pill Bar */}
              {selectedKeys.size > 0 && (
                <div className="flex items-center space-x-1.5 sm:space-x-2 pl-1.5 sm:pl-2 border-l border-border animate-fade-in whitespace-nowrap flex-shrink-0">
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted px-1.5 sm:px-2 py-0.5 rounded-md">
                    <span className="hidden sm:inline">{t('browser.selected')}&nbsp;</span>{selectedKeys.size}
                  </span>
                  {window.electronAPI?.isElectron && (
                    <button
                      onClick={() => handleCopySelected()}
                      disabled={copyState?.isCopying}
                      className="flex items-center space-x-1 p-1.5 sm:px-2.5 sm:py-1 text-foreground hover:bg-muted border border-border rounded-md transition-colors font-medium text-xs shadow-xs whitespace-nowrap flex-shrink-0"
                      title={t('browser.copyTooltip')}
                    >
                      {copyState?.isCopying ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span className="hidden sm:inline">{t('browser.copy')}</span>
                    </button>
                  )}
                  {canEditTags && (() => {
                    const selectedFiles = items.filter((item) => selectedKeys.has(item.key) && !item.isPrefix);
                    const hasSelectedFiles = selectedFiles.length > 0;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (hasSelectedFiles) {
                            setTaggingItems(selectedFiles);
                          }
                        }}
                        disabled={!hasSelectedFiles}
                        className={`flex items-center space-x-1 p-1.5 sm:px-2.5 sm:py-1 border rounded-md transition-colors font-medium text-xs shadow-xs whitespace-nowrap flex-shrink-0 ${
                          hasSelectedFiles
                            ? 'text-foreground hover:bg-muted border-border cursor-pointer'
                            : 'text-muted-foreground/40 border-border/50 cursor-not-allowed opacity-50'
                        }`}
                        title={
                          hasSelectedFiles
                            ? t('browser.tagsTooltip')
                            : t('browser.tagsDisabledTooltip')
                        }
                      >
                        <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="hidden sm:inline">{t('browser.tags')}</span>
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => {
                      const selectedItems = items.filter((item) => selectedKeys.has(item.key));
                      if (selectedItems.length > 0) {
                        onDownloadSelected(selectedItems);
                      }
                    }}
                    className="flex items-center space-x-1 p-1.5 sm:px-2.5 sm:py-1 text-foreground hover:bg-muted border border-border rounded-md transition-colors font-medium text-xs shadow-xs whitespace-nowrap flex-shrink-0"
                    title={t('browser.downloadTooltip')}
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="hidden sm:inline">{t('browser.download')}</span>
                  </button>
                  {canDeleteItems && (
                    <button
                      onClick={() => {
                        onDeleteItems(Array.from(selectedKeys));
                      }}
                      className="flex items-center space-x-1 p-1.5 sm:px-2.5 sm:py-1 text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-md transition-colors font-medium text-xs whitespace-nowrap flex-shrink-0"
                      title={t('browser.deleteTooltip')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('browser.delete')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right Tools (Search & Segmented View Switcher) */}
            <div className="flex items-center space-x-1.5 sm:space-x-2.5 flex-shrink-0">
              {/* Mobile Search Icon Button (collapsed to icon on small screens) */}
              <button
                onClick={() => {
                  setIsMobileSearchOpen(true);
                  setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
                }}
                className={`sm:hidden p-1.5 rounded-md transition-colors border ${
                  filterQuery
                    ? 'text-primary bg-primary/10 border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
                }`}
                title={t('browser.searchTooltip')}
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              {/* Desktop Search Input (visible on sm and larger) */}
              <div className="hidden sm:block relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={t('browser.searchInFolder')}
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-28 sm:w-44 focus:w-40 sm:focus:w-52 bg-plane-surface border border-border rounded-md pl-8 pr-7 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-border focus:ring-1 focus:ring-ring/50 select-text transition-all"
                />
                {filterQuery && (
                  <button
                    onClick={() => setFilterQuery('')}
                    className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                    title={t('browser.clear')}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Tag Filter Popover */}
              <TagFilterPopover
                items={items}
                tagsMap={tagsMap}
                tagFilterMode={tagFilterMode}
                onTagFilterModeChange={setTagFilterMode}
                selectedTags={selectedTags}
                onSelectedTagsChange={setSelectedTags}
                customTagQuery={customTagQuery}
                onCustomTagQueryChange={setCustomTagQuery}
                onReset={handleResetTagFilters}
              />

              {/* Shadcn / Plane Segmented Control */}
              <div className="flex items-center bg-plane-surface border border-border rounded-md p-0.5">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1 rounded text-xs transition-all ${
                    viewMode === 'table'
                      ? 'bg-muted text-foreground shadow-xs font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={t('browser.viewTable')}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded text-xs transition-all ${
                    viewMode === 'grid'
                      ? 'bg-muted text-foreground shadow-xs font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={t('browser.viewGrid')}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Active Tag Filter Banner */}
      {isTagFilterActive && (
        <div className="px-3 sm:px-4 py-1.5 bg-primary/5 border-b border-primary/20 flex items-center justify-between text-xs animate-in fade-in duration-100 flex-shrink-0">
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 overflow-hidden">
            <span className="text-muted-foreground flex items-center space-x-1 text-[11px] mr-1">
              <Filter className="w-3 h-3 text-primary" />
              <span>{t('browser.tagFilterPrefix')}</span>
            </span>
            {tagFilterMode === 'tagged_only' && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] border border-primary/20 font-medium">
                <span>{t('browser.taggedOnly')}</span>
                <button
                  type="button"
                  onClick={() => setTagFilterMode('all')}
                  className="hover:text-foreground ml-0.5 cursor-pointer"
                  title={t('browser.removeFilter')}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {tagFilterMode === 'untagged_only' && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] border border-primary/20 font-medium">
                <span>{t('browser.untaggedOnly')}</span>
                <button
                  type="button"
                  onClick={() => setTagFilterMode('all')}
                  className="hover:text-foreground ml-0.5 cursor-pointer"
                  title={t('browser.removeFilter')}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {Array.from(selectedTags).map((tagId) => (
              <span
                key={tagId}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] border border-primary/25 font-mono"
              >
                <span>{tagId}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedTags);
                    next.delete(tagId);
                    setSelectedTags(next);
                  }}
                  className="hover:text-foreground ml-0.5 cursor-pointer"
                  title={t('browser.removeTag')}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {customTagQuery && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] border border-primary/20">
                <span>{t('browser.searchTagQuery', { query: customTagQuery })}</span>
                <button
                  type="button"
                  onClick={() => setCustomTagQuery('')}
                  className="hover:text-foreground ml-0.5 cursor-pointer"
                  title={t('browser.clear')}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleResetTagFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground underline ml-2 whitespace-nowrap cursor-pointer"
          >
            {t('browser.resetAll')}
          </button>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 overflow-hidden" onContextMenu={handleBackgroundContextMenu}>
        {filteredItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground space-y-3">
            <div className="w-12 h-12 rounded-xl bg-muted/40 border border-border flex items-center justify-center text-muted-foreground/60">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {items.length === 0 ? t('browser.emptyFolder') : t('browser.emptySearch')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {filterQuery || isTagFilterActive
                  ? t('browser.emptyFolderDesc')
                  : t('browser.emptyFolderPrompt')}
              </p>
              {isTagFilterActive && (
                <button
                  type="button"
                  onClick={handleResetTagFilters}
                  className="mt-3 inline-flex items-center space-x-1 px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 text-xs font-medium rounded-md transition-colors"
                >
                  <X className="w-3 h-3" />
                  <span>{t('browser.resetTagFilters')}</span>
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'table' ? (
          <ObjectTable
            items={filteredItems}
            selectedKeys={selectedKeys}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onItemDoubleClick={onItemDoubleClick}
            onItemContextMenu={(item, pos) => {
              setFolderContextMenu(null);
              setContextMenu({ item, position: pos });
            }}
            onPreview={onPreview}
            onDownload={onDownloadItem}
            onOpenExternal={onOpenExternal}
            onPresignedUrl={onPresignedUrl}
            onOpenMonaco={onOpenMonaco}
            onOpenPdf={onOpenPdf}
            onOpenGallery={onOpenGallery}
            onDelete={(item) => onDeleteItems([item.key])}
            tagsMap={tagsMap}
            onOpenTags={(item) => setTaggingItems([item])}
            canDeleteItems={canDeleteItems}
            isProActive={isProActive}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        ) : (
          <ObjectGrid
            items={filteredItems}
            profile={profile}
            bucket={bucket}
            selectedKeys={selectedKeys}
            onToggleSelect={handleToggleSelect}
            onItemDoubleClick={onItemDoubleClick}
            onItemContextMenu={(item, pos) => {
              setFolderContextMenu(null);
              setContextMenu({ item, position: pos });
            }}
            onPreview={onPreview}
            onDownload={onDownloadItem}
            onOpenExternal={onOpenExternal}
            onPresignedUrl={onPresignedUrl}
            onOpenMonaco={onOpenMonaco}
            onOpenPdf={onOpenPdf}
            onOpenGallery={onOpenGallery}
            onDelete={(item) => onDeleteItems([item.key])}
            tagsMap={tagsMap}
            onOpenTags={(item) => setTaggingItems([item])}
            canDeleteItems={canDeleteItems}
            canEditTags={canEditTags}
            isProActive={isProActive}
          />
        )}
      </div>

      {/* Plane.so Bottom Status Bar */}
      <div className="h-7 px-4 bg-plane-surface/50 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          <span>
            {t('browser.objectsCount')} <strong className="text-foreground font-medium">{filteredItems.length}</strong>
            {filteredItems.length !== items.length ? ` ${t('browser.fromTotal', { total: items.length })}` : ''}
          </span>
          <span className="text-border">•</span>
          <span>
            {t('browser.totalSize')}{' '}
            <strong className="text-foreground font-medium">
              {formatBytes(
                items
                  .filter((i) => !i.isPrefix)
                  .reduce((acc, i) => acc + (i.size || 0), 0)
              )}
            </strong>
          </span>
        </div>

        {/* Center: Live Transfer Progress Bar & Status */}
        {transferSummary && (transferSummary.isActive || (transferSummary.completedCount > 0 && transferSummary.totalCount > 0)) && (
          <div
            onClick={onOpenTransfers}
            className="flex items-center space-x-2 px-2.5 py-0.5 rounded bg-muted/40 hover:bg-muted border border-border/60 cursor-pointer transition-all text-xs"
            title={t('browser.openTransfers')}
          >
            {transferSummary.isDiscoveryActive ? (
              <>
                <RefreshCw className="w-3 h-3 text-primary animate-spin" />
                <span className="text-foreground font-medium text-[11px]">
                  {t('browser.preparing', { count: transferSummary.discoveryCount || 0 })}
                </span>
              </>
            ) : transferSummary.isActive ? (
              <>
                <ArrowDown className="w-3 h-3 text-emerald-400 animate-pulse" />
                <div className="flex items-center space-x-2">
                  <span className="text-foreground font-medium text-[11px] tabular-nums">
                    {t('browser.uploadingPercent', { percent: transferSummary.percentage.toFixed(0) })}
                  </span>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden border border-border/50">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                      style={{ width: `${transferSummary.percentage}%` }}
                    />
                  </div>
                  {transferSummary.speedBytesPerSec > 0 && (
                    <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                      {formatSpeed(transferSummary.speedBytesPerSec)}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {t('browser.activeQueued', {
                      running: transferSummary.runningCount,
                      queued: transferSummary.queuedCount,
                    })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-foreground font-medium text-[11px]">
                  {t('browser.uploadedFiles', { count: transferSummary.completedCount })}
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center space-x-1.5 text-muted-foreground">
          {window.electronAPI?.isElectron && (
            <>
              <span className="hidden lg:inline text-[10px]">{t('browser.copyToExplorerHint')}</span>
              <kbd className="hidden lg:inline bg-muted border border-border px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono">
                Ctrl+C
              </kbd>
              <span className="hidden lg:inline text-border">•</span>
            </>
          )}
          <span>{t('browser.previewHint')}</span>
          <kbd className="bg-muted border border-border px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono">
            Space
          </kbd>
        </div>
      </div>

      {/* Floating active clipboard copy feedback banner */}
      {copyState && (
        <div
          className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-plane-surface/95 backdrop-blur-md border shadow-2xl rounded-full px-4 py-2 flex items-center space-x-2 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 select-none pointer-events-auto ${
            copyState.type === 'error'
              ? 'border-destructive/50 text-destructive'
              : copyState.type === 'success'
              ? 'border-emerald-500/50 text-emerald-400'
              : 'border-primary/50 text-foreground'
          }`}
        >
          {copyState.isCopying ? (
            <RefreshCw className="w-4 h-4 text-primary animate-spin" />
          ) : copyState.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-destructive" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400" />
          )}
          <span>{copyState.message}</span>
        </div>
      )}

      {/* Context Menu for right click & mobile long-press */}
      <ItemContextMenu
        isOpen={Boolean(contextMenu)}
        item={contextMenu?.item || null}
        position={contextMenu?.position || null}
        isSelected={contextMenu ? selectedKeys.has(contextMenu.item.key) : false}
        onClose={() => setContextMenu(null)}
        onOpen={(item) => onItemDoubleClick(item)}
        onToggleSelect={(key) => handleToggleSelect(key, false)}
        onCopy={(item) => handleCopySelected([item])}
        onOpenTags={(item) => setTaggingItems([item])}
        onDownload={(item) => onDownloadItem(item)}
        onDelete={(item) => onDeleteItems([item.key])}
        onOpenExternal={onOpenExternal}
        onPresignedUrl={onPresignedUrl}
        onOpenMonaco={onOpenMonaco}
        onOpenPdf={onOpenPdf}
        onOpenGallery={onOpenGallery}
        canDeleteItems={canDeleteItems}
        canEditTags={canEditTags}
        isProActive={isProActive}
      />

      {/* Context Menu for right click on empty/folder background */}
      <FolderContextMenu
        isOpen={Boolean(folderContextMenu)}
        position={folderContextMenu?.position || null}
        onClose={() => setFolderContextMenu(null)}
        onUploadFiles={onUploadFilesClick}
        onUploadFolder={onUploadFolderClick}
        onCreateFolder={onCreateFolderClick}
        onRefresh={onRefresh}
        hasSelection={selectedKeys.size > 0}
        onClearSelection={() => setSelectedKeys(new Set())}
        canUpload={canUpload}
        canCreateFolder={canCreateFolder}
      />

      {/* S3 Object Tags Modal */}
      <ObjectTagsModal
        isOpen={Boolean(taggingItems)}
        items={taggingItems || []}
        profile={profile}
        bucket={bucket}
        onClose={() => setTaggingItems(null)}
        onTagsUpdated={(updatedKeys, tags, resultsMap) => {
          if (resultsMap) {
            setTagsMap((prev) => {
              const next = { ...prev };
              for (const [k, fileTags] of Object.entries(resultsMap)) {
                if (!fileTags || fileTags.length === 0) {
                  delete next[k];
                } else {
                  next[k] = fileTags;
                }
              }
              return next;
            });
          } else if (updatedKeys && tags) {
            setTagsMap((prev) => {
              const next = { ...prev };
              for (const k of updatedKeys) {
                if (tags.length === 0) {
                  delete next[k];
                } else {
                  next[k] = tags;
                }
              }
              return next;
            });
          }
          onRefresh();
        }}
      />
    </div>
  );
};
