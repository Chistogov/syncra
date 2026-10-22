import React, { useState, useRef, useEffect } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (folderName: string) => Promise<void>;
  currentPrefix: string;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  currentPrefix,
}) => {
  const { t } = useTranslation();
  const [folderName, setFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderName('');
      setError(null);
      setIsSubmitting(false);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = folderName.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) {
      setError('Имя папки не может быть пустым');
      return;
    }
    if (clean.includes('/')) {
      setError('Имя папки не должно содержать слеши');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onCreate(clean);
      setFolderName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка создания папки');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-plane-surface border border-border rounded-lg w-full max-w-md shadow-2xl overflow-hidden flex flex-col text-foreground">
        {/* Shadcn Dialog Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-400">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{t('folderModal.title')}</h3>
              <p className="text-[11px] text-muted-foreground">
                {t('folderModal.location')}
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('folderModal.location')}
            </label>
            <div className="text-xs font-mono text-muted-foreground bg-background px-3 py-1.5 rounded-md border border-border truncate">
              /{currentPrefix || t('folderModal.root')}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('folderModal.name')}
            </label>
            <input
              ref={inputRef}
              type="text"
              placeholder={t('folderModal.placeholder')}
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-border select-text transition-all"
              required
            />
          </div>

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
              disabled={isSubmitting || !folderName.trim()}
              className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary-hover rounded-md transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? t('folderModal.creating') : t('folderModal.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
