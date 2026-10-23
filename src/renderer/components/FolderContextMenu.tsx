import React, { useEffect } from 'react';
import {
  Upload,
  FolderUp,
  FolderPlus,
  RefreshCw,
  Square,
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

export interface FolderContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  onCreateFolder: () => void;
  onRefresh?: () => void;
  hasSelection?: boolean;
  onClearSelection?: () => void;
  canUpload?: boolean;
  canCreateFolder?: boolean;
}

export const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  isOpen,
  position,
  onClose,
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  onRefresh,
  hasSelection = false,
  onClearSelection,
  canUpload = true,
  canCreateFolder = true,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  let menuStyle: React.CSSProperties = {};
  if (!isMobile && position) {
    const menuWidth = 220;
    const menuHeight = 220;
    const padding = 12;

    let left = position.x;
    let top = position.y;

    if (left + menuWidth > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - menuWidth - padding);
    }
    if (top + menuHeight > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - menuHeight - padding);
    }

    menuStyle = {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
    };
  }

  return (
    <div
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`fixed inset-0 z-50 select-none ${
        isMobile
          ? 'bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200'
          : 'bg-transparent'
      }`}
    >
      {isMobile ? (
        /* Mobile Touch Bottom Action Sheet */
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-plane-surface border-t border-border rounded-t-2xl shadow-2xl p-4 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200"
        >
          {/* Pull handle */}
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />

          {/* Action List */}
          <div className="flex flex-col space-y-1 mt-1">
            {canUpload && (
              <button
                onClick={() => {
                  onClose();
                  onUploadFiles();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <Upload className="w-4 h-4 text-primary" />
                <span>{t('menu.uploadFiles')}</span>
              </button>
            )}

            {canUpload && (
              <button
                onClick={() => {
                  onClose();
                  onUploadFolder();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <FolderUp className="w-4 h-4 text-emerald-500" />
                <span>{t('menu.uploadFolder')}</span>
              </button>
            )}

            {canCreateFolder && (
              <button
                onClick={() => {
                  onClose();
                  onCreateFolder();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <FolderPlus className="w-4 h-4 text-amber-500" />
                <span>{t('menu.newFolder')}</span>
              </button>
            )}

            {onRefresh && (
              <button
                onClick={() => {
                  onClose();
                  onRefresh();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                <span>{t('menu.refresh')}</span>
              </button>
            )}

            {hasSelection && onClearSelection && (
              <button
                onClick={() => {
                  onClose();
                  onClearSelection();
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <Square className="w-4 h-4 text-muted-foreground" />
                <span>{t('menu.clearSelection')}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Desktop Context Menu */
        <div
          onClick={(e) => e.stopPropagation()}
          style={menuStyle}
          className="bg-plane-surface/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-1.5 min-w-[210px] animate-in fade-in zoom-in-95 duration-100 z-50 text-xs"
        >
          {/* Upload Files */}
          <button
            onClick={() => {
              if (!canUpload) return;
              onClose();
              onUploadFiles();
            }}
            disabled={!canUpload}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              canUpload
                ? 'hover:bg-muted text-foreground cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-muted-foreground'
            }`}
          >
            <Upload className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1 truncate">{t('menu.uploadFiles')}</span>
          </button>

          {/* Upload Folder */}
          <button
            onClick={() => {
              if (!canUpload) return;
              onClose();
              onUploadFolder();
            }}
            disabled={!canUpload}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              canUpload
                ? 'hover:bg-muted text-foreground cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-muted-foreground'
            }`}
          >
            <FolderUp className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="flex-1 truncate">{t('menu.uploadFolder')}</span>
          </button>

          {/* New Folder */}
          <button
            onClick={() => {
              if (!canCreateFolder) return;
              onClose();
              onCreateFolder();
            }}
            disabled={!canCreateFolder}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              canCreateFolder
                ? 'hover:bg-muted text-foreground cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-muted-foreground'
            }`}
          >
            <FolderPlus className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="flex-1 truncate">{t('menu.newFolder')}</span>
          </button>

          {/* Divider */}
          {onRefresh && <div className="my-1 border-t border-border/60" />}

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={() => {
                onClose();
                onRefresh();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{t('menu.refresh')}</span>
            </button>
          )}

          {/* Clear Selection if any */}
          {hasSelection && onClearSelection && (
            <>
              <div className="my-1 border-t border-border/60" />
              <button
                onClick={() => {
                  onClose();
                  onClearSelection();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
              >
                <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{t('menu.clearSelection')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
