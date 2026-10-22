import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Play,
  Square,
  ExternalLink,
  Copy,
  Check,
  Server,
  Wifi,
  Laptop,
  Smartphone,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { WebServerStatus } from '../../common/types';

interface WebServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  webServerStatus: WebServerStatus | null;
  onRefreshStatus: () => Promise<void>;
}

export const WebServerModal: React.FC<WebServerModalProps> = ({
  isOpen,
  onClose,
  webServerStatus,
  onRefreshStatus,
}) => {
  const [portInput, setPortInput] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('s3_webserver_port');
      if (saved) return saved;
    } catch {}
    return String(webServerStatus?.port || 8080);
  });
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Synchronize with backend port ONLY when the server is actively running!
  // When stopped, preserve user's typed value in portInput so it never resets!
  useEffect(() => {
    if (webServerStatus?.running && webServerStatus.port) {
      setPortInput(String(webServerStatus.port));
    }
  }, [webServerStatus?.running, webServerStatus?.port]);

  if (!isOpen) return null;

  const isRunning = Boolean(webServerStatus?.running);

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 5);
    setPortInput(cleaned);
    setErrorMsg(null);
    if (cleaned) {
      try {
        localStorage.setItem('s3_webserver_port', cleaned);
      } catch {}
    }
  };

  const handleSelectPresetPort = (preset: number) => {
    if (isRunning) return;
    const str = String(preset);
    setPortInput(str);
    setErrorMsg(null);
    try {
      localStorage.setItem('s3_webserver_port', str);
    } catch {}
  };

  const handleToggleServer = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (isRunning) {
        await window.electronAPI.webServer.stop();
      } else {
        const port = parseInt(portInput.trim(), 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          setErrorMsg('Укажите корректный номер порта от 1 до 65535 (например, 8080 или 3000)');
          setLoading(false);
          return;
        }
        try {
          localStorage.setItem('s3_webserver_port', String(port));
        } catch {}

        const res = await window.electronAPI.webServer.start(port);
        if (!res.success && res.error) {
          setErrorMsg(res.error);
        }
      }
      await onRefreshStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка управления Web-сервером');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleOpenBrowser = (url?: string) => {
    window.electronAPI.webServer.openInBrowser(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs animate-fade-in p-4 text-foreground">
      <div className="bg-plane-surface border border-border rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-border/80 bg-plane-surface">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 bg-primary/10 border border-primary/20 rounded-lg text-primary shadow-xs">
                <Globe className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground tracking-tight">
                  Встроенный Web-сервер S3 Studio
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Работа с S3 и MinIO в браузере с локального ПК, смартфона или планшета
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
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs">
          {/* Server Status Control Card */}
          <div className="p-4 rounded-xl border border-border bg-background flex items-center justify-between shadow-2xs">
            <div className="flex items-center space-x-3.5">
              <div
                className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                  isRunning ? 'bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20' : 'bg-muted-foreground/40'
                }`}
              />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-foreground">
                    {isRunning ? 'Web-сервер активен' : 'Web-сервер остановлен'}
                  </span>
                  {isRunning && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Порт: {webServerStatus?.port}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isRunning
                    ? 'Приложение доступно для открытия в браузере по ссылкам ниже'
                    : 'Запустите сервер, чтобы работать с хранилищем через веб-интерфейс'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 flex-shrink-0">
              {!isRunning && (
                <div className="flex items-center space-x-1.5 bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border focus-within:border-primary transition-colors">
                  <span className="text-[11px] text-muted-foreground font-medium select-none">
                    Порт:
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="8080"
                    value={portInput}
                    onChange={handlePortChange}
                    className="w-16 bg-transparent text-xs font-mono font-bold text-foreground text-center focus:outline-none placeholder:text-muted-foreground/40"
                    title="Укажите номер порта (например: 8080, 3000, 8000)"
                  />
                </div>
              )}

              <button
                onClick={handleToggleServer}
                disabled={loading || (!isRunning && !portInput.trim())}
                className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-2 transition-all ${
                  isRunning
                    ? 'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20'
                    : 'bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50'
                }`}
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : isRunning ? (
                  <Square className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>{isRunning ? 'Остановить' : 'Запустить'}</span>
              </button>
            </div>
          </div>

          {/* Quick Preset Port Pills */}
          {!isRunning && (
            <div className="flex items-center space-x-2 text-[11px] text-muted-foreground -mt-2 px-1">
              <span>Быстрый выбор порта:</span>
              {[8080, 3000, 8000, 9090].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPresetPort(preset)}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors ${
                    portInput === String(preset)
                      ? 'bg-primary/10 text-primary border-primary/30 font-bold'
                      : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Active Network URLs List */}
          {isRunning && webServerStatus && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-foreground flex items-center space-x-1.5">
                <Wifi className="w-3.5 h-3.5 text-primary" />
                <span>Ссылки для подключения к Web-клиенту</span>
              </h4>

              <div className="space-y-2">
                {webServerStatus.networkUrls.map((url, idx) => {
                  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
                  return (
                    <div
                      key={url}
                      className="p-3 rounded-lg border border-border bg-plane-surface flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        <div className="p-1.5 rounded-md bg-muted text-muted-foreground flex-shrink-0">
                          {isLocal ? <Laptop className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                        </div>
                        <div className="truncate">
                          <span className="font-mono font-medium text-foreground text-xs select-all">
                            {url}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">
                            {isLocal ? 'Для браузера на этом компьютере' : 'Для смартфонов и ноутбуков в локальной сети Wi-Fi'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleCopy(url)}
                          className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Скопировать ссылку"
                        >
                          {copiedUrl === url ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleOpenBrowser(url)}
                          className="px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors flex items-center space-x-1"
                          title="Открыть в браузере по умолчанию"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Открыть</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Architecture & Isolation Notice */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2.5 text-muted-foreground">
            <div className="flex items-center space-x-2 text-foreground font-medium text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Изоляция и конфиденциальность данных в браузере</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              <strong>Хранение в localStorage:</strong> Профили подключения, ключи доступа и персональные настройки в браузерной версии сохраняются <em>исключительно локально</em> в хранилище вашего браузера (localStorage/cookie).
            </p>
            <p className="text-[11px] leading-relaxed">
              <strong>Полноценный функционал:</strong> В веб-интерфейсе поддерживаются все возможности: загрузка и скачивание файлов, создание бакетов и папок, генерация ссылок, встроенный предпросмотр и администрирование кластера MinIO.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-background border-t border-border flex items-center justify-between text-xs">
          <span className="text-[11px] text-muted-foreground">
            Syncra • Embedded HTTP Gateway
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors border border-border"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
export default WebServerModal;