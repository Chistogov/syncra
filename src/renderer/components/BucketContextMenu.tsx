import React, { useEffect, useState } from 'react';
import {
  Database,
  Edit3,
  Trash2,
  Plus,
  RefreshCw,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { S3Bucket } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

export interface BucketContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  bucket: S3Bucket | null;
  onClose: () => void;
  onRenameBucket?: (bucket: S3Bucket) => void;
  onDeleteBucket?: (bucketName: string) => void;
  onCreateBucket?: () => void;
  onRefreshBuckets?: () => void;
  canCreateBucket?: boolean;
  canDeleteBucket?: boolean;
}

export const BucketContextMenu: React.FC<BucketContextMenuProps> = ({
  isOpen,
  position,
  bucket,
  onClose,
  onRenameBucket,
  onDeleteBucket,
  onCreateBucket,
  onRefreshBuckets,
  canCreateBucket = true,
  canDeleteBucket = true,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCopied(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bucket) return;
    navigator.clipboard.writeText(bucket.name);
    setCopied(true);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  let menuStyle: React.CSSProperties = {};
  if (!isMobile && position) {
    const menuWidth = 220;
    const menuHeight = bucket ? 170 : 130;
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

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div className="truncate">
                <h4 className="font-semibold text-sm text-foreground truncate">
                  {bucket ? bucket.name : t('sidebar.buckets')}
                </h4>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col space-y-1 mt-2.5">
            {bucket ? (
              <>
                {/* Rename */}
                {onRenameBucket && (
                  <button
                    onClick={() => {
                      onClose();
                      onRenameBucket(bucket);
                    }}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
                  >
                    <Edit3 className="w-4 h-4 text-muted-foreground" />
                    <span>{t('sidebar.renameBucket')}</span>
                  </button>
                )}

                {/* Copy Name */}
                <button
                  onClick={handleCopyName}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span>
                    {copied ? t('common.copied') : t('sidebar.copyBucketName')}
                  </span>
                </button>

                {/* Delete */}
                {canDeleteBucket && onDeleteBucket && (
                  <button
                    onClick={() => {
                      onClose();
                      onDeleteBucket(bucket.name);
                    }}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-destructive/10 active:bg-destructive/20 text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t('sidebar.deleteBucket')}</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Create Bucket */}
                {canCreateBucket && onCreateBucket && (
                  <button
                    onClick={() => {
                      onClose();
                      onCreateBucket();
                    }}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
                  >
                    <Plus className="w-4 h-4 text-primary" />
                    <span>{t('sidebar.newBucket')}</span>
                  </button>
                )}

                {/* Refresh Buckets */}
                {onRefreshBuckets && (
                  <button
                    onClick={() => {
                      onClose();
                      onRefreshBuckets();
                    }}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted active:bg-muted/80 text-foreground transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                    <span>{t('sidebar.refreshBuckets')}</span>
                  </button>
                )}
              </>
            )}
          </div>

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
          className="fixed z-50 min-w-[200px] max-w-[260px] bg-plane-surface border border-border rounded-xl shadow-2xl p-1.5 text-xs text-foreground select-none animate-in fade-in zoom-in-95 duration-100"
        >
          {bucket ? (
            <>
              {/* Header */}
              <div className="px-2 py-1.5 border-b border-border/50 mb-1 flex items-center space-x-2">
                <Database className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="font-semibold text-xs text-foreground truncate" title={bucket.name}>
                  {bucket.name}
                </span>
              </div>

              {/* Rename */}
              {onRenameBucket && (
                <button
                  onClick={() => {
                    onClose();
                    onRenameBucket(bucket);
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{t('sidebar.renameBucket')}</span>
                </button>
              )}

              {/* Copy Name */}
              <button
                onClick={handleCopyName}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span>
                  {copied ? t('common.copied') : t('sidebar.copyBucketName')}
                </span>
              </button>

              {/* Delete */}
              {canDeleteBucket && onDeleteBucket && (
                <>
                  <div className="my-1 border-t border-border/50" />
                  <button
                    onClick={() => {
                      onClose();
                      onDeleteBucket(bucket.name);
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors text-left cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('sidebar.deleteBucket')}</span>
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {/* Create Bucket */}
              {canCreateBucket && onCreateBucket && (
                <button
                  onClick={() => {
                    onClose();
                    onCreateBucket();
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  <span>{t('sidebar.newBucket')}</span>
                </button>
              )}

              {/* Refresh Buckets */}
              {onRefreshBuckets && (
                <button
                  onClick={() => {
                    onClose();
                    onRefreshBuckets();
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{t('sidebar.refreshBuckets')}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
