import React, { useState, useRef, useEffect } from 'react';
import { X, Edit3, Loader2 } from 'lucide-react';
import { S3Item } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

export interface RenameModalProps {
  isOpen: boolean;
  item: S3Item | null;
  onClose: () => void;
  onRename: (item: S3Item, newName: string) => Promise<void>;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  item,
  onClose,
  onRename,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && item) {
      setName(item.name);
      setError(null);
      setIsSubmitting(false);

      setTimeout(() => {
        if (!inputRef.current) return;
        inputRef.current.focus();

        // For files, select only the name part without extension
        if (!item.isPrefix) {
          const lastDot = item.name.lastIndexOf('.');
          if (lastDot > 0) {
            inputRef.current.setSelectionRange(0, lastDot);
            return;
          }
        }
        inputRef.current.select();
      }, 50);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();

    if (!clean) {
      setError(t('renameModal.emptyError'));
      return;
    }

    if (clean.includes('/')) {
      setError(t('renameModal.slashError'));
      return;
    }

    if (clean === item.name) {
      onClose();
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onRename(item, clean);
      onClose();
    } catch (err: any) {
      setError(err.message || t('renameModal.genericError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs animate-fade-in select-none">
      <div className="bg-plane-surface border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col text-foreground animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">
                {item.isPrefix ? t('renameModal.titleFolder') : t('renameModal.titleFile')}
              </h3>
              <p className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                {item.name}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('renameModal.newNameLabel')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all font-sans"
              placeholder={item.name}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

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
              disabled={isSubmitting || !name.trim() || name.trim() === item.name}
              className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t('renameModal.saveButton')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
