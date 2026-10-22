import React from 'react';
import { UploadCloud, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { WatcherEvent } from '../../common/types';

interface EditInPlaceNotificationProps {
  event: WatcherEvent | null;
  onSave: (bucket: string, key: string) => Promise<void>;
  onDismiss: () => void;
  isSaving: boolean;
}

export const EditInPlaceNotification: React.FC<EditInPlaceNotificationProps> = ({
  event,
  onSave,
  onDismiss,
  isSaving,
}) => {
  if (!event) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full bg-plane-surface border border-border rounded-lg shadow-2xl p-4 animate-fade-in text-foreground">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-primary/10 rounded-md text-primary flex-shrink-0">
            <UploadCloud className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h4 className="text-xs font-semibold text-foreground">Файл изменен на диске</h4>
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Edit-in-Place
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-xs font-mono">
              {event.key}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        Обнаружено сохранение файла внешней программой. Отправить новую версию в бакет <code className="text-foreground font-mono">{event.bucket}</code>?
      </p>

      <div className="flex items-center justify-end space-x-2 mt-3 pt-2.5 border-t border-border">
        <button
          onClick={onDismiss}
          className="px-2.5 py-1 text-xs text-foreground border border-border bg-transparent hover:bg-muted rounded-md transition-colors"
        >
          Позже
        </button>
        <button
          onClick={() => onSave(event.bucket, event.key)}
          disabled={isSaving}
          className="flex items-center space-x-1.5 px-3 py-1 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 shadow-xs"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          <span>{isSaving ? 'Загрузка...' : 'Загрузить в S3'}</span>
        </button>
      </div>
    </div>
  );
};
