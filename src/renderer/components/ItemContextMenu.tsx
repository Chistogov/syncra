import React, { useEffect } from 'react';
import {
  FolderOpen,
  Eye,
  Maximize2,
  FileCode,
  ExternalLink,
  CheckSquare,
  Square,
  Link2,
  Copy,
  Tag,
  Download,
  Trash2,
  X,
  Images,
} from 'lucide-react';
import { S3Item } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import { formatBytes, formatDate } from '../utils/formatters';
import { getFileIcon } from '../utils/fileIcons';
import { isCodeOrText, isPdfFile, isImageFile } from '../utils/fileTypes';

export interface ItemContextMenuProps {
  item: S3Item | null;
  position: { x: number; y: number } | null;
  isOpen: boolean;
  isSelected: boolean;
  onClose: () => void;
  onOpen: (item: S3Item) => void;
  onToggleSelect: (key: string) => void;
  onCopy?: (item: S3Item) => void;
  onOpenTags?: (item: S3Item) => void;
  onDownload: (item: S3Item) => void;
  onDelete: (item: S3Item) => void;
  onOpenExternal?: (item: S3Item) => void;
  onPresignedUrl?: (item: S3Item) => void;
  onOpenMonaco?: (item: S3Item) => void;
  onOpenPdf?: (item: S3Item) => void;
  onOpenGallery?: (item: S3Item) => void;
  canDeleteItems?: boolean;
  canEditTags?: boolean;
  isProActive?: boolean;
}

export const ItemContextMenu: React.FC<ItemContextMenuProps> = ({
  item,
  position,
  isOpen,
  isSelected,
  onClose,
  onOpen,
  onToggleSelect,
  onCopy,
  onOpenTags,
  onDownload,
  onDelete,
  onOpenExternal,
  onPresignedUrl,
  onOpenMonaco,
  onOpenPdf,
  onOpenGallery,
  canDeleteItems = true,
  canEditTags = true,
  isProActive = true,
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

  if (!isOpen || !item) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  let menuStyle: React.CSSProperties = {};
  if (!isMobile && position) {
    const menuWidth = 240;
    const menuHeight = 350;
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
          {/* Pull pill handle */}
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-muted/80 border border-border flex items-center justify-center flex-shrink-0">
                {getFileIcon(item.isPrefix, item.extension, 'w-5 h-5')}
              </div>
              <div className="truncate">
                <h4 className="font-semibold text-sm text-foreground truncate" title={item.name}>
                  {item.name}
                </h4>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {item.isPrefix ? t('table.folder') : `${formatBytes(item.size)} • ${formatDate(item.lastModified)}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors flex-shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action List */}
          <div className="flex flex-col space-y-1 mt-2.5 overflow-y-auto max-h-[50vh]">
            {/* Open / Preview */}
            <button
              onClick={() => {
                onClose();
                onOpen(item);
              }}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
            >
              {item.isPrefix ? <FolderOpen className="w-4 h-4 text-primary" /> : <Eye className="w-4 h-4 text-primary" />}
              <span>{item.isPrefix ? t('menu.openFolder') : t('menu.quickPreview')}</span>
            </button>

            {/* Gallery Viewer */}
            {!item.isPrefix && isImageFile(item.extension) && onOpenGallery && (
              <button
                onClick={() => {
                  onClose();
                  onOpenGallery(item);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/10 active:bg-primary/20 text-primary transition-colors"
              >
                <Images className="w-4 h-4" />
                <span>{t('menu.openGallery')}</span>
              </button>
            )}

            {/* PDF Modal Viewer */}
            {!item.isPrefix && isPdfFile(item.extension) && onOpenPdf && (
              <button
                onClick={() => {
                  onClose();
                  onOpenPdf(item);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-rose-500/10 active:bg-rose-500/20 text-rose-400 transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
                <span>{t('menu.openPdfModal')}</span>
              </button>
            )}

            {/* Monaco Editor */}
            {!item.isPrefix && isCodeOrText(item.extension, item.name) && onOpenMonaco && (
              <button
                onClick={() => {
                  onClose();
                  onOpenMonaco(item);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/10 active:bg-primary/20 text-primary transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <FileCode className="w-4 h-4" />
                  <span>{t('menu.editMonaco')}</span>
                </div>
                {!isProActive && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    PRO
                  </span>
                )}
              </button>
            )}

            {/* External Program */}
            {!item.isPrefix && onOpenExternal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenExternal(item);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                <span>{t('menu.openExternal')}</span>
              </button>
            )}

            {/* Toggle Selection */}
            <button
              onClick={() => {
                onClose();
                onToggleSelect(item.key);
              }}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
            >
              {isSelected ? <Square className="w-4 h-4 text-muted-foreground" /> : <CheckSquare className="w-4 h-4 text-primary" />}
              <span>{isSelected ? t('menu.unselect') : t('menu.select')}</span>
            </button>

            {/* S3 Object Tags */}
            {canEditTags && !item.isPrefix && onOpenTags && (
              <button
                onClick={() => {
                  onClose();
                  onOpenTags(item);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <Tag className="w-4 h-4 text-primary" />
                <span>{t('menu.tags')}</span>
              </button>
            )}

            {/* Presigned URL */}
            {!item.isPrefix && onPresignedUrl && (
              <button
                onClick={() => {
                  onClose();
                  onPresignedUrl(item);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-500/10 active:bg-amber-500/20 text-amber-400 transition-colors"
              >
                <Link2 className="w-4 h-4" />
                <span>{t('menu.copyPresignedUrl')}</span>
              </button>
            )}

            {/* Copy for Explorer */}
            {onCopy && (
              <button
                onClick={() => {
                  onClose();
                  onCopy(item);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
              >
                <Copy className="w-4 h-4 text-muted-foreground" />
                <span>{item.isPrefix ? t('menu.copyFolderForExplorer') : t('menu.copyForExplorer')}</span>
              </button>
            )}

            {/* Download */}
            <button
              onClick={() => {
                onClose();
                onDownload(item);
              }}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
              <span>{item.isPrefix ? t('menu.downloadFolder') : t('menu.downloadFile')}</span>
            </button>

            {/* Delete */}
            {canDeleteItems && (
              <button
                onClick={() => {
                  onClose();
                  onDelete(item);
                }}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-destructive/10 active:bg-destructive/20 text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{item.isPrefix ? t('menu.deleteFolder') : t('menu.deleteFile')}</span>
              </button>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full mt-3 py-2.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground font-medium text-sm transition-colors text-center"
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        /* Desktop Floating Context Menu */
        <div
          style={menuStyle}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[210px] max-w-[260px] bg-plane-surface border border-border rounded-xl shadow-2xl p-1.5 text-xs text-foreground select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-1.5 border-b border-border/50 mb-1 flex items-center space-x-2">
            {getFileIcon(item.isPrefix, item.extension, 'w-4 h-4 flex-shrink-0')}
            <div className="truncate">
              <p className="font-semibold text-xs text-foreground truncate" title={item.name}>
                {item.name}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {item.isPrefix ? t('table.folder') : formatBytes(item.size)}
              </p>
            </div>
          </div>

          {/* Open / Preview */}
          <button
            onClick={() => {
              onClose();
              onOpen(item);
            }}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left"
          >
            {item.isPrefix ? <FolderOpen className="w-3.5 h-3.5 text-primary" /> : <Eye className="w-3.5 h-3.5 text-primary" />}
            <span>{item.isPrefix ? t('menu.openFolder') : t('menu.preview')}</span>
          </button>

          {/* Gallery Viewer */}
          {!item.isPrefix && isImageFile(item.extension) && onOpenGallery && (
            <button
              onClick={() => {
                onClose();
                onOpenGallery(item);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors text-left"
            >
              <Images className="w-3.5 h-3.5" />
              <span>{t('menu.galleryView')}</span>
            </button>
          )}

          {/* PDF Modal Viewer */}
          {!item.isPrefix && isPdfFile(item.extension) && onOpenPdf && (
            <button
              onClick={() => {
                onClose();
                onOpenPdf(item);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-rose-500/10 text-rose-400 transition-colors text-left"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{t('menu.inModal')}</span>
            </button>
          )}

          {/* Monaco Editor */}
          {!item.isPrefix && isCodeOrText(item.extension, item.name) && onOpenMonaco && (
            <button
              onClick={() => {
                onClose();
                onOpenMonaco(item);
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors text-left"
            >
              <div className="flex items-center space-x-2">
                <FileCode className="w-3.5 h-3.5" />
                <span>{t('menu.editMonaco')}</span>
              </div>
              {!isProActive && (
                <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  PRO
                </span>
              )}
            </button>
          )}

          {/* External Program */}
          {!item.isPrefix && onOpenExternal && (
            <button
              onClick={() => {
                onClose();
                onOpenExternal(item);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('menu.openExternal')}</span>
            </button>
          )}

          {/* Toggle Selection */}
          <button
            onClick={() => {
              onClose();
              onToggleSelect(item.key);
            }}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left"
          >
            {isSelected ? <Square className="w-3.5 h-3.5 text-muted-foreground" /> : <CheckSquare className="w-3.5 h-3.5 text-primary" />}
            <span>{isSelected ? t('menu.unselect') : t('menu.select')}</span>
          </button>

          {/* S3 Object Tags */}
          {canEditTags && !item.isPrefix && onOpenTags && (
            <button
              onClick={() => {
                onClose();
                onOpenTags(item);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left"
            >
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span>{t('menu.tags')}</span>
            </button>
          )}

          {/* Presigned URL */}
          {!item.isPrefix && onPresignedUrl && (
            <button
              onClick={() => {
                onClose();
                onPresignedUrl(item);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-amber-500/10 text-amber-400 transition-colors text-left"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{t('browser.presignedUrl')}</span>
            </button>
          )}

          {/* Copy for Explorer */}
          {onCopy && (
            <button
              onClick={() => {
                onClose();
                onCopy(item);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left"
            >
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('menu.copyShortcut')}</span>
            </button>
          )}

          {/* Download */}
          <button
            onClick={() => {
              onClose();
              onDownload(item);
            }}
            className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{item.isPrefix ? t('menu.downloadFolder') : t('menu.download')}</span>
          </button>

          <div className="my-1 border-t border-border/50" />

          {/* Delete */}
          {canDeleteItems && (
            <button
              onClick={() => {
                onClose();
                onDelete(item);
              }}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors text-left"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('menu.delete')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
