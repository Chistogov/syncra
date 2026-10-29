import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  Database,
  Folder,
  Home,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  X,
  SlidersHorizontal,
  Menu,
} from 'lucide-react';
import { S3Bucket } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

interface BreadcrumbsProps {
  bucket: string;
  prefix: string;
  buckets?: S3Bucket[];
  canGoBack?: boolean;
  canGoForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onNavigate: (newPrefix: string) => void;
  onApplyPath?: (inputPath: string) => Promise<void> | void;
  onSelectBucket?: (bucketName: string) => void;
  onRootClick: () => void;
  onOpenMobileSidebar?: () => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  bucket,
  prefix,
  buckets = [],
  canGoBack = false,
  canGoForward = false,
  onNavigateBack,
  onNavigateForward,
  onNavigate,
  onApplyPath,
  onSelectBucket,
  onRootClick,
  onOpenMobileSidebar,
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parts = prefix
    ? prefix
        .split('/')
        .filter(Boolean)
    : [];

  const getDisplayPath = () => {
    if (!bucket) return '';
    return prefix ? `${bucket}/${prefix}` : `${bucket}/`;
  };

  useEffect(() => {
    if (isEditing) {
      setInputValue(getDisplayPath());
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [isEditing, bucket, prefix]);

  // Layout-independent shortcut Ctrl + L (works on QWERTY, ЙЦУКЕН, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyL' || e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        setIsEditing(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartEditing = () => {
    if (!bucket) return;
    setIsEditing(true);
  };

  const handleApplyPath = async () => {
    setIsEditing(false);
    const raw = inputValue.trim();
    if (onApplyPath) {
      await onApplyPath(raw);
      return;
    }

    let clean = raw.replace(/^s3:\/\//i, '').replace(/^\/+/, '');

    if (!clean) {
      onNavigate('');
      return;
    }

    const segments = clean.split('/').filter(Boolean);
    if (segments.length === 0) {
      onNavigate('');
      return;
    }

    const firstSegment = segments[0];
    const isFirstSegmentBucket =
      firstSegment === bucket || buckets.some((b) => b.name === firstSegment);

    if (isFirstSegmentBucket) {
      const targetBucket = firstSegment;
      const targetPrefix = segments.slice(1).join('/') + (segments.length > 1 ? '/' : '');

      if (targetBucket !== bucket && onSelectBucket) {
        onSelectBucket(targetBucket);
      }
      onNavigate(targetPrefix);
    } else {
      const targetPrefix = segments.join('/') + '/';
      onNavigate(targetPrefix);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyPath();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullS3Path = bucket ? `s3://${bucket}/${prefix || ''}` : '';
    if (fullS3Path) {
      navigator.clipboard.writeText(fullS3Path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <nav className="h-11 px-4 bg-plane-bg border-b border-border flex items-center justify-between text-xs select-none">
      {/* Plane.so Breadcrumb & Address Bar */}
      <div className="flex-1 flex items-center min-w-0 mr-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors mr-1.5 flex-shrink-0"
            title="Открыть список бакетов"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {/* History Navigation Buttons */}
        <div className="flex items-center space-x-0.5 mr-1 flex-shrink-0">
          <button
            type="button"
            onClick={onNavigateBack}
            disabled={!canGoBack}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-25 disabled:pointer-events-none rounded-md transition-colors"
            title="Назад (Кнопка мыши 3 / Alt+←)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onNavigateForward}
            disabled={!canGoForward}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-25 disabled:pointer-events-none rounded-md transition-colors"
            title="Вперёд (Кнопка мыши 4 / Alt+→)"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={onRootClick}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors mr-1 flex-shrink-0"
          title="К списку всех бакетов"
        >
          <Home className="w-4 h-4" />
        </button>

        <span className="text-border mr-1.5 font-light">/</span>

        {/* Address Container */}
        <div
          onClick={() => !isEditing && handleStartEditing()}
          className={`flex-1 flex items-center h-8 px-2.5 rounded-md border transition-all ${
            isEditing
              ? 'bg-plane-surface border-primary/60 ring-1 ring-primary/40 shadow-xs'
              : 'bg-plane-surface/60 border-border/70 hover:border-border hover:bg-plane-surface cursor-text'
          }`}
        >
          {isEditing ? (
            <div className="w-full flex items-center space-x-2">
              <span className="text-[11px] font-mono text-primary select-none pl-0.5">s3://</span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  setTimeout(() => setIsEditing(false), 200);
                }}
                placeholder="bucket/folder/subfolder/"
                className="w-full bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none select-text"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleApplyPath();
                }}
                className="p-1 hover:bg-primary hover:text-primary-foreground rounded text-primary transition-colors"
                title="Перейти (Enter)"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsEditing(false);
                }}
                className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
                title="Отмена (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 overflow-x-auto whitespace-nowrap py-0.5 no-scrollbar w-full">
              {bucket ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate('');
                    }}
                    className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-xs transition-colors ${
                      parts.length === 0
                        ? 'font-medium text-foreground bg-accent'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span>{bucket}</span>
                  </button>

                  {parts.map((part, index) => {
                    const subPath = parts.slice(0, index + 1).join('/') + '/';
                    const isLast = index === parts.length - 1;

                    return (
                      <React.Fragment key={subPath}>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(subPath);
                          }}
                          className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-xs transition-colors ${
                            isLast
                              ? 'font-medium text-foreground bg-accent'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                          }`}
                        >
                          <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span>{part}</span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </>
              ) : (
                <span className="text-muted-foreground/60 text-xs italic">
                  {t('sidebar.noBuckets')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Plane.so Right Actions */}
      {bucket && (
        <div className="flex items-center space-x-1 flex-shrink-0">
          <kbd
            onClick={() => setIsEditing(true)}
            className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground/80 bg-muted/60 hover:bg-muted border border-border px-1.5 py-0.5 rounded-md cursor-pointer transition-colors mr-1"
            title="Ctrl+L"
          >
            Ctrl L
          </kbd>

          <button
            onClick={handleCopyPath}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
            title={t('browser.copyS3Uri')}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}
    </nav>
  );
};
