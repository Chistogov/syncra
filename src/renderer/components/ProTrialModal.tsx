import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Check,
  Zap,
  FileEdit,
  Shield,
  Key,
  Calendar,
  Cpu,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  FileCode,
  Copy,
} from 'lucide-react';
import { LicenseStatus } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';

interface ProTrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  licenseStatus: LicenseStatus | null;
  onRefreshLicense: () => Promise<void>;
}

export const ProTrialModal: React.FC<ProTrialModalProps> = ({
  isOpen,
  onClose,
  licenseStatus,
  onRefreshLicense,
}) => {
  const { t } = useTranslation();
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationResult, setActivationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [copiedHwid, setCopiedHwid] = useState(false);

  if (!isOpen) return null;

  const isPro = Boolean(licenseStatus?.isPro);
  const isTrial = Boolean(licenseStatus?.isTrial);
  const isExpired = Boolean(licenseStatus?.isExpired);
  const daysLeft = licenseStatus?.trialDaysLeft ?? 0;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;

    setActivationLoading(true);
    setActivationResult(null);
    try {
      const res = await window.electronAPI.license.activateKey(licenseKeyInput.trim());
      setActivationResult(res);
      if (res.success) {
        setLicenseKeyInput('');
        await onRefreshLicense();
      }
    } catch (err: any) {
      setActivationResult({
        success: false,
        message: err.message || 'Ошибка проверки лицензионного ключа',
      });
    } finally {
      setActivationLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs animate-fade-in p-4 text-foreground">
      <div className="bg-plane-surface border border-border rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-border/80 bg-plane-surface relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-400">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 block leading-none">
                  {t('license.title')}
                </span>
                <h2 className="text-base font-semibold text-foreground mt-1 tracking-tight">
                  {t('license.proTitle')}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current Status Badge Banner */}
          <div className="mt-4 p-3 rounded-lg bg-background border border-border flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                {t('license.currentStatus')}
              </span>
              <div className="flex items-center space-x-2 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isPro && !isTrial
                      ? 'bg-amber-400'
                      : isTrial
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-muted-foreground'
                  }`}
                />
                <span className="text-xs font-semibold text-foreground">
                  {isPro && !isTrial
                    ? t('license.proActive')
                    : isTrial
                    ? t('license.trialPeriod', { days: daysLeft })
                    : t('license.community')}
                </span>
              </div>
            </div>

            {isPro && !isTrial && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {t('license.lifetimePro')}
              </span>
            )}
            {isTrial && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {t('license.trialUntil', { date: licenseStatus?.trialEndDate || '' })}
              </span>
            )}
            {isExpired && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                {t('license.trialEnded')}
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto text-xs">
          {/* Hardware & Trial Persistence Details */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/60">
              <div className="flex items-center space-x-1.5 truncate">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span>Первый запуск: {licenseStatus?.firstLaunchDate || '—'}</span>
              </div>
              <div className="flex items-center space-x-1.5 truncate">
                <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span>Привязка: Machine ID (HWID)</span>
              </div>
            </div>

            {/* Machine ID Box with 1-Click Copy */}
            <div className="p-2.5 rounded-lg border border-primary/25 bg-primary/5 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5 text-[10px] uppercase font-semibold text-primary tracking-wider">
                  <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t('license.machineIdLabel')}</span>
                </div>
                <div
                  className="font-mono text-xs text-foreground mt-0.5 truncate select-all font-semibold"
                  title={licenseStatus?.machineId}
                >
                  {licenseStatus?.machineId || 'Определение оборудования...'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (licenseStatus?.machineId) {
                    navigator.clipboard.writeText(licenseStatus.machineId);
                    setCopiedHwid(true);
                    setTimeout(() => setCopiedHwid(false), 2000);
                  }
                }}
                disabled={!licenseStatus?.machineId}
                className="px-2.5 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[11px] font-medium transition-colors flex items-center space-x-1.5 flex-shrink-0"
                title={t('license.copyHwid')}
              >
                {copiedHwid ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Скопировано!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{t('license.copyHwid')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Pro Features Breakdown Cards */}
          <div className="space-y-2.5">
            <div className="flex items-start space-x-3 p-2.5 rounded-lg border border-border bg-plane-surface hover:bg-muted/30 transition-colors">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary mt-0.5 flex-shrink-0">
                <FileEdit className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">
                  Двустороннее прозрачное редактирование (Edit-in-Place)
                </h4>
                <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                  Файл открывается в локальном приложении (Word, Excel, Photoshop) и автоматически
                  синхронизируется в S3-бакет при нажатии Ctrl+S.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-2.5 rounded-lg border border-border bg-plane-surface hover:bg-muted/30 transition-colors">
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 mt-0.5 flex-shrink-0">
                <FileCode className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">
                  Встроенный редактор кода Monaco (VS Code)
                </h4>
                <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                  Полноценное редактирование текстовых файлов, кода, JSON, YAML и скриптов прямо в хранилище
                  с подсветкой синтаксиса и быстрым сохранением по Ctrl+S.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-2.5 rounded-lg border border-border bg-plane-surface hover:bg-muted/30 transition-colors">
              <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400 mt-0.5 flex-shrink-0">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">
                  Управление кластером MinIO & IAM Политики
                </h4>
                <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                  Мониторинг накопителей и метрик серверов, создание пользователей, групп и
                  редактирование JSON-политик без использования терминала и mc.exe.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-2.5 rounded-lg border border-border bg-plane-surface hover:bg-muted/30 transition-colors">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 mt-0.5 flex-shrink-0">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-medium text-foreground">Неограниченное число серверов</h4>
                <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                  В Community Edition поддерживается до 3 серверов. В Pro ограничение снято:
                  подключайте произвольное количество MinIO, Ceph, AWS S3 и Yandex Cloud.
                </p>
              </div>
            </div>
          </div>

          {/* License Key Activation Form */}
          <div className="p-4 rounded-xl border border-border bg-background space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-amber-400" />
                <h4 className="font-semibold text-foreground">Активация лицензии</h4>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                HWID-привязка
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t('license.hwidHint')}
            </p>

            {isPro && !isTrial && licenseStatus?.licenseKey && (
              <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center space-x-2">
                <Check className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                <span className="font-mono">{t('license.activeKey', { key: licenseStatus.licenseKey })}</span>
              </div>
            )}

            <form onSubmit={handleActivate} className="flex space-x-2">
              <input
                type="text"
                placeholder="PRO-XXXX-XXXX-XXXX-XXXX-XXXX"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                className="flex-1 bg-plane-surface border border-border rounded-lg px-3 py-1.5 font-mono text-xs text-foreground uppercase placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={activationLoading || !licenseKeyInput.trim()}
                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-medium text-xs shadow-xs transition-colors whitespace-nowrap flex items-center space-x-1.5"
              >
                {activationLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{activationLoading ? t('license.activating') : t('license.activate')}</span>
              </button>
            </form>

            {activationResult && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-center space-x-2 ${
                  activationResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                {activationResult.success ? (
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span>{activationResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-background border-t border-border flex items-center justify-end text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors border border-border"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ProTrialModal;