import React, { useEffect, useState } from 'react';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Calendar,
  HardDrive,
  Hash,
  FileType,
  FileCode,
  Eye,
  Maximize2,
  Images,
  Tag,
  Plus,
  Trash2,
  Check,
  Link2,
} from 'lucide-react';
import { S3Profile, S3Item, FilePreviewData, S3Tag } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import { formatBytes, formatDate } from '../utils/formatters';
import { getFileIcon } from '../utils/fileIcons';
import { validateS3TagKey, validateS3TagValue } from '../utils/tagValidation';
import { isCodeOrText, isImageFile } from '../utils/fileTypes';

interface PreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: S3Item | null;
  profile: S3Profile | null;
  bucket: string;
  onDownload: (item: S3Item) => void;
  onOpenExternal: (item: S3Item) => void;
  onPresignedUrl?: (item: S3Item) => void;
  onOpenMonaco?: (item: S3Item) => void;
  onOpenPdf?: (item: S3Item) => void;
  onOpenGallery?: (item: S3Item) => void;
  canEditTags?: boolean;
  isProActive?: boolean;
}

export const PreviewDrawer: React.FC<PreviewDrawerProps> = ({
  isOpen,
  onClose,
  item,
  profile,
  bucket,
  onDownload,
  onOpenExternal,
  onPresignedUrl,
  onOpenMonaco,
  onOpenPdf,
  onOpenGallery,
  canEditTags = true,
  isProActive = true,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // S3 Object Tags State
  const [tags, setTags] = useState<S3Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagSuccess, setTagSuccess] = useState<string | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    if (isOpen && item && profile && !item.isPrefix) {
      loadPreview();
      loadTags();
    } else {
      setPreviewData(null);
      setTags([]);
      setIsAddingTag(false);
      setTagError(null);
      setTagSuccess(null);
    }
  }, [isOpen, item, profile]);

  const loadTags = async () => {
    if (!item || !profile || item.isPrefix) return;
    setLoadingTags(true);
    setTagError(null);
    try {
      const fetched = await window.electronAPI.s3.getObjectTags(profile, bucket, item.key);
      setTags(fetched || []);
    } catch (err: any) {
      console.warn('Failed to load object tags:', err);
    } finally {
      setLoadingTags(false);
    }
  };

  const handleSaveTags = async (updatedTags: S3Tag[]) => {
    if (!item || !profile) return;
    setSavingTags(true);
    setTagError(null);
    setTagSuccess(null);
    try {
      await window.electronAPI.s3.putObjectTags(profile, bucket, item.key, updatedTags);
      setTags(updatedTags);
      window.dispatchEvent(
        new CustomEvent('s3:tags-updated', {
          detail: { bucket, key: item.key, tags: updatedTags },
        })
      );
      setTagSuccess(t('preview.tagsSaved'));
      setTimeout(() => setTagSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to save tags:', err);
      setTagError(err?.message || 'Error saving tags');
    } finally {
      setSavingTags(false);
    }
  };

  const keyValidation = newKey ? validateS3TagKey(newKey) : { isValid: true };
  const valueValidation = newValue ? validateS3TagValue(newValue) : { isValid: true };

  const handleAddTag = async () => {
    const keyVal = validateS3TagKey(newKey);
    if (!keyVal.isValid) {
      setTagError(keyVal.error || t('preview.tagKeyInvalid'));
      return;
    }
    const valVal = validateS3TagValue(newValue);
    if (!valVal.isValid) {
      setTagError(valVal.error || t('preview.tagValueInvalid'));
      return;
    }
    if (tags.length >= 10) {
      setTagError(t('preview.tagMaxLimit'));
      return;
    }
    const k = newKey.trim();
    const v = newValue.trim();
    const nextTags = [...tags.filter((t) => t.key.toLowerCase() !== k.toLowerCase()), { key: k, value: v }];
    setNewKey('');
    setNewValue('');
    setIsAddingTag(false);
    await handleSaveTags(nextTags);
  };

  const handleDeleteTag = async (indexToDelete: number) => {
    const nextTags = tags.filter((_, idx) => idx !== indexToDelete);
    await handleSaveTags(nextTags);
  };

  const loadPreview = async () => {
    if (!item || !profile) return;
    setLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.s3.getPreview(profile, bucket, item.key);
      setPreviewData(data);
    } catch (err: any) {
      console.error('Failed to load preview:', err);
      setError(err.message || 'Ошибка загрузки предпросмотра');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-plane-surface border-l border-border shadow-2xl flex flex-col text-foreground animate-fade-in">
      {/* Plane.so Sheet Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-plane-surface/80">
        <div className="flex items-center space-x-2.5 overflow-hidden">
          {getFileIcon(item.isPrefix, item.extension, 'w-5 h-5 flex-shrink-0')}
          <div className="truncate">
            <h3 className="font-semibold text-xs text-foreground truncate" title={item.name}>
              {item.name}
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono truncate">{item.key}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0">
          {onOpenGallery && (item.extension && isImageFile(item.extension) || previewData?.type === 'image') && (
            <button
              onClick={() => onOpenGallery(item)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={t('preview.galleryTooltip')}
            >
              <Images className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenPdf && (item.extension?.toLowerCase().replace('.', '') === 'pdf' || previewData?.type === 'pdf') && (
            <button
              onClick={() => onOpenPdf(item)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={t('preview.pdfModalTooltip')}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenMonaco && isCodeOrText(item.extension, item.name) && (
            <button
              onClick={() => onOpenMonaco(item)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={isProActive ? t('preview.monacoTooltip') : t('preview.monacoProTooltip')}
            >
              <FileCode className="w-3.5 h-3.5" />
            </button>
          )}
          {onPresignedUrl && (
            <button
              onClick={() => onPresignedUrl(item)}
              className="p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors"
              title={t('preview.presignedTooltip')}
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onDownload(item)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            title={t('preview.downloadTooltip')}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onOpenExternal(item)}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
            title={t('preview.editInPlaceTooltip')}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
            <p className="text-xs">{t('preview.loadingContent')}</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-destructive text-xs p-4 text-center">
            {error}
          </div>
        ) : previewData?.type === 'image' && previewData.url ? (
          <div className="flex-1 flex flex-col space-y-3">
            <div
              onClick={() => onOpenGallery ? onOpenGallery(item) : null}
              className="flex-1 flex items-center justify-center bg-black/60 rounded-lg p-3 border border-border overflow-hidden cursor-pointer group relative min-h-[260px]"
              title={t('preview.openInGallery')}
            >
              <img
                src={previewData.url}
                alt={item.name}
                className="max-h-[380px] max-w-full object-contain rounded group-hover:scale-[1.02] transition-transform duration-200"
              />
              {onOpenGallery && (
                <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white px-2.5 py-1 rounded-md text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1.5 shadow-lg border border-white/10">
                  <Images className="w-3.5 h-3.5 text-primary" />
                  <span>{t('menu.openGallery')}</span>
                </div>
              )}
            </div>
            {onOpenGallery && (
              <button
                onClick={() => onOpenGallery(item)}
                className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-lg text-xs font-medium transition-colors shadow-2xs"
              >
                <Images className="w-3.5 h-3.5" />
                <span>{t('preview.openInGallery')}</span>
              </button>
            )}
          </div>
        ) : previewData?.type === 'text' && previewData.text !== undefined ? (
          <div className="flex-1 flex flex-col bg-background rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-1.5 bg-muted/40 border-b border-border text-[11px] text-muted-foreground flex items-center justify-between font-mono">
              <div className="flex items-center space-x-2">
                <span>{t('preview.textPreview')}</span>
                <span>•</span>
                <span>{t('preview.charsCount', { count: previewData.text.length })}</span>
              </div>
              {onOpenMonaco && (
                <button
                  onClick={() => onOpenMonaco(item)}
                  className="flex items-center space-x-1 text-primary hover:underline text-[11px] font-sans font-medium"
                  title={isProActive ? t('preview.monacoTooltip') : t('preview.monacoProTooltip')}
                >
                  <FileCode className="w-3 h-3" />
                  <span>{t('preview.openInMonaco')}</span>
                  {!isProActive && (
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      PRO
                    </span>
                  )}
                </button>
              )}
            </div>
            <pre className="flex-1 p-4 text-xs font-mono text-foreground/90 overflow-auto whitespace-pre-wrap leading-relaxed select-text">
              {previewData.text}
            </pre>
          </div>
        ) : previewData?.type === 'pdf' ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background/50 rounded-lg p-6 border border-border text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-xs">
              <FileText className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h4 className="text-sm font-semibold text-foreground">
                {t('preview.pdfDoc')}
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('preview.pdfDesc')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 w-full max-w-xs">
              {onOpenPdf ? (
                <button
                  onClick={() => onOpenPdf(item)}
                  className="w-full flex items-center justify-center space-x-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-lg transition-colors shadow-xs"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>{t('preview.openModal')}</span>
                </button>
              ) : previewData.url ? (
                <a
                  href={previewData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center space-x-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-lg transition-colors shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{t('preview.openNewTab')}</span>
                </a>
              ) : null}
              <button
                onClick={() => onOpenExternal(item)}
                className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-lg transition-colors border border-border"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('preview.inApp')}</span>
              </button>
            </div>
          </div>
        ) : previewData?.type === 'audio' && previewData.url ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background rounded-lg p-6 border border-border space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              {getFileIcon(false, item.extension, 'w-7 h-7')}
            </div>
            <audio controls className="w-full max-w-md">
              <source src={previewData.url} />
            </audio>
          </div>
        ) : previewData?.type === 'video' && previewData.url ? (
          <div className="flex-1 flex items-center justify-center bg-black/80 rounded-lg p-2 border border-border">
            <video controls className="max-h-[380px] max-w-full rounded">
              <source src={previewData.url} />
            </video>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-background/50 rounded-lg p-8 border border-border text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center text-muted-foreground">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground">
                {t('preview.unsupportedFormat')}
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
                {t('preview.unsupportedDesc')}
              </p>
            </div>
            <button
              onClick={() => onOpenExternal(item)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium rounded-md transition-colors shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t('preview.openInApp')}</span>
            </button>
          </div>
        )}

        {/* Metadata Properties Section (Shadcn Card Style) */}
        <div className="mt-5 border-t border-border pt-4 space-y-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('preview.properties')}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-background border border-border p-2.5 rounded-md flex items-center space-x-2.5">
              <HardDrive className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <div>
                <span className="block text-[10px] text-muted-foreground">{t('preview.size')}</span>
                <span className="font-medium text-foreground">{formatBytes(item.size)}</span>
              </div>
            </div>
            <div className="bg-background border border-border p-2.5 rounded-md flex items-center space-x-2.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <div>
                <span className="block text-[10px] text-muted-foreground">{t('preview.modified')}</span>
                <span className="font-medium text-foreground">{formatDate(item.lastModified)}</span>
              </div>
            </div>
            {item.eTag && (
              <div className="bg-background border border-border p-2.5 rounded-md flex items-center space-x-2.5 col-span-2">
                <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <div className="truncate">
                  <span className="block text-[10px] text-muted-foreground">{t('preview.etag')}</span>
                  <span className="font-mono text-foreground text-[11px] select-all truncate block">
                    {item.eTag}
                  </span>
                </div>
              </div>
            )}
            {previewData?.mimeType && (
              <div className="bg-background border border-border p-2.5 rounded-md flex items-center space-x-2.5 col-span-2">
                <FileType className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <span className="block text-[10px] text-muted-foreground">{t('preview.mime')}</span>
                  <span className="text-foreground text-[11px] font-mono">{previewData.mimeType}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* S3 Object Tags Section */}
        <div className="mt-5 border-t border-border pt-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('preview.s3Tags')}
              </h4>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                {tags.length}/10
              </span>
            </div>
            {canEditTags && !isAddingTag && tags.length < 10 ? (
              <button
                onClick={() => {
                  setIsAddingTag(true);
                  setTagError(null);
                }}
                className="flex items-center space-x-1 text-primary hover:underline text-[11px] font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>{t('preview.addTag')}</span>
              </button>
            ) : canEditTags && !isAddingTag && tags.length >= 10 ? (
              <span className="text-[10px] text-amber-500 font-medium">
                {t('preview.tagLimit')}
              </span>
            ) : null}
          </div>

          {loadingTags ? (
            <div className="py-3 flex items-center justify-center space-x-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>{t('preview.loadingTags')}</span>
            </div>
          ) : tags.length === 0 && !isAddingTag ? (
            <div className="p-3 border border-dashed border-border rounded-lg text-center text-xs text-muted-foreground">
              {t('preview.noTagsDesc')}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, idx) => (
                <div
                  key={`${tag.key}_${idx}`}
                  className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-muted/60 border border-border text-[11px] text-foreground"
                >
                  <span className="font-semibold text-primary">{tag.key}</span>
                  <span className="text-muted-foreground">:</span>
                  <span className="text-foreground/90 max-w-[140px] truncate" title={tag.value}>
                    {tag.value || <em className="text-muted-foreground italic">empty</em>}
                  </span>
                  {canEditTags && (
                    <button
                      onClick={() => handleDeleteTag(idx)}
                      disabled={savingTags}
                      className="p-0.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                      title={t('common.delete')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Tag Form */}
          {isAddingTag && (
            <div className="p-3 bg-background border border-primary/40 rounded-lg space-y-2 animate-in fade-in duration-100">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">
                    {t('preview.tagKey')} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="env, project..."
                    value={newKey}
                    onChange={(e) => {
                      setNewKey(e.target.value);
                      if (tagError) setTagError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTag();
                      if (e.key === 'Escape') setIsAddingTag(false);
                    }}
                    maxLength={128}
                    autoFocus
                    className={`w-full bg-plane-surface border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 select-text ${
                      newKey && !keyValidation.isValid
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
                    {t('preview.tagValue')}
                  </label>
                  <input
                    type="text"
                    placeholder="prod, alpha..."
                    value={newValue}
                    onChange={(e) => {
                      setNewValue(e.target.value);
                      if (tagError) setTagError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTag();
                      if (e.key === 'Escape') setIsAddingTag(false);
                    }}
                    maxLength={256}
                    className={`w-full bg-plane-surface border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 select-text ${
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
                {t('preview.tagHelp')}
              </p>

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  onClick={() => {
                    setIsAddingTag(false);
                    setTagError(null);
                  }}
                  className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleAddTag}
                  disabled={!newKey.trim() || !keyValidation.isValid || !valueValidation.isValid || savingTags}
                  className="flex items-center space-x-1 px-3 py-1 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium rounded transition-colors shadow-2xs disabled:opacity-50"
                >
                  {savingTags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  <span>{t('preview.save')}</span>
                </button>
              </div>
            </div>
          )}

          {tagError && (
            <p className="text-[11px] text-destructive">{tagError}</p>
          )}

          {tagSuccess && (
            <p className="text-[11px] text-emerald-400 flex items-center space-x-1">
              <Check className="w-3 h-3" />
              <span>{tagSuccess}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
