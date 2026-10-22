import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Trash2, AlertTriangle, Info, X } from 'lucide-react';
import { useTranslation } from './LanguageContext';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'warning' | 'info';
  items?: string[];
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
  }>({
    isOpen: false,
    options: {
      title: '',
      message: '',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      variant: 'destructive',
    },
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setModalState({
        isOpen: true,
        options: {
          confirmText: options.confirmText || (options.variant === 'warning' ? t('common.continue') : t('common.delete')),
          cancelText: options.cancelText || t('common.cancel'),
          variant: options.variant || 'destructive',
          ...options,
        },
      });
    });
  }, [t]);

  const handleClose = (result: boolean) => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  // Keyboard shortcut handler (Escape to Cancel, Enter to Confirm)
  React.useEffect(() => {
    if (!modalState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(false);
      } else if (e.key === 'Enter') {
        // Prevent accidental trigger if inside a textarea
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'textarea') {
          e.preventDefault();
          handleClose(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState.isOpen]);

  const { options, isOpen } = modalState;
  const isDestructive = options.variant === 'destructive';
  const isWarning = options.variant === 'warning';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-xs animate-fade-in p-4 text-foreground select-none">
          <div
            className="bg-plane-surface border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header & Content */}
            <div className="p-5 flex items-start space-x-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5 border ${
                  isDestructive
                    ? 'bg-destructive/10 border-destructive/20 text-destructive'
                    : isWarning
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-primary/10 border-primary/20 text-primary'
                }`}
              >
                {isDestructive ? (
                  <Trash2 className="w-5 h-5" />
                ) : isWarning ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Info className="w-5 h-5" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground tracking-tight">
                    {options.title}
                  </h3>
                  <button
                    onClick={() => handleClose(false)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors -mr-1 -mt-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                  {options.message}
                </p>

                {/* Optional Items Preview List */}
                {options.items && options.items.length > 0 && (
                  <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-border bg-background/60 p-2 space-y-1 text-[11px] font-mono">
                    {options.items.slice(0, 10).map((it, idx) => (
                      <div key={idx} className="truncate text-muted-foreground hover:text-foreground flex items-center space-x-1.5">
                        <span className="text-muted-foreground/40">•</span>
                        <span className="truncate">{it}</span>
                      </div>
                    ))}
                    {options.items.length > 10 && (
                      <div className="text-[10px] text-muted-foreground/60 italic pt-1 pl-3">
                        и ещё {options.items.length - 10} объектов...
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="px-5 py-3.5 bg-background border-t border-border flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-transparent hover:bg-muted text-foreground transition-colors shadow-2xs"
              >
                {options.cancelText || 'Отмена'}
              </button>

              <button
                type="button"
                autoFocus
                onClick={() => handleClose(true)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                  isDestructive
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : isWarning
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    : 'bg-primary text-primary-foreground hover:bg-primary-hover'
                }`}
              >
                {options.confirmText || 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
