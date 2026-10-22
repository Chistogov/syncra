import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Tag, X, Check, Search } from 'lucide-react';
import { S3Item, S3Tag } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

export type TagFilterMode = 'all' | 'tagged_only' | 'untagged_only';

export interface TagFilterPopoverProps {
  items: S3Item[];
  tagsMap: Record<string, S3Tag[]>;
  tagFilterMode: TagFilterMode;
  onTagFilterModeChange: (mode: TagFilterMode) => void;
  selectedTags: Set<string>;
  onSelectedTagsChange: (tags: Set<string>) => void;
  customTagQuery: string;
  onCustomTagQueryChange: (query: string) => void;
  onReset: () => void;
}

interface AvailableTag {
  id: string;
  key: string;
  value: string;
  count: number;
}

export const TagFilterPopover: React.FC<TagFilterPopoverProps> = ({
  items,
  tagsMap,
  tagFilterMode,
  onTagFilterModeChange,
  selectedTags,
  onSelectedTagsChange,
  customTagQuery,
  onCustomTagQueryChange,
  onReset,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTagText, setSearchTagText] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Aggregate stats from items and tagsMap
  const { availableTags, taggedCount, untaggedCount } = useMemo(() => {
    const map = new Map<string, AvailableTag>();
    let tagged = 0;
    let untagged = 0;

    for (const item of items) {
      if (item.isPrefix) continue;
      const fileTags = tagsMap[item.key];
      if (fileTags && fileTags.length > 0) {
        tagged++;
        for (const t of fileTags) {
          const id = t.value ? `${t.key}=${t.value}` : t.key;
          const existing = map.get(id);
          if (existing) {
            existing.count++;
          } else {
            map.set(id, { id, key: t.key, value: t.value, count: 1 });
          }
        }
      } else {
        untagged++;
      }
    }

    const tagsList = Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.key.localeCompare(b.key)
    );

    return {
      availableTags: tagsList,
      taggedCount: tagged,
      untaggedCount: untagged,
    };
  }, [items, tagsMap]);

  // Filter available tags by local search text inside popover
  const filteredAvailableTags = useMemo(() => {
    if (!searchTagText.trim()) return availableTags;
    const q = searchTagText.trim().toLowerCase();
    return availableTags.filter(
      (t) => t.key.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)
    );
  }, [availableTags, searchTagText]);

  const isFilterActive =
    tagFilterMode !== 'all' || selectedTags.size > 0 || customTagQuery.trim().length > 0;

  const activeCount =
    (tagFilterMode !== 'all' ? 1 : 0) +
    selectedTags.size +
    (customTagQuery.trim().length > 0 ? 1 : 0);

  const toggleTag = (id: string) => {
    const next = new Set(selectedTags);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectedTagsChange(next);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-1.5 p-1.5 sm:px-2.5 sm:py-1 rounded-md transition-colors font-medium text-xs border ${
          isFilterActive
            ? 'bg-primary/15 text-primary border-primary/40 shadow-xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted border-border'
        }`}
        title={t('tagPopover.buttonTooltip')}
      >
        <Tag className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{t('tagPopover.button')}</span>
        {isFilterActive && (
          <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-primary text-primary-foreground leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-plane-surface border border-border rounded-xl shadow-2xl z-50 p-3.5 flex flex-col space-y-3 animate-in fade-in zoom-in-95 duration-100 select-none text-foreground"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="p-1 rounded bg-primary/10 text-primary">
                <Tag className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-xs text-foreground">{t('tagPopover.title')}</span>
            </div>
            {isFilterActive && (
              <button
                type="button"
                onClick={onReset}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              >
                {t('tagPopover.reset')}
              </button>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg text-[11px]">
            <button
              type="button"
              onClick={() => onTagFilterModeChange('all')}
              className={`flex-1 py-1 rounded-md text-center transition-all ${
                tagFilterMode === 'all'
                  ? 'bg-plane-surface text-foreground font-medium shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('tagPopover.all', { count: items.filter((i) => !i.isPrefix).length })}
            </button>
            <button
              type="button"
              onClick={() => onTagFilterModeChange('tagged_only')}
              className={`flex-1 py-1 rounded-md text-center transition-all ${
                tagFilterMode === 'tagged_only'
                  ? 'bg-plane-surface text-foreground font-medium shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Только файлы с назначенными тегами"
            >
              {t('tagPopover.tagged', { count: taggedCount })}
            </button>
            <button
              type="button"
              onClick={() => onTagFilterModeChange('untagged_only')}
              className={`flex-1 py-1 rounded-md text-center transition-all ${
                tagFilterMode === 'untagged_only'
                  ? 'bg-plane-surface text-foreground font-medium shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Только файлы без тегов"
            >
              {t('tagPopover.untagged', { count: untaggedCount })}
            </button>
          </div>

          {/* Tags in this folder */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-medium">Теги в этой папке ({availableTags.length}):</span>
              {selectedTags.size > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectedTagsChange(new Set())}
                  className="text-primary hover:underline text-[10px]"
                >
                  Снять выбор ({selectedTags.size})
                </button>
              )}
            </div>

            {availableTags.length > 5 && (
              <div className="relative">
                <Search className="w-3 h-3 text-muted-foreground absolute left-2 top-2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTagText}
                  onChange={(e) => setSearchTagText(e.target.value)}
                  placeholder={t('tagPopover.searchPlaceholder')}
                  className="w-full bg-plane-surface/80 border border-border rounded-md pl-7 pr-6 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {searchTagText && (
                  <button
                    type="button"
                    onClick={() => setSearchTagText('')}
                    className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Tag List */}
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
              {availableTags.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-[11px]">
                  {t('tagPopover.noTags')}
                </div>
              ) : filteredAvailableTags.length === 0 ? (
                <div className="text-center py-3 text-muted-foreground text-[11px]">
                  {t('tagPopover.noTags')}
                </div>
              ) : (
                filteredAvailableTags.map((tag) => {
                  const isSelected = selectedTags.has(tag.id);
                  return (
                    <div
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${
                        isSelected
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'hover:bg-muted/60 text-foreground/90 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0 mr-2">
                        <div
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-border bg-plane-surface'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <div className="truncate text-[11px]">
                          <span className="font-semibold text-primary">{tag.key}</span>
                          {tag.value && (
                            <span className="text-foreground/80 font-normal">={tag.value}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0">
                        {tag.count}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Custom Tag Search */}
          <div className="border-t border-border pt-2 flex flex-col space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">
              Фильтр по произвольному тегу:
            </label>
            <div className="relative">
              <input
                type="text"
                value={customTagQuery}
                onChange={(e) => onCustomTagQueryChange(e.target.value)}
                placeholder="Например: backup или env=prod"
                className="w-full bg-plane-surface/80 border border-border rounded-md px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {customTagQuery && (
                <button
                  type="button"
                  onClick={() => onCustomTagQueryChange('')}
                  className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border pt-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {isFilterActive ? `Активно: ${activeCount}` : 'Фильтр отключен'}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-primary text-primary-foreground text-[11px] font-medium rounded-md hover:bg-primary-hover transition-colors shadow-xs"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
