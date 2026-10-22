import React, { useRef } from 'react';
import {
  Download,
  ExternalLink,
  Link2,
  Trash2,
  Eye,
  ArrowUpDown,
  FileCode,
  FileText,
  Images,
  Tag,
} from 'lucide-react';
import { S3Item, S3Tag } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import { formatBytes, formatDate } from '../utils/formatters';
import { getFileIcon } from '../utils/fileIcons';
import { isCodeOrText, isPdfFile, isImageFile } from '../utils/fileTypes';

interface ObjectTableRowProps {
  item: S3Item;
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
  isProActive?: boolean;
}

const ObjectTableRow: React.FC<ObjectTableRowProps> = ({
  item,
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
    // If movement > 10px, cancel long-press (user is scrolling)
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
    <tr
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className={`group cursor-pointer select-none transition-colors ${
        isSelected
          ? 'bg-primary/10 text-foreground'
          : 'hover:bg-muted/40 text-foreground/90'
      }`}
    >
      {/* Checkbox column (selection only) */}
      <td className="py-2 px-3 w-8" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            onToggleSelect(item.key);
            e.currentTarget.blur();
          }}
          className="w-3.5 h-3.5 rounded border-border bg-plane-surface text-primary focus:ring-0 cursor-pointer"
        />
      </td>

      {/* File Icon */}
      <td className="py-2 px-2 w-8">
        {getFileIcon(item.isPrefix, item.extension, 'w-4 h-4')}
      </td>

      {/* Name */}
      <td className="py-2 px-3 font-medium truncate max-w-[150px] sm:max-w-xs" title={item.name}>
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="group-hover:text-primary transition-colors truncate">
            {item.name}
          </span>
          {tags && tags.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTags?.(item);
              }}
              className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors shrink-0 cursor-pointer"
              title={`${t('table.tags', { count: tags.length })}\n${tags.map((t) => `${t.key}=${t.value}`).join('\n')}`}
            >
              <Tag className="w-2.5 h-2.5" />
              <span>{tags.length}</span>
            </button>
          )}
        </div>
      </td>

      {/* Size */}
      <td className="py-2 px-3 text-right text-muted-foreground font-mono text-[11px] whitespace-nowrap">
        {item.isPrefix ? '-' : formatBytes(item.size)}
      </td>

      {/* Type (hidden on small/medium) */}
      <td className="py-2 px-3 text-muted-foreground uppercase text-[10px] tracking-wide hidden md:table-cell">
        {item.isPrefix ? t('table.folder') : item.extension || t('table.file')}
      </td>

      {/* Date (hidden on mobile) */}
      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap text-[11px] hidden sm:table-cell">
        {formatDate(item.lastModified)}
      </td>

      {/* Actions (hidden on small/mobile screens - available via click/long-press/context menu) */}
      <td className="py-2 px-3 text-right hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end space-x-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {item.isPrefix ? (
            <button
              onClick={() => onDownload(item)}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={t('table.downloadFolder')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                onClick={() => onPreview(item)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title={t('table.quickPreview')}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              {isCodeOrText(item.extension, item.name) && (
                <button
                  onClick={() => onOpenMonaco(item)}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  title={isProActive ? t('table.editMonaco') : t('table.editMonacoPro')}
                >
                  <FileCode className="w-3.5 h-3.5" />
                </button>
              )}
              {isPdfFile(item.extension) && (
                <button
                  onClick={() => onOpenPdf ? onOpenPdf(item) : onPreview(item)}
                  className="p-1 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                  title={t('table.openPdf')}
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              )}
              {isImageFile(item.extension) && onOpenGallery && (
                <button
                  onClick={() => onOpenGallery(item)}
                  className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                  title={t('table.openGallery')}
                >
                  <Images className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onOpenExternal(item)}
                className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                title={t('table.editInPlace')}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onPresignedUrl(item)}
                className="p-1 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors"
                title={t('table.presignedUrl')}
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDownload(item)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title={t('table.download')}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {canDeleteItems && (
            <button
              onClick={() => onDelete(item)}
              className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              title={t('table.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

export interface ObjectTableProps {
  items: S3Item[];
  selectedKeys: Set<string>;
  onToggleSelect: (key: string, isShift: boolean) => void;
  onSelectAll: () => void;
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
  isProActive?: boolean;
  sortField: 'name' | 'size' | 'lastModified';
  sortOrder: 'asc' | 'desc';
  onSort: (field: 'name' | 'size' | 'lastModified') => void;
}

export const ObjectTable: React.FC<ObjectTableProps> = ({
  items,
  selectedKeys,
  onToggleSelect,
  onSelectAll,
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
  isProActive = true,
  sortField,
  sortOrder,
  onSort,
}) => {
  const { t } = useTranslation();
  const allSelected = items.length > 0 && items.every((i) => selectedKeys.has(i.key));

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="sticky top-0 bg-plane-surface/90 backdrop-blur-sm border-b border-border text-muted-foreground select-none z-10 text-[11px] font-medium tracking-wider">
          <tr>
            <th className="py-2.5 px-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => {
                  onSelectAll();
                  e.currentTarget.blur();
                }}
                className="w-3.5 h-3.5 rounded border-border bg-plane-surface text-primary focus:ring-0 cursor-pointer"
              />
            </th>
            <th className="py-2.5 px-2 w-8"></th>
            <th
              onClick={() => onSort('name')}
              className="py-2.5 px-3 font-medium cursor-pointer hover:text-foreground transition-colors"
            >
              <div className="flex items-center space-x-1.5">
                <span>{t('table.name')}</span>
                <ArrowUpDown className="w-3 h-3 text-muted-foreground/60" />
              </div>
            </th>
            <th
              onClick={() => onSort('size')}
              className="py-2.5 px-3 font-medium cursor-pointer hover:text-foreground transition-colors w-28 text-right"
            >
              <div className="flex items-center justify-end space-x-1.5">
                <span>{t('table.size')}</span>
                <ArrowUpDown className="w-3 h-3 text-muted-foreground/60" />
              </div>
            </th>
            <th className="py-2.5 px-3 font-medium w-24 hidden md:table-cell">{t('table.type')}</th>
            <th
              onClick={() => onSort('lastModified')}
              className="py-2.5 px-3 font-medium cursor-pointer hover:text-foreground transition-colors w-40 hidden sm:table-cell"
            >
              <div className="flex items-center space-x-1.5">
                <span>{t('table.modified')}</span>
                <ArrowUpDown className="w-3 h-3 text-muted-foreground/60" />
              </div>
            </th>
            {/* Actions header (hidden on small/mobile screens) */}
            <th className="py-2.5 px-3 font-medium w-36 text-right hidden sm:table-cell">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {items.map((item) => (
            <ObjectTableRow
              key={item.key}
              item={item}
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
              isProActive={isProActive}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
