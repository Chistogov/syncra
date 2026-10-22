import React, { useState, useEffect, useMemo } from 'react';
import { Tag, Plus, Trash2, X, Check, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { S3Profile, S3Item, S3Tag } from '../../common/types';
import { validateS3TagKey, validateS3TagValue } from '../utils/tagValidation';

interface PartialTag {
  key: string;
  value: string;
  count: number;
}

interface ObjectTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: S3Item[];
  profile: S3Profile | null;
  bucket: string;
  onTagsUpdated?: (
    keys?: string[],
    tags?: S3Tag[],
    resultsMap?: Record<string, S3Tag[]>
  ) => void;
}

export const ObjectTagsModal: React.FC<ObjectTagsModalProps> = ({
  isOpen,
  onClose,
  items,
  profile,
  bucket,
  onTagsUpdated,
}) => {
  const [tags, setTags] = useState<S3Tag[]>([]);
  const [initialTagsJson, setInitialTagsJson] = useState<string>('[]');
  const [initialTagsByItem, setInitialTagsByItem] = useState<Record<string, S3Tag[]>>({});
  const [removedTagKeys, setRemovedTagKeys] = useState<Set<string>>(new Set());
  const [partialTags, setPartialTags] = useState<PartialTag[]>([]);
  const [replaceAllTags, setReplaceAllTags] = useState(false);

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validItems = useMemo(() => items.filter((i) => !i.isPrefix), [items]);
  const isMultiple = validItems.length > 1;
  const singleItem = validItems.length === 1 ? validItems[0] : null;

  useEffect(() => {
    if (!isOpen || validItems.length === 0 || !profile) {
      setTags([]);
      setInitialTagsByItem({});
      setRemovedTagKeys(new Set());
      setPartialTags([]);
      setReplaceAllTags(false);
      setNewKey('');
      setNewValue('');
      setError(null);
      setSuccessMessage(null);
      return;
    }

    setNewKey('');
    setNewValue('');
    setError(null);
    setSuccessMessage(null);
    setRemovedTagKeys(new Set());
    setReplaceAllTags(false);
    setLoading(true);

    if (singleItem) {
      window.electronAPI.s3
        .getObjectTags(profile, bucket, singleItem.key)
        .then((fetchedTags) => {
          setTags(fetchedTags);
          setInitialTagsJson(JSON.stringify(fetchedTags));
          setInitialTagsByItem({ [singleItem.key]: fetchedTags });
          setPartialTags([]);
        })
        .catch((err) => {
          console.error('Failed to get tags:', err);
          setError(err?.message || 'Не удалось загрузить теги');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // Multiple items: fetch all tags in batch
      const keys = validItems.map((i) => i.key);
      window.electronAPI.s3
        .getBatchObjectTags(profile, bucket, keys)
        .then((batchTags) => {
          setInitialTagsByItem(batchTags || {});

          // Count occurrences of each key=value pair across selected items
          const tagCounts = new Map<string, { tag: S3Tag; count: number }>();

          for (const item of validItems) {
            const itemTags = (batchTags && batchTags[item.key]) || [];
            for (const t of itemTags) {
              const id = `${t.key.toLowerCase()}:::${t.value}`;
              const existing = tagCounts.get(id);
              if (existing) {
                existing.count++;
              } else {
                tagCounts.set(id, { tag: t, count: 1 });
              }
            }
          }

          const common: S3Tag[] = [];
          const partial: PartialTag[] = [];

          for (const { tag, count } of tagCounts.values()) {
            if (count === validItems.length) {
              common.push(tag);
            } else {
              partial.push({
                key: tag.key,
                value: tag.value,
                count,
              });
            }
          }

          common.sort((a, b) => a.key.localeCompare(b.key));
          partial.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

          setTags(common);
          setInitialTagsJson(JSON.stringify(common));
          setPartialTags(partial);
        })
        .catch((err) => {
          console.error('Failed to get batch tags:', err);
          setError(err?.message || 'Не удалось загрузить теги объектов');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, validItems, profile, bucket]);

  // Close on Escape
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

  const keyValidation = newKey ? validateS3TagKey(newKey) : { isValid: true };
  const valueValidation = newValue ? validateS3TagValue(newValue) : { isValid: true };

  // Compute projected tags for an item given specific custom common tags
  const computeItemTagsToSaveWithCustom = (
    itemKey: string,
    currentTags: S3Tag[] = tags,
    currentRemovedKeys: Set<string> = removedTagKeys,
    isReplace: boolean = replaceAllTags
  ): S3Tag[] => {
    if (!isMultiple || isReplace) {
      return currentTags;
    }

    const initial = initialTagsByItem[itemKey] || [];
    const map = new Map<string, { key: string; value: string }>();

    // Start with item's initial tags (unless key was explicitly removed)
    for (const t of initial) {
      if (!currentRemovedKeys.has(t.key.toLowerCase())) {
        map.set(t.key.toLowerCase(), { key: t.key, value: t.value });
      }
    }

    // Apply common / newly added / edited tags
    for (const t of currentTags) {
      map.set(t.key.toLowerCase(), { key: t.key, value: t.value });
    }

    return Array.from(map.values());
  };

  const computeItemTagsToSave = (itemKey: string): S3Tag[] => {
    return computeItemTagsToSaveWithCustom(itemKey, tags, removedTagKeys, replaceAllTags);
  };

  // Tag statistics across all selected items
  const itemTagStats = useMemo(() => {
    if (!validItems.length) {
      return {
        maxCount: 0,
        filesExceedingLimit: [] as { item: S3Item; count: number }[],
        filesAtLimit: [] as { item: S3Item; count: number }[],
      };
    }

    let maxCount = 0;
    const filesExceedingLimit: { item: S3Item; count: number }[] = [];
    const filesAtLimit: { item: S3Item; count: number }[] = [];

    for (const item of validItems) {
      const count = computeItemTagsToSave(item.key).length;
      if (count > maxCount) maxCount = count;
      if (count > 10) {
        filesExceedingLimit.push({ item, count });
      } else if (count === 10) {
        filesAtLimit.push({ item, count });
      }
    }

    return { maxCount, filesExceedingLimit, filesAtLimit };
  }, [validItems, tags, removedTagKeys, replaceAllTags, initialTagsByItem]);

  // Check if adding or updating a tag would cause any file to exceed 10 tags
  const checkWouldExceed = (
    keyToAdd: string,
    valToAdd: string
  ): { first: S3Item; count: number; totalExceeding: number } | null => {
    const trimmedKey = keyToAdd.trim().toLowerCase();
    const isExistingKeyInEditor = tags.some((t) => t.key.toLowerCase() === trimmedKey);

    const simulatedTags = isExistingKeyInEditor
      ? tags.map((t) =>
          t.key.toLowerCase() === trimmedKey ? { key: keyToAdd.trim(), value: valToAdd.trim() } : t
        )
      : [...tags, { key: keyToAdd.trim(), value: valToAdd.trim() }];

    const simulatedRemovedKeys = new Set(removedTagKeys);
    simulatedRemovedKeys.delete(trimmedKey);

    const exceeding: { item: S3Item; count: number }[] = [];
    for (const item of validItems) {
      const count = computeItemTagsToSaveWithCustom(
        item.key,
        simulatedTags,
        simulatedRemovedKeys,
        replaceAllTags
      ).length;
      if (count > 10) {
        exceeding.push({ item, count });
      }
    }

    if (exceeding.length > 0) {
      return {
        first: exceeding[0].item,
        count: exceeding[0].count,
        totalExceeding: exceeding.length,
      };
    }
    return null;
  };

  // Live preview for currently typed key
  const wouldExceedOnAdd = useMemo(() => {
    if (!newKey.trim() || !keyValidation.isValid) return null;
    return checkWouldExceed(newKey, newValue);
  }, [newKey, newValue, keyValidation.isValid, tags, removedTagKeys, replaceAllTags, validItems]);

  const handleAddTag = () => {
    const keyVal = validateS3TagKey(newKey);
    if (!keyVal.isValid) {
      setError(keyVal.error || 'Неверный ключ тега');
      return;
    }

    const valVal = validateS3TagValue(newValue);
    if (!valVal.isValid) {
      setError(valVal.error || 'Неверное значение тега');
      return;
    }

    const trimmedKey = newKey.trim();
    const trimmedVal = newValue.trim();
    const isExistingKeyInEditor = tags.some((t) => t.key.toLowerCase() === trimmedKey.toLowerCase());

    if (!isExistingKeyInEditor && tags.length >= 10) {
      setError('S3 поддерживает максимум 10 тегов на один объект');
      return;
    }

    // Check if adding this tag causes any of the files to exceed 10 tags
    const exceed = checkWouldExceed(trimmedKey, trimmedVal);
    if (exceed) {
      setError(
        `Невозможно добавить тег: для файла "${exceed.first.name}" будет превышен максимальный лимит S3 в 10 тегов (станет ${exceed.count} из 10).` +
          (exceed.totalExceeding > 1
            ? ` Также лимит будет превышен еще у ${exceed.totalExceeding - 1} файлов.`
            : '')
      );
      return;
    }

    // If key was marked removed previously, unmark it
    setRemovedTagKeys((prev) => {
      const next = new Set(prev);
      next.delete(trimmedKey.toLowerCase());
      return next;
    });

    // Remove matching entry from partialTags
    setPartialTags((prev) =>
      prev.filter((p) => p.key.toLowerCase() !== trimmedKey.toLowerCase())
    );

    const existingIndex = tags.findIndex((t) => t.key.toLowerCase() === trimmedKey.toLowerCase());
    if (existingIndex >= 0) {
      const updated = [...tags];
      updated[existingIndex] = { key: trimmedKey, value: trimmedVal };
      setTags(updated);
    } else {
      setTags([...tags, { key: trimmedKey, value: trimmedVal }]);
    }

    setNewKey('');
    setNewValue('');
    setError(null);
  };

  const handleRemoveTag = (index: number) => {
    const tagToRemove = tags[index];
    if (tagToRemove) {
      setRemovedTagKeys((prev) => {
        const next = new Set(prev);
        next.add(tagToRemove.key.toLowerCase());
        return next;
      });
    }
    setTags(tags.filter((_, i) => i !== index));
    setError(null);
  };

  const handleApplyPartialToAll = (pt: PartialTag) => {
    const exceed = checkWouldExceed(pt.key, pt.value);
    if (exceed) {
      setError(
        `Невозможно применить тег "${pt.key}" ко всем объектам: для файла "${exceed.first.name}" будет превышен лимит в 10 тегов (станет ${exceed.count} из 10).`
      );
      return;
    }

    setRemovedTagKeys((prev) => {
      const next = new Set(prev);
      next.delete(pt.key.toLowerCase());
      return next;
    });

    setPartialTags((prev) =>
      prev.filter(
        (p) => !(p.key.toLowerCase() === pt.key.toLowerCase() && p.value === pt.value)
      )
    );

    const existingIndex = tags.findIndex((t) => t.key.toLowerCase() === pt.key.toLowerCase());
    if (existingIndex >= 0) {
      const updated = [...tags];
      updated[existingIndex] = { key: pt.key, value: pt.value };
      setTags(updated);
    } else {
      setTags([...tags, { key: pt.key, value: pt.value }]);
    }
    setError(null);
  };

  const handleRemovePartialFromAll = (pt: PartialTag) => {
    setRemovedTagKeys((prev) => {
      const next = new Set(prev);
      next.add(pt.key.toLowerCase());
      return next;
    });
    setPartialTags((prev) =>
      prev.filter(
        (p) => !(p.key.toLowerCase() === pt.key.toLowerCase() && p.value === pt.value)
      )
    );
    setError(null);
  };

  const handleSave = async () => {
    if (!profile || validItems.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    // Validate 10 tags limit for all items before saving
    for (const item of validItems) {
      const itemTags = computeItemTagsToSave(item.key);
      if (itemTags.length > 10) {
        setError(
          `Файл "${item.name}" превысит лимит S3 в 10 тегов (будет ${itemTags.length}). Удалите лишние теги перед сохранением.`
        );
        setSaving(false);
        return;
      }
    }

    try {
      const resultsMap: Record<string, S3Tag[]> = {};

      for (const item of validItems) {
        const itemTags = computeItemTagsToSave(item.key);
        resultsMap[item.key] = itemTags;
        await window.electronAPI.s3.putObjectTags(profile, bucket, item.key, itemTags);
        window.dispatchEvent(
          new CustomEvent('s3:tags-updated', {
            detail: { bucket, key: item.key, tags: itemTags },
          })
        );
      }

      setInitialTagsJson(JSON.stringify(tags));
      setSuccessMessage(
        isMultiple
          ? `Теги успешно обновлены для ${validItems.length} объектов!`
          : 'Теги объекта успешно сохранены!'
      );

      if (onTagsUpdated) {
        onTagsUpdated(validItems.map((i) => i.key), tags, resultsMap);
      }

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Failed to save tags:', err);
      setError(err?.message || 'Ошибка при сохранении тегов в S3');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify(tags) !== initialTagsJson ||
    removedTagKeys.size > 0 ||
    replaceAllTags ||
    (isMultiple && tags.length > 0);

  if (!isOpen || validItems.length === 0) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-plane-surface border border-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-foreground animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-plane-surface/80">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary flex-shrink-0">
              <Tag className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 className="font-semibold text-sm text-foreground truncate">
                {isMultiple ? `Тегирование (${validItems.length} объектов)` : 'Теги объекта S3'}
              </h3>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {isMultiple ? `Бакет: ${bucket}` : singleItem?.key}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Multiple items banner with Merge Mode explanation */}
          {isMultiple && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">
                  Выбрано файлов: {validItems.length}
                </span>
                <span className="text-[11px] text-primary font-medium">
                  {replaceAllTags ? 'Режим: Полная замена' : 'Режим: Объединение (Merge)'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-normal">
                {replaceAllTags
                  ? 'Все существующие теги выбранных файлов будут заменены на список общих тегов.'
                  : 'Новые и измененные теги добавятся ко всем выбранным файлам. Уникальные теги каждого файла будут бережно сохранены.'}
              </p>
              <label className="flex items-center space-x-2 pt-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={replaceAllTags}
                  onChange={(e) => setReplaceAllTags(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-0 cursor-pointer"
                />
                <span>Заменить все теги (стереть индивидуальные теги файлов)</span>
              </label>
            </div>
          )}

          {/* Tag Counter and Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-foreground">
                {isMultiple ? 'Общие теги' : 'Теги объекта'}
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {tags.length} / 10
              </span>
              {isMultiple && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    itemTagStats.filesExceedingLimit.length > 0
                      ? 'bg-destructive/15 text-destructive border-destructive/30 font-semibold'
                      : itemTagStats.maxCount === 10
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30 font-medium'
                      : 'bg-muted/70 text-muted-foreground border-border/40'
                  }`}
                  title={`Максимальное количество тегов на одном из файлов: ${itemTagStats.maxCount} из 10`}
                >
                  Макс. на объекте: {itemTagStats.maxCount} / 10
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Формат: Ключ = Значение
            </span>
          </div>

          {/* Persistent Limit Warning Alert when any file exceeds 10 tags */}
          {itemTagStats.filesExceedingLimit.length > 0 && (
            <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/40 text-xs text-destructive space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
                <span>Превышен максимальный лимит S3 (10 тегов на один объект)!</span>
              </div>
              <p className="text-[11px] text-destructive/90 leading-normal">
                При объединении со старыми индивидуальными тегами для следующих файлов превышен лимит в 10 тегов. Удалите лишние теги или включите «Заменить все теги» перед сохранением:
              </p>
              <div className="max-h-28 overflow-y-auto space-y-1 bg-destructive/10 p-2 rounded-md border border-destructive/20">
                {itemTagStats.filesExceedingLimit.map(({ item, count }) => (
                  <div key={item.key} className="flex items-center justify-between text-[11px] font-mono">
                    <span className="truncate max-w-[280px]" title={item.name}>
                      {item.name}
                    </span>
                    <span className="font-bold text-destructive shrink-0 ml-2">
                      {count} / 10 тегов (+{count - 10})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning notice when 10/10 tags reached on some files */}
          {isMultiple &&
            itemTagStats.filesAtLimit.length > 0 &&
            itemTagStats.filesExceedingLimit.length === 0 && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-500 flex items-center space-x-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px]">
                  Для {itemTagStats.filesAtLimit.length === 1 ? `файла "${itemTagStats.filesAtLimit[0].item.name}"` : `${itemTagStats.filesAtLimit.length} файлов`} достигнут лимит (10 из 10 тегов). Добавление новых тегов приведет к превышению.
                </span>
              </div>
            )}

          {/* Current Tag List */}
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center text-muted-foreground space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-xs">Загрузка тегов объектов...</span>
            </div>
          ) : tags.length === 0 ? (
            <div className="py-6 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
              <Tag className="w-6 h-6 text-muted-foreground/40 mb-1.5" />
              <p className="text-xs font-medium text-foreground">
                {isMultiple ? 'Нет общих тегов' : 'У объекта пока нет тегов'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isMultiple
                  ? 'Добавьте тег ниже, чтобы применить его ко всем выбранным файлам'
                  : 'Добавьте теги ниже для маркировки и классификации файлов'}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, idx) => (
                <div
                  key={`${tag.key}_${idx}`}
                  className="group flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-muted/60 border border-border text-xs text-foreground transition-all hover:border-border/80"
                >
                  <span className="font-semibold text-primary">{tag.key}</span>
                  <span className="text-muted-foreground">:</span>
                  <span className="text-foreground/90 max-w-[180px] truncate" title={tag.value}>
                    {tag.value || <em className="text-muted-foreground italic">пусто</em>}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(idx)}
                    className="ml-1 p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                    title="Удалить тег"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Partial Tags Section (Multiple selection only) */}
          {isMultiple && partialTags.length > 0 && !replaceAllTags && (
            <div className="border border-border/80 bg-muted/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Теги отдельных файлов ({partialTags.length})
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Присутствуют не у всех выбранных файлов
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {partialTags.map((pt, idx) => (
                  <div
                    key={`${pt.key}_${pt.value}_${idx}`}
                    className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-muted/60 border border-border/80 text-xs text-foreground group"
                  >
                    <span className="font-medium text-foreground">{pt.key}</span>
                    {pt.value && (
                      <span className="text-muted-foreground font-normal">={pt.value}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/80 font-mono ml-0.5">
                      ({pt.count}/{validItems.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleApplyPartialToAll(pt)}
                      className="ml-1 p-0.5 text-primary hover:bg-primary/10 rounded transition-colors"
                      title="Применить этот тег ко всем выбранным файлам"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePartialFromAll(pt)}
                      className="p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                      title="Удалить этот тег со всех файлов, где он есть"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Tag Section */}
          <div className="border border-border/80 bg-background/50 rounded-lg p-3 space-y-2.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isMultiple ? 'Добавить тег ко всем выбранным файлам' : 'Добавить новый тег'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">
                  Ключ (Key) <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="напр. env, project, status"
                  value={newKey}
                  onChange={(e) => {
                    setNewKey(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag();
                  }}
                  maxLength={128}
                  disabled={saving}
                  className={`w-full bg-plane-surface border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 disabled:opacity-50 select-text ${
                    newKey && (!keyValidation.isValid || wouldExceedOnAdd)
                      ? 'border-destructive focus:border-destructive focus:ring-destructive'
                      : 'border-border focus:border-primary focus:ring-primary'
                  }`}
                />
                {newKey && !keyValidation.isValid && (
                  <p className="text-[10px] text-destructive mt-1 leading-tight">
                    {keyValidation.error}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">
                  Значение (Value)
                </label>
                <input
                  type="text"
                  placeholder="напр. production, alpha"
                  value={newValue}
                  onChange={(e) => {
                    setNewValue(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTag();
                  }}
                  maxLength={256}
                  disabled={saving}
                  className={`w-full bg-plane-surface border rounded-md px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 disabled:opacity-50 select-text ${
                    newValue && !valueValidation.isValid
                      ? 'border-destructive focus:border-destructive focus:ring-destructive'
                      : 'border-border focus:border-primary focus:ring-primary'
                  }`}
                />
                {newValue && !valueValidation.isValid && (
                  <p className="text-[10px] text-destructive mt-1 leading-tight">
                    {valueValidation.error}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/80 leading-normal">
              Разрешены латинские буквы (a-z, A-Z), цифры (0-9) и знаки: + - = . _ : / пробел. Кириллица не поддерживается стандартом S3.
            </p>

            {/* Live Warning if currently entered key would cause limit breach */}
            {wouldExceedOnAdd && (
              <div className="flex items-center space-x-1.5 text-[11px] text-destructive font-medium bg-destructive/10 border border-destructive/20 p-2 rounded-md animate-in fade-in duration-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  Внимание: добавление этого тега приведет к превышению лимита (10 тегов) для файла{' '}
                  <strong>"{wouldExceedOnAdd.first.name}"</strong> (станет {wouldExceedOnAdd.count} из 10).
                  {wouldExceedOnAdd.totalExceeding > 1
                    ? ` Также лимит будет превышен еще у ${wouldExceedOnAdd.totalExceeding - 1} объектов.`
                    : ''}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleAddTag}
              disabled={
                !newKey.trim() ||
                !keyValidation.isValid ||
                !valueValidation.isValid ||
                Boolean(wouldExceedOnAdd) ||
                saving
              }
              className="flex items-center justify-center space-x-1.5 w-full py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-md transition-colors border border-border disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить в список</span>
            </button>
          </div>

          {/* Error & Success Feedback */}
          {error && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center space-x-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-2 text-xs text-emerald-400">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-plane-surface/80">
          <div className="text-[11px] text-muted-foreground font-mono">
            {tags.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTags([]);
                  if (isMultiple) {
                    setRemovedTagKeys((prev) => {
                      const next = new Set(prev);
                      tags.forEach((t) => next.add(t.key.toLowerCase()));
                      return next;
                    });
                  }
                }}
                disabled={saving}
                className="text-muted-foreground hover:text-destructive flex items-center space-x-1 transition-colors"
                title="Очистить список общих тегов"
              >
                <Trash2 className="w-3 h-3" />
                <span>Очистить список</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 text-xs text-foreground border border-border hover:bg-muted rounded-md transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                itemTagStats.filesExceedingLimit.length > 0 ||
                (!hasChanges && !isMultiple)
              }
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium rounded-md transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                itemTagStats.filesExceedingLimit.length > 0
                  ? 'Невозможно сохранить: лимит тегов (10) превышен для некоторых файлов'
                  : undefined
              }
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Сохранить в S3</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
