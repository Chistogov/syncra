import React, { useState, useEffect, useRef } from 'react';
import { X, Database, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface CreateBucketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (bucketName: string) => Promise<boolean | void>;
}

export const CreateBucketModal: React.FC<CreateBucketModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const { t } = useTranslation();
  const [bucketName, setBucketName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setBucketName('');
      setValidationError(null);
      setServerError(null);
      setIsSubmitting(false);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  const validateName = (name: string): string | null => {
    if (!name) return null;
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
    setBucketName(val);
    setServerError(null);
    setValidationError(validateName(val));
  };

  const handleFixName = () => {
    const fixed = bucketName
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9.-]/g, '');
    setBucketName(fixed);
    setValidationError(validateName(fixed));
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = bucketName.trim();
    const err = validateName(clean);
    if (err) {
      setValidationError(err);
      inputRef.current?.focus();
      return;
    }

    try {
      setIsSubmitting(true);
      setServerError(null);
      await onCreate(clean);
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Ошибка создания бакета');
      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasFixableIssues = bucketName.includes('_') || /[A-Z]/.test(bucketName) || /\s/.test(bucketName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-plane-surface border border-border rounded-lg w-full max-w-md shadow-2xl overflow-hidden flex flex-col text-foreground">
        {/* Shadcn Dialog Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{t('bucketModal.title')}</h3>
              <p className="text-[11px] text-muted-foreground">
                {t('bucketModal.subtitle')}
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

        {/* Dialog Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-md flex items-start space-x-2 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('bucketModal.name')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={bucketName}
              onChange={handleChange}
              placeholder={t('bucketModal.placeholder')}
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-border font-mono select-text transition-all"
              required
            />
          </div>

          {validationError && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-300 text-xs space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                <span>{validationError}</span>
              </div>
              {hasFixableIssues && (
                <button
                  type="button"
                  onClick={handleFixName}
                  className="flex items-center space-x-1.5 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded text-[11px] font-medium transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Fix name automatically</span>
                </button>
              )}
            </div>
          )}

          <div className="text-[11px] text-muted-foreground space-y-1 bg-muted/30 p-2.5 rounded-md border border-border/50">
            <span className="font-medium text-foreground/80 block">{t('bucketModal.rules')}</span>
            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
              <li>3 - 63 characters</li>
              <li>lowercase letters, numbers, hyphens (-)</li>
              <li>no underscores (_)</li>
            </ul>
          </div>

          {/* Shadcn Dialog Footer */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-foreground border border-border bg-transparent hover:bg-muted rounded-md transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(validationError) || !bucketName.trim()}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary-hover rounded-md transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('bucketModal.creating')}</span>
                </>
              ) : (
                <span>{t('bucketModal.create')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
