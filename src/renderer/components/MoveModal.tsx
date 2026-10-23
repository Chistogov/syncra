import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Folder,
  FolderInput,
  FolderPlus,
  ChevronRight,
  ArrowUp,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { S3Item, S3Profile } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

export interface MoveModalProps {
  isOpen: boolean;
  items: S3Item[];
  profile: S3Profile | null;
  bucket: string;
  initialPrefix?: string;
  onClose: () => void;
  onMoveConfirm: (targetPrefix: string) => Promise<void>;
}

export const MoveModal: React.FC<MoveModalProps> = ({
  isOpen,
  items,
  profile,
  bucket,
  initialPrefix = '',
  onClose,
  onMoveConfirm,
}) => {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState(initialPrefix);
  const [subfolders, setSubfolders] = useState<S3Item[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline folder creation
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isFolderSubmitting, setIsFolderSubmitting] = useState(false);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPrefix);
      setError(null);
      setIsSubmitting(false);
      setIsCreatingFolder(false);
      setNewFolderName('');
    }
  }, [isOpen, initialPrefix]);

  // Load subfolders for currentPath
  const loadSubfolders = useCallback(
    async (path: string) => {
      if (!profile || !bucket) return;
      setIsLoadingFolders(true);
      setError(null);
      try {
        const res = await window.electronAPI.s3.listObjects(profile, bucket, path);
        const folders = res.items.filter((item) => item.isPrefix);
        setSubfolders(folders);
      } catch (err: any) {
        console.error('Failed to load subfolders in MoveModal:', err);
        setError(err.message || t('moveModal.error'));
        setSubfolders([]);
      } finally {
        setIsLoadingFolders(false);
      }
    },
    [profile, bucket, t]
  );

  useEffect(() => {
    if (isOpen && profile && bucket) {
      loadSubfolders(currentPath);
    }
  }, [isOpen, currentPath, profile, bucket, loadSubfolders]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        if (isCreatingFolder) {
          setIsCreatingFolder(false);
          setNewFolderName('');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, isCreatingFolder, onClose]);

  if (!isOpen || items.length === 0) return null;

  // Determine current parent of items to know if targetPath is unchanged
  const getItemParentPrefix = (key: string, isPrefix: boolean) => {
    const clean = isPrefix ? key.replace(/\/$/, '') : key;
    const lastSlash = clean.lastIndexOf('/');
    return lastSlash >= 0 ? clean.substring(0, lastSlash + 1) : '';
  };

  const isCurrentLocation = items.every(
    (item) => getItemParentPrefix(item.key, item.isPrefix) === currentPath
  );

  // Check if currentPath is invalid because moving a folder into itself or its descendants
  const isMovingIntoSelfOrDescendant = items.some((item) => {
    if (!item.isPrefix) return false;
    const folderKey = item.key.endsWith('/') ? item.key : `${item.key}/`;
    return currentPath === folderKey || currentPath.startsWith(folderKey);
  });

  const handleNavigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.replace(/\/$/, '').split('/');
    parts.pop();
    const newPath = parts.length > 0 ? parts.join('/') + '/' : '';
    setCurrentPath(newPath);
  };

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newFolderName.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    if (clean.includes('/')) {
      setError(t('renameModal.slashError'));
      return;
    }

    try {
      setIsFolderSubmitting(true);
      setError(null);
      const newKey = `${currentPath}${clean}/`;
      if (profile && bucket) {
        await window.electronAPI.s3.createFolder(profile, bucket, newKey);
        setNewFolderName('');
        setIsCreatingFolder(false);
        await loadSubfolders(currentPath);
      }
    } catch (err: any) {
      setError(err.message || t('folderModal.error'));
    } finally {
      setIsFolderSubmitting(false);
    }
  };

  const handleConfirmMove = async () => {
    if (isCurrentLocation || isMovingIntoSelfOrDescendant || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await onMoveConfirm(currentPath);
      onClose();
    } catch (err: any) {
      setError(err.message || t('moveModal.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Breadcrumbs parsing
  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fade-in select-none">
      <div className="bg-plane-surface border border-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-foreground animate-in zoom-in-95 duration-150 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FolderInput className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">
                {items.length === 1
                  ? items[0].isPrefix
                    ? t('moveModal.singleFolderTitle')
                    : t('moveModal.singleFileTitle')
                  : t('moveModal.multipleTitle').replace('{count}', items.length.toString())}
              </h3>
              <p className="text-[11px] text-muted-foreground truncate max-w-[320px]">
                {items.length === 1
                  ? items[0].name
                  : items.map((i) => i.name).slice(0, 3).join(', ') +
                    (items.length > 3 ? ` +${items.length - 3}` : '')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-5 mt-4 p-2.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Breadcrumb Navigation Bar */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-border/40 bg-muted/20 flex-shrink-0">
          <div className="flex items-center space-x-1 text-xs overflow-x-auto py-1 scrollbar-none font-medium">
            <button
              onClick={() => setCurrentPath('')}
              className={`hover:text-primary transition-colors flex items-center space-x-1 px-1.5 py-0.5 rounded ${
                currentPath === ''
                  ? 'text-primary font-semibold bg-primary/10'
                  : 'text-muted-foreground'
              }`}
            >
              <span>{bucket}</span>
            </button>
            {pathParts.map((part, index) => {
              const partPath = pathParts.slice(0, index + 1).join('/') + '/';
              const isLast = index === pathParts.length - 1;
              return (
                <React.Fragment key={partPath}>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
                  <button
                    onClick={() => setCurrentPath(partPath)}
                    className={`hover:text-primary transition-colors px-1.5 py-0.5 rounded truncate max-w-[120px] ${
                      isLast
                        ? 'text-primary font-semibold bg-primary/10'
                        : 'text-muted-foreground'
                    }`}
                    title={part}
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0">
            {currentPath && (
              <button
                type="button"
                onClick={handleNavigateUp}
                title={t('moveModal.up')}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCreatingFolder((v) => !v)}
              title={t('moveModal.newFolder')}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Inline new folder creation */}
        {isCreatingFolder && (
          <form
            onSubmit={handleCreateNewFolder}
            className="flex items-center space-x-2 px-5 py-2.5 bg-muted/40 border-b border-border/40"
          >
            <FolderPlus className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t('menu.newFolder')}
              className="flex-1 text-xs bg-background border border-border rounded px-2.5 py-1 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              disabled={isFolderSubmitting}
            />
            <button
              type="submit"
              disabled={isFolderSubmitting || !newFolderName.trim()}
              className="px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isFolderSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              className="p-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Folder list content */}
        <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[340px] p-2 space-y-0.5">
          {isLoadingFolders ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">{t('moveModal.loadingFolders')}</span>
            </div>
          ) : subfolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2 select-none">
              <Folder className="w-8 h-8 opacity-30" />
              <span className="text-xs">{t('moveModal.noSubfolders')}</span>
            </div>
          ) : (
            subfolders.map((folder) => {
              // Check if folder is invalid (moving into itself or child of moving item)
              const isForbidden = items.some((item) => {
                if (!item.isPrefix) return false;
                const fKey = item.key.endsWith('/') ? item.key : `${item.key}/`;
                return folder.key === fKey || folder.key.startsWith(fKey);
              });

              return (
                <div
                  key={folder.key}
                  onClick={() => {
                    if (!isForbidden) {
                      setCurrentPath(folder.key);
                    }
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors group ${
                    isForbidden
                      ? 'opacity-40 cursor-not-allowed bg-muted/10'
                      : 'hover:bg-muted cursor-pointer text-foreground'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 overflow-hidden">
                    <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="font-medium truncate">{folder.name}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    {isForbidden ? (
                      <span className="text-[10px] text-muted-foreground italic">
                        {t('moveModal.cannotMoveIntoSelf')}
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/80 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-muted-foreground truncate w-full sm:w-auto">
            <span>{t('moveModal.destination')}: </span>
            <span className="font-mono text-foreground font-semibold">
              /{currentPath || t('moveModal.root')}
            </span>
            {isCurrentLocation && (
              <span className="block sm:inline text-amber-500 text-[11px] sm:ml-2">
                ({t('moveModal.alreadyInThisFolder')})
              </span>
            )}
            {isMovingIntoSelfOrDescendant && (
              <span className="block sm:inline text-destructive text-[11px] sm:ml-2">
                ({t('moveModal.cannotMoveIntoDescendant')})
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmMove}
              disabled={
                isSubmitting ||
                isCurrentLocation ||
                isMovingIntoSelfOrDescendant
              }
              className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {isSubmitting ? t('moveModal.moving') : t('moveModal.moveHere')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
