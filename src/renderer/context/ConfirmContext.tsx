import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Trash2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useTranslation } from './LanguageContext';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'warning' | 'info';
  items?: string[];
}

export interface AlertOptions {
  title?: string;
  message: string;
  buttonText?: string;
  variant?: 'destructive' | 'warning' | 'info';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  showAlert: (options: AlertOptions | string, title?: string) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
};

export const useAlert = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useAlert must be used within a ConfirmProvider');
  }
  return context.showAlert;
};

function parseAlertString(rawMessage: string, defaultErrorTitle: string): { title: string; message: string; variant: 'destructive' | 'warning' | 'info' } {
  const trimmed = rawMessage.trim();
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 60) {
    const prefix = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (
      rest.length > 0 &&
      /^(ошибка|отказано|не удалось|невозможно|error|failed|access denied|внимание|warning)/i.test(prefix)
    ) {
      const capitalizedRest = rest.charAt(0).toUpperCase() + rest.slice(1);
      return {
        title: prefix,
        message: capitalizedRest,
        variant: /^(внимание|warning)/i.test(prefix) ? 'warning' : 'destructive',
      };
    }
  }
  return {
    title: defaultErrorTitle,
    message: trimmed,
    variant: 'destructive',
  };
}

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

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    options: Required<AlertOptions>;
  }>({
    isOpen: false,
    options: {
      title: '',
      message: '',
      buttonText: 'Понятно',
      variant: 'destructive',
    },
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const alertResolverRef = useRef<(() => void) | null>(null);

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

  const showAlert = useCallback(
    (options: AlertOptions | string, customTitle?: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        alertResolverRef.current = resolve;
        if (typeof options === 'string') {
          const parsed = parseAlertString(options, customTitle || t('common.error'));
          setAlertState({
            isOpen: true,
            options: {
              title: customTitle || parsed.title,
              message: parsed.message,
              buttonText: t('common.ok'),
              variant: parsed.variant,
            },
          });
        } else {
          const defaultTitle =
            options.variant === 'warning'
              ? t('common.warning')
              : options.variant === 'info'
              ? t('common.success')
              : t('common.error');
          const parsed = !options.title
            ? parseAlertString(options.message, defaultTitle)
            : { title: options.title, message: options.message, variant: options.variant || 'destructive' };
          setAlertState({
            isOpen: true,
            options: {
              title: options.title || parsed.title,
              message: options.title ? options.message : parsed.message,
              buttonText: options.buttonText || t('common.ok'),
              variant: options.variant || parsed.variant,
            },
          });
        }
      });
    },
    [t]
  );

  // Override native window.alert globally so no system MessageBox ever opens
  React.useEffect(() => {
    const origAlert = window.alert;
    window.alert = (msg?: any) => {
      showAlert(String(msg ?? ''));
    };
    return () => {
      window.alert = origAlert;
    };
  }, [showAlert]);

  const handleClose = (result: boolean) => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  const handleCloseAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
    if (alertResolverRef.current) {
      alertResolverRef.current();
      alertResolverRef.current = null;
    }
  }, []);

  // Keyboard shortcut handler for Confirm Modal (Escape to Cancel, Enter to Confirm)
  React.useEffect(() => {
    if (!modalState.isOpen || alertState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(false);
      } else if (e.key === 'Enter') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'textarea') {
          e.preventDefault();
          handleClose(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState.isOpen, alertState.isOpen]);

  // Keyboard shortcut handler for Alert Modal (Escape or Enter to Close)
  React.useEffect(() => {
    if (!alertState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleCloseAlert();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [alertState.isOpen, handleCloseAlert]);

  const { options, isOpen } = modalState;
  const isDestructive = options.variant === 'destructive';
  const isWarning = options.variant === 'warning';

  const { options: alertOpts, isOpen: isAlertOpen } = alertState;
  const isAlertDestructive = alertOpts.variant === 'destructive';
  const isAlertWarning = alertOpts.variant === 'warning';

  return (
    <ConfirmContext.Provider value={{ confirm, showAlert }}>
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
                    className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors -mr-1 -mt-1 cursor-pointer"
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
                className="px-4 py-2 text-xs font-medium rounded-lg border border-border bg-transparent hover:bg-muted text-foreground transition-colors shadow-2xs cursor-pointer"
              >
                {options.cancelText || 'Отмена'}
              </button>

              <button
                type="button"
                autoFocus
                onClick={() => handleClose(true)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer ${
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

      {/* App-Styled Popup Alert Modal (Replaces native window.alert) */}
      {isAlertOpen && (
        <div
          onClick={handleCloseAlert}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-xs animate-fade-in p-4 text-foreground select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-plane-surface border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            role="alertdialog"
            aria-modal="true"
          >
            <div className="p-5 flex items-start space-x-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5 border ${
                  isAlertDestructive
                    ? 'bg-destructive/10 border-destructive/20 text-destructive'
                    : isAlertWarning
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-primary/10 border-primary/20 text-primary'
                }`}
              >
                {isAlertDestructive ? (
                  <AlertCircle className="w-5 h-5" />
                ) : isAlertWarning ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Info className="w-5 h-5" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground tracking-tight">
                    {alertOpts.title}
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseAlert}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors -mr-1 -mt-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap break-words select-text">
                  {alertOpts.message}
                </p>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-background border-t border-border flex items-center justify-end">
              <button
                type="button"
                autoFocus
                onClick={handleCloseAlert}
                className="px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors bg-primary text-primary-foreground hover:bg-primary-hover cursor-pointer"
              >
                {alertOpts.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
