import React, { useState, useEffect, useRef } from 'react';
import { X, Database, AlertCircle, Sparkles, Loader2, Info } from 'lucide-react';
import { S3Bucket } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

export interface RenameBucketModalProps {
  isOpen: boolean;
  bucket: S3Bucket | null;
  onClose: () => void;
  onRename: (oldBucketName: string, newBucketName: string) => Promise<boolean | void>;
}

export const RenameBucketModal: React.FC<RenameBucketModalProps> = ({
  isOpen,
  bucket,
  onClose,
  onRename,
}) => {
  const { t } = useTranslation();
  const [newBucketName, setNewBucketName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && bucket) {
      setNewBucketName(bucket.name);
      setValidationError(null);
      setServerError(null);
      setIsSubmitting(false);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, bucket]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !bucket) return null;

  const validateName = (name: string): string | null => {
    if (!name) return null;
    if (name === bucket.name) {
      return t('renameBucketModal.sameNameError');
    }
    if (name.includes('_')) {
      return "Имя бакета не может содержать символ '_'. Используйте дефис '-' (например: test-bucket).";
    }
    if (/[A-Z]/.test(name)) {
      return 'Имя бакета должно состоять только из строчных букв (lowercase).';
    }
    if (/\s/.test(name)) {
      return 'Имя бакета не должно содержать пробелы.';
    }
    if (name.length < 3) {
      return 'Имя бакета должно содержать не менее 3 символов.';
    }
    if (name.length > 63) {
      return 'Имя бакета не должно превышать 63 символа.';
    }
    if (!/^[a-z0-9]/.test(name)) {
      return 'Имя бакета должно начинаться с буквы или цифры.';
    }
    if (!/[a-z0-9]$/.test(name)) {
      return 'Имя бакета должно заканчиваться буквой или цифрой.';
    }
    if (!/^[a-z0-9.-]+$/.test(name)) {
      return 'Разрешены только строчные буквы латиницы (a-z), цифры (0-9), дефисы (-) и точки (.).';
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewBucketName(val);
    setServerError(null);
    setValidationError(validateName(val));
  };

  const handleFixName = () => {
    const fixed = newBucketName
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9.-]/g, '');
    setNewBucketName(fixed);
    setValidationError(validateName(fixed));
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newBucketName.trim();
    const err = validateName(clean);
    if (err) {
      setValidationError(err);
      inputRef.current?.focus();
      return;
    }

    try {
      setIsSubmitting(true);
      setServerError(null);
      await onRename(bucket.name, clean);
      onClose();
    } catch (err: any) {
      setServerError(err.message || t('renameBucketModal.error'));
      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasFixableIssues =
    newBucketName.includes('_') ||
    /[A-Z]/.test(newBucketName) ||
    /\s/.test(newBucketName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fade-in select-none">
      <div className="bg-plane-surface border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col text-foreground animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">
                {t('renameBucketModal.title')}
              </h3>
              <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[260px]">
                {bucket.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dialog Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start space-x-2 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {/* S3 Architecture Notice */}
          <div className="p-2.5 bg-muted/40 border border-border/70 rounded-lg flex items-start space-x-2 text-muted-foreground text-xs">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
            <p className="leading-relaxed">
              {t('renameBucketModal.notice')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('renameBucketModal.newName')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={newBucketName}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder={t('renameBucketModal.placeholder')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary font-mono select-text transition-all"
              required
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {validationError && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                <span>{validationError}</span>
              </div>
              {hasFixableIssues && (
                <button
                  type="button"
                  onClick={handleFixName}
                  disabled={isSubmitting}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/30 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Исправить автоматически</span>
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !newBucketName.trim() ||
                newBucketName.trim() === bucket.name ||
                Boolean(validationError)
              }
              className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {isSubmitting
                  ? t('renameBucketModal.migrating')
                  : t('renameBucketModal.submit')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
