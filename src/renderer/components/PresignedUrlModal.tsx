import React, { useState, useEffect } from 'react';
import { X, Link2, Copy, Check, Clock, Sparkles } from 'lucide-react';
import { S3Profile } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

interface PresignedUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: S3Profile;
  bucket: string;
  itemKey: string;
}

export const PresignedUrlModal: React.FC<PresignedUrlModalProps> = ({
  isOpen,
  onClose,
  profile,
  bucket,
  itemKey,
}) => {
  const { t } = useTranslation();
  const [expiresIn, setExpiresIn] = useState<number>(3600);
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && profile && bucket && itemKey) {
      generateUrl(expiresIn);
    }
  }, [isOpen, expiresIn, profile, bucket, itemKey]);

  if (!isOpen) return null;

  const generateUrl = async (seconds: number) => {
    try {
      setLoading(true);
      const res = await window.electronAPI.s3.getPresignedUrl(profile, bucket, itemKey, seconds);
      setUrl(res);
    } catch (err) {
      console.error('Failed to generate presigned url:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-plane-surface border border-border rounded-lg w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-foreground">
        {/* Shadcn Dialog Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-sm text-foreground">{t('presigned.title')}</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('presigned.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">{t('common.file')} S3</label>
            <div className="text-xs font-mono text-muted-foreground bg-background px-3 py-1.5 rounded-md border border-border truncate">
              {itemKey}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('presigned.expiry')}</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: t('presigned.15m'), val: 900 },
                { label: t('presigned.1h'), val: 3600 },
                { label: t('presigned.24h'), val: 86400 },
                { label: t('presigned.7d'), val: 604800 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setExpiresIn(opt.val)}
                  className={`py-1.5 px-2 text-xs rounded-md border font-medium transition-colors ${
                    expiresIn === opt.val
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('preview.directLink')}
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={loading ? t('common.loading') : url}
                className="w-full bg-background border border-border rounded-md pl-3 pr-24 py-1.5 text-xs font-mono text-foreground focus:outline-none select-text"
              />
              <button
                type="button"
                onClick={copyToClipboard}
                disabled={loading || !url}
                className="absolute right-1 top-1 bottom-1 px-2.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('common.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('common.copy')}</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {t('preview.presignedDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
