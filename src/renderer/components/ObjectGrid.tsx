import React, { useState, useEffect, useRef } from 'react';
import { Download, ExternalLink, Link2, Trash2, Eye, FileImage, FileCode, FileText, Images, Tag } from 'lucide-react';
import { S3Item, S3Profile, S3Tag } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import { formatBytes } from '../utils/formatters';
import { getFileIcon } from '../utils/fileIcons';
import { isCodeOrText, isPdfFile, isImageFile } from '../utils/fileTypes';

interface GridItemThumbnailProps {
  item: S3Item;
  profile: S3Profile | null;
  bucket: string;
}

const GridItemThumbnail: React.FC<GridItemThumbnailProps> = ({ item, profile, bucket }) => {
  const isImage =
    !item.isPrefix &&
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(item.extension?.toLowerCase() || '');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isImage);

  useEffect(() => {
    let isMounted = true;
    if (isImage && profile && bucket) {
      setLoading(true);
      window.electronAPI.s3
        .getThumbnail(profile, bucket, item.key)
        .then((thumb) => {
          if (isMounted) {
            setThumbnail(thumb);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [item.key, bucket, profile, isImage]);

  if (isImage && thumbnail) {
    return (
      <div className="w-full h-24 mb-2 overflow-hidden rounded-md bg-black/60 flex items-center justify-center border border-border/60 group-hover:border-border transition-colors pointer-events-none">
        <img
          src={thumbnail}
          alt={item.name}
          className="w-full h-full object-cover rounded-md group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />
      </div>
    );
  }

  if (isImage && loading) {
    return (
      <div className="w-full h-24 mb-2 rounded-md bg-muted/40 border border-border/40 flex items-center justify-center animate-pulse pointer-events-none">
        <FileImage className="w-7 h-7 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="my-3 flex items-center justify-center pointer-events-none">
      {getFileIcon(item.isPrefix, item.extension, 'w-10 h-10')}
    </div>
  );
};

interface ObjectGridCardProps {
  item: S3Item;
  profile: S3Profile | null;
  bucket: string;
  isSelected: boolean;
  onToggleSelect: (key: string) => void;
  onItemOpen: (item: S3Item) => void;
  onContextMenu: (item: S3Item, pos: { x: number; y: number }) => void;
  onPreview: (item: S3Item) => void;
  onDownload: (item: S3Item) => void;
  onOpenExternal: (item: S3Item) => void;
  onPresignedUrl: (item: S3Item) => void;
  onOpenMonaco: (item: S3Item) => void;
  onOpenPdf?: (item: S3Item) => void;
  onOpenGallery?: (item: S3Item) => void;
  onDelete: (item: S3Item) => void;
  tags?: S3Tag[];
  onOpenTags?: (item: S3Item) => void;
  canDeleteItems?: boolean;
  canEditTags?: boolean;
  isProActive?: boolean;
}

const ObjectGridCard: React.FC<ObjectGridCardProps> = ({
  item,
  profile,
  bucket,
  isSelected,
  onToggleSelect,
  onItemOpen,
  onContextMenu,
  onPreview,
  onDownload,
  onOpenExternal,
  onPresignedUrl,
  onOpenMonaco,
  onOpenPdf,
  onOpenGallery,
  onDelete,
  tags,
  onOpenTags,
  canDeleteItems = true,
  canEditTags = true,
  isProActive = true,
}) => {
  const { t } = useTranslation();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressActiveRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    isLongPressActiveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      if (navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch (_) {}
      }
      onContextMenu(item, { x: touch.clientX, y: touch.clientY });
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!startPosRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startPosRef.current.x);
    const dy = Math.abs(touch.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isLongPressActiveRef.current) {
      setTimeout(() => {
        isLongPressActiveRef.current = false;
      }, 300);
    }
  };

  const handleTouchCancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    isLongPressActiveRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPressActiveRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onItemOpen(item);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(item, { x: e.clientX, y: e.clientY });
  };

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className={`group relative flex flex-col items-center p-2.5 rounded-lg border cursor-pointer transition-all select-none ${
        isSelected
          ? 'bg-primary/10 border-primary ring-1 ring-primary/40 shadow-xs'
          : 'bg-plane-surface border-border hover:bg-muted/40 hover:border-border/80'
      }`}
    >
      {/* Top-left Selection Checkbox */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(item.key);
        }}
        className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all cursor-pointer ${
          isSelected
            ? 'opacity-100 bg-primary text-primary-foreground shadow-xs'
            : 'opacity-80 sm:opacity-0 sm:group-hover:opacity-100 bg-plane-surface/90 text-muted-foreground hover:text-foreground border border-border shadow-xs'
        }`}
        title={isSelected ? t('table.unselect') : t('table.select')}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-0 cursor-pointer pointer-events-none"
        />
      </div>

      {/* Top-right Tag Badge (fades when hover quick action bar appears) */}
      {tags && tags.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenTags?.(item);
          }}
          className="absolute top-2 right-2 z-5 sm:group-hover:opacity-0 transition-opacity inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 shadow-xs cursor-pointer backdrop-blur-xs"
          title={`${t('table.tags', { count: tags.length })}\n${tags.map((t) => `${t.key}=${t.value}`).join('\n')}`}
        >
          <Tag className="w-2.5 h-2.5" />
          <span>{tags.length}</span>
        </button>
      )}

      {/* Top-right quick action hover bar (hidden on small/mobile screens - available via long-press/context menu) */}
      <div className="absolute top-1.5 right-1.5 hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 items-center space-x-0.5 transition-opacity bg-plane-surface/90 backdrop-blur-md rounded-md p-0.5 border border-border shadow-xs z-10">
        {item.isPrefix ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(item);
              }}
              className="p-1 hover:text-foreground text-muted-foreground hover:bg-muted rounded"
              title={t('table.downloadFolder')}
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              className="p-1 hover:text-destructive text-muted-foreground hover:bg-destructive/10 rounded"
              title={t('menu.deleteFolder')}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview(item);
              }}
              className="p-1 hover:text-foreground text-muted-foreground hover:bg-muted rounded"
              title={t('table.quickPreview')}
            >
              <Eye className="w-3 h-3" />
            </button>
            {isCodeOrText(item.extension, item.name) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMonaco(item);
                }}
                className="p-1 hover:text-foreground text-muted-foreground hover:bg-muted rounded"
                title={isProActive ? t('table.editMonaco') : t('table.editMonacoPro')}
              >
                <FileCode className="w-3 h-3" />
              </button>
            )}
            {isPdfFile(item.extension) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenPdf) onOpenPdf(item);
                  else onPreview(item);
                }}
                className="p-1 hover:text-rose-400 text-muted-foreground hover:bg-rose-500/10 rounded"
                title={t('table.openPdf')}
              >
                <FileText className="w-3 h-3" />
              </button>
            )}
            {isImageFile(item.extension) && onOpenGallery && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenGallery(item);
                }}
                className="p-1 hover:text-primary text-muted-foreground hover:bg-primary/10 rounded"
                title={t('table.openGallery')}
              >
                <Images className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenExternal(item);
              }}
              className="p-1 hover:text-primary text-muted-foreground hover:bg-primary/10 rounded"
              title={t('menu.openExternal')}
            >
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPresignedUrl(item);
              }}
              className="p-1 hover:text-amber-400 text-muted-foreground hover:bg-amber-500/10 rounded"
              title={t('browser.presignedUrl')}
            >
              <Link2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(item);
              }}
              className="p-1 hover:text-foreground text-muted-foreground hover:bg-muted rounded"
              title={t('table.download')}
            >
              <Download className="w-3 h-3" />
            </button>
            {canEditTags && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTags?.(item);
                }}
                className="p-1 hover:text-primary text-muted-foreground hover:bg-primary/10 rounded"
                title={t('menu.tags')}
              >
                <Tag className="w-3 h-3" />
              </button>
            )}
            {canDeleteItems && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item);
                }}
                className="p-1 hover:text-destructive text-muted-foreground hover:bg-destructive/10 rounded"
                title={t('table.delete')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Thumbnail preview or Icon */}
      <GridItemThumbnail item={item} profile={profile} bucket={bucket} />

      {/* Name */}
      <span
        className="text-xs font-medium text-foreground text-center w-full truncate px-1 group-hover:text-primary transition-colors"
        title={item.name}
      >
        {item.name}
      </span>

      {/* Sub-label and Tags */}
      <div className="flex items-center justify-center space-x-1.5 mt-0.5 max-w-full px-1">
        <span className="text-[10px] text-muted-foreground font-mono">
          {item.isPrefix ? t('table.folder') : formatBytes(item.size)}
        </span>
        {tags && tags.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTags?.(item);
            }}
            className="inline-flex items-center space-x-0.5 px-1 py-0.2 rounded text-[9px] font-normal bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors shrink-0 cursor-pointer"
            title={`${t('table.tags', { count: tags.length })}\n${tags.map((t) => `${t.key}=${t.value}`).join('\n')}`}
          >
            <Tag className="w-2.5 h-2.5" />
            <span>{tags.length}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export interface ObjectGridProps {
  items: S3Item[];
  profile: S3Profile | null;
  bucket: string;
  selectedKeys: Set<string>;
  onToggleSelect: (key: string, isShift: boolean) => void;
  onItemDoubleClick: (item: S3Item) => void;
  onItemContextMenu: (item: S3Item, pos: { x: number; y: number }) => void;
  onPreview: (item: S3Item) => void;
  onDownload: (item: S3Item) => void;
  onOpenExternal: (item: S3Item) => void;
  onPresignedUrl: (item: S3Item) => void;
  onOpenMonaco: (item: S3Item) => void;
  onOpenPdf?: (item: S3Item) => void;
  onOpenGallery?: (item: S3Item) => void;
  onDelete: (item: S3Item) => void;
  tagsMap?: Record<string, S3Tag[]>;
  onOpenTags?: (item: S3Item) => void;
  canDeleteItems?: boolean;
  canEditTags?: boolean;
  isProActive?: boolean;
}

export const ObjectGrid: React.FC<ObjectGridProps> = ({
  items,
  profile,
  bucket,
  selectedKeys,
  onToggleSelect,
  onItemDoubleClick,
  onItemContextMenu,
  onPreview,
  onDownload,
  onOpenExternal,
  onPresignedUrl,
  onOpenMonaco,
  onOpenPdf,
  onOpenGallery,
  onDelete,
  tagsMap,
  onOpenTags,
  canDeleteItems = true,
  canEditTags = true,
  isProActive = true,
}) => {
  return (
    <div className="w-full h-full overflow-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 content-start">
      {items.map((item) => (
        <ObjectGridCard
          key={item.key}
          item={item}
          profile={profile}
          bucket={bucket}
          isSelected={selectedKeys.has(item.key)}
          onToggleSelect={(key) => onToggleSelect(key, false)}
          onItemOpen={onItemDoubleClick}
          onContextMenu={onItemContextMenu}
          onPreview={onPreview}
          onDownload={onDownload}
          onOpenExternal={onOpenExternal}
          onPresignedUrl={onPresignedUrl}
          onOpenMonaco={onOpenMonaco}
          onOpenPdf={onOpenPdf}
          onOpenGallery={onOpenGallery}
          onDelete={onDelete}
          tags={tagsMap?.[item.key]}
          onOpenTags={onOpenTags}
          canDeleteItems={canDeleteItems}
          canEditTags={canEditTags}
          isProActive={isProActive}
        />
      ))}
    </div>
  );
};
