import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  AlertCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { S3Profile, S3Item, FilePreviewData } from '../../common/types';
import { formatBytes, formatDate } from '../utils/formatters';
import { useTranslation } from '../context/LanguageContext';

export interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: S3Item | null;
  profile: S3Profile | null;
  bucket: string;
  onDownload?: (item: S3Item) => void;
  onOpenExternal?: (item: S3Item) => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  item,
  profile,
  bucket,
  onDownload,
  onOpenExternal,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (isOpen && item && profile) {
      loadPdf();
    } else {
      setPdfUrl(null);
      setError(null);
      setLoading(true);
    }
  }, [isOpen, item, profile, bucket]);

  const loadPdf = async () => {
    if (!item || !profile) return;
    setLoading(true);
    setError(null);
    try {
      const data: FilePreviewData = await window.electronAPI.s3.getPreview(profile, bucket, item.key);
      if (data.url) {
        setPdfUrl(data.url);
      } else {
        setError('Не удалось сформировать ссылку для просмотра PDF файла');
      }
    } catch (err: any) {
      console.error('Failed to load PDF preview:', err);
      setError(err.message || 'Ошибка загрузки PDF документа');
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcut: Escape to close / minimize
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (isMaximized) {
          setIsMaximized(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMaximized, onClose]);

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs animate-fade-in text-foreground p-2 sm:p-4 md:p-6 select-none">
      <div
        className={`bg-plane-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[90vh]'
        }`}
      >
        {/* Modal Header */}
        <div className="h-12 px-4 border-b border-border flex items-center justify-between bg-plane-surface/90 select-none flex-shrink-0">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>

            <div className="flex items-center space-x-2 truncate">
              <span className="font-semibold text-xs text-foreground truncate" title={item.name}>
                {item.name}
              </span>

              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1 flex-shrink-0">
                PDF
              </span>

              <span className="text-border hidden sm:inline">|</span>

              <span className="text-[11px] text-muted-foreground font-mono truncate hidden md:inline">
                s3://{bucket}/{item.key}
              </span>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-1.5 flex-shrink-0">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center space-x-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title={t('pdf.inNewTabTooltip')}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('pdf.inNewTab')}</span>
              </a>
            )}

            {onDownload && (
              <button
                onClick={() => onDownload(item)}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title={t('pdf.downloadTooltip')}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('pdf.download')}</span>
              </button>
            )}

            {onOpenExternal && (
              <button
                onClick={() => onOpenExternal(item)}
                className="hidden sm:flex items-center space-x-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                title={t('pdf.inAppTooltip')}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('pdf.inApp')}</span>
              </button>
            )}

            {/* Maximize Toggle */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={isMaximized ? t('pdf.restore') : t('pdf.maximize')}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={t('pdf.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Notification Banner */}
        {error && (
          <div className="px-4 py-2.5 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadPdf}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-destructive/20 hover:bg-destructive/30 text-destructive text-xs transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{t('pdf.retry')}</span>
            </button>
          </div>
        )}

        {/* Main PDF Viewer Container */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-neutral-900">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground space-y-2 bg-plane-surface">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs">{t('pdf.loading')}</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={item.name}
              className="w-full h-full border-0 bg-neutral-900"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground space-y-2 bg-plane-surface">
              <AlertCircle className="w-8 h-8 text-muted-foreground/60" />
              <p className="text-xs">{t('pdf.unavailable')}</p>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="h-6 px-4 bg-plane-surface border-t border-border flex items-center justify-between text-[11px] text-muted-foreground select-none font-mono">
          <div className="flex items-center space-x-3">
            <span>{t('pdf.size', { size: formatBytes(item.size) })}</span>
            <span>•</span>
            <span>{t('pdf.modified', { date: formatDate(item.lastModified) })}</span>
            {item.eTag && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline truncate max-w-xs" title={item.eTag}>
                  ETag: {item.eTag}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <kbd className="text-[10px] font-sans text-muted-foreground/80">{t('pdf.escClose')}</kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
