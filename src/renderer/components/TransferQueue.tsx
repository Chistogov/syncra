import React, { useState, useMemo, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowDownUp,
  Play,
  Square,
  XCircle,
  Trash2,
  Layers,
  Search,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sigma,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { TransferProgress } from '../../common/types';
import { useTranslation } from '../context/LanguageContext';
import { formatBytes, formatSpeed, formatDuration } from '../utils/formatters';

interface TransferQueueProps {
  transfers: TransferProgress[];
  discoveryState?: {
    isActive: boolean;
    currentFolder: string;
    discoveredCount: number;
    discoveredBytes: number;
  };
  transferConcurrency: number;
  onChangeConcurrency: (threads: number) => void;
  onClearCompleted: () => void;
  onCancelTransfer: (id: string) => void;
  onCancelAll?: () => void;
  onStartAll?: () => void;
  onRestartAll?: () => void;
  onResumeTransfer?: (id: string) => void;
  onGoToStorage: () => void;
}

type FilterType = 'all' | 'running' | 'queued' | 'stopped' | 'failed' | 'completed';

export const TransferQueue: React.FC<TransferQueueProps> = ({
  transfers,
  discoveryState,
  transferConcurrency,
  onChangeConcurrency,
  onClearCompleted,
  onCancelTransfer,
  onCancelAll,
  onStartAll,
  onRestartAll,
  onResumeTransfer,
  onGoToStorage,
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  // Single-pass calculation for all status counts and aggregate metrics
  const {
    runningCount,
    queuedCount,
    stoppedCount,
    failedCount,
    completedCount,
    totalAllBytes,
    totalTransferredBytes,
    overallPercentage,
    aggregateSpeed,
    etaSeconds,
  } = useMemo(() => {
    let running = 0;
    let queued = 0;
    let stopped = 0;
    let failed = 0;
    let completed = 0;
    let totalBytes = 0;
    let transferredBytes = 0;
    let totalSpeedBytes = 0;

    for (let i = 0; i < transfers.length; i++) {
      const item = transfers[i];
      const st = item.status;
      if (st === 'in_progress') running++;
      else if (st === 'queued' || st === 'pending') queued++;
      else if (st === 'cancelled') stopped++;
      else if (st === 'error') failed++;
      else if (st === 'completed') completed++;

      const itemTotal = item.totalBytes || 0;
      let itemTransferred = 0;
      if (st === 'completed') {
        itemTransferred = itemTotal > 0 ? itemTotal : (item.transferredBytes || 0);
      } else if (st === 'in_progress') {
        itemTransferred = Math.min(itemTotal > 0 ? itemTotal : Infinity, item.transferredBytes || 0);
      } else {
        // Queued, pending, cancelled, or error tasks have transferred 0 bytes in current run
        itemTransferred = 0;
      }

      totalBytes += itemTotal;
      transferredBytes += itemTransferred;

      if (st === 'in_progress' && item.speedBytesPerSec) {
        totalSpeedBytes += item.speedBytesPerSec;
      }
    }

    let percentage = 0;
    if (completed === transfers.length && transfers.length > 0) {
      percentage = 100;
    } else if (completed === 0 && running === 0) {
      percentage = 0;
    } else if (totalBytes > 0) {
      percentage = Math.min(99.99, (transferredBytes / totalBytes) * 100);
    } else if (transfers.length > 0) {
      percentage = (completed / transfers.length) * 100;
    }

    let eta = 0;
    if (totalSpeedBytes > 0 && totalBytes > transferredBytes) {
      eta = Math.round((totalBytes - transferredBytes) / totalSpeedBytes);
    }

    return {
      runningCount: running,
      queuedCount: queued,
      stoppedCount: stopped,
      failedCount: failed,
      completedCount: completed,
      totalAllBytes: totalBytes,
      totalTransferredBytes: transferredBytes,
      overallPercentage: percentage,
      aggregateSpeed: totalSpeedBytes,
      etaSeconds: eta,
    };
  }, [transfers]);

  // Filtered List
  const filteredTransfers = useMemo(() => {
    return transfers.filter((item) => {
      if (filter === 'running' && item.status !== 'in_progress') return false;
      if (filter === 'queued' && item.status !== 'queued' && item.status !== 'pending') return false;
      if (filter === 'stopped' && item.status !== 'cancelled') return false;
      if (filter === 'failed' && item.status !== 'error') return false;
      if (filter === 'completed' && item.status !== 'completed') return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesKey = item.key.toLowerCase().includes(query);
        const matchesPath = (item.localPath || '').toLowerCase().includes(query);
        const matchesBucket = item.bucket.toLowerCase().includes(query);
        if (!matchesKey && !matchesPath && !matchesBucket) return false;
      }

      return true;
    });
  }, [transfers, filter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredTransfers.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTransfers = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return filteredTransfers.slice(start, start + itemsPerPage);
  }, [filteredTransfers, safeCurrentPage, itemsPerPage]);

  return (
    <div className="flex-1 flex flex-col h-full bg-plane-bg overflow-hidden text-foreground select-none font-sans">
      {/* 1. Header Toolbar */}
      <div className="min-h-[56px] md:min-h-[72px] px-3 md:px-6 py-2.5 md:py-4.5 border-b border-border bg-plane-surface/80 flex items-center justify-between flex-shrink-0">
        {!isMobileSearchOpen ? (
          <>
            <div className="flex items-center space-x-2.5 md:space-x-3.5 min-w-0">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs flex-shrink-0">
                <ArrowDownUp className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center space-x-2 md:space-x-3 h-6">
                  <h2 className="text-sm md:text-base font-semibold text-foreground tracking-tight whitespace-nowrap truncate">
                    {t('transfers.title')}
                  </h2>
                  {runningCount > 0 && (
                    <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[10px] md:text-[11px] font-mono font-medium items-center space-x-1.5 flex-shrink-0 h-5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{t('transfers.activeThreads', { running: runningCount, total: transferConcurrency })}</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] md:text-[12px] text-muted-foreground font-mono mt-0.5 h-4 flex items-center whitespace-nowrap truncate">
                  {t('transfers.headerStats', {
                    total: transfers.length.toLocaleString(),
                    completed: completedCount.toLocaleString(),
                    queued: queuedCount.toLocaleString(),
                  })}
                </p>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center space-x-1.5 md:space-x-2 flex-shrink-0">
              {/* Mobile Search Icon Button (collapsed on mobile) */}
              <button
                onClick={() => {
                  setIsMobileSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="sm:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg transition-colors flex-shrink-0"
                title={t('transfers.searchTooltip')}
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Desktop Search Box in Header (visible on sm and up) */}
              <div className="hidden sm:block relative w-40 md:w-56 mr-1">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder={t('transfers.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-plane-surface border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring/50 select-text transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Top toolbar Restart All button */}
              {completedCount > 0 && runningCount === 0 && queuedCount === 0 && onRestartAll && (
                <button
                  onClick={onRestartAll}
                  className="flex items-center space-x-1.5 px-2.5 md:px-3 py-1.5 text-xs text-primary hover:bg-primary/10 border border-primary/25 rounded-md transition-colors font-medium shadow-xs whitespace-nowrap flex-shrink-0"
                  title={t('transfers.restartAllTooltip')}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{t('transfers.restartAll')}</span>
                </button>
              )}

              {completedCount > 0 && (
                <button
                  onClick={onClearCompleted}
                  className="flex items-center space-x-1.5 px-2.5 md:px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-plane-surface hover:bg-muted border border-border rounded-md transition-colors font-medium shadow-xs whitespace-nowrap flex-shrink-0"
                  title={t('transfers.clearCompletedTooltip')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('transfers.clear')}</span>
                </button>
              )}

              {(stoppedCount > 0 || failedCount > 0) && onStartAll && (
                <button
                  onClick={onStartAll}
                  className="flex items-center space-x-1.5 px-2.5 md:px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-md transition-colors font-medium shadow-xs whitespace-nowrap flex-shrink-0"
                  title={t('transfers.resumeStoppedTooltip')}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden md:inline">{t('transfers.resume')}</span>
                </button>
              )}

              {(runningCount > 0 || queuedCount > 0) && onCancelAll && (
                <button
                  onClick={onCancelAll}
                  className="flex items-center space-x-1.5 px-2.5 md:px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-md transition-colors font-medium shadow-xs whitespace-nowrap flex-shrink-0"
                  title={t('transfers.cancelAllTooltip')}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{t('transfers.cancelAll')}</span>
                </button>
              )}
            </div>
          </>
        ) : (
          /* Mobile Search Bar: Hides header title and spans across the entire top bar */
          <div className="flex-1 flex items-center space-x-2 animate-in fade-in duration-150">
            <div className="relative flex-1 flex items-center">
              <Search className="w-4 h-4 text-primary absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('transfers.searchPlaceholderFull')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (searchQuery) {
                      setSearchQuery('');
                    } else {
                      setIsMobileSearchOpen(false);
                    }
                  }
                }}
                className="w-full bg-background border border-primary/50 focus:border-primary rounded-lg pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-1 text-muted-foreground hover:text-foreground"
                  title={t('transfers.clear')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setIsMobileSearchOpen(false);
              }}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors whitespace-nowrap"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>

      {/* 2. Real-Time Discovery / Folder Scanning Banner (Live feedback during preparation) */}
      {discoveryState?.isActive && (
        <div className="bg-primary/10 border-b border-primary/25 px-6 py-3.5 flex items-center justify-between flex-shrink-0 animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-3 text-xs">
            <RefreshCw className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
            <div>
              <span className="font-semibold text-foreground">
                {t('transfers.discoveryTitle', { folder: discoveryState.currentFolder })}
              </span>
              <span className="text-muted-foreground ml-2 font-mono text-[11px]">
                {t('transfers.discoveryStats', {
                  count: discoveryState.discoveredCount.toLocaleString(),
                  bytes: formatBytes(discoveryState.discoveredBytes),
                })}
              </span>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded flex-shrink-0">
            {t('transfers.indexing')}
          </span>
        </div>
      )}

      {/* 3. Top Progress & Telemetry Banner */}
      <div className="bg-plane-surface border-b border-border px-6 py-5 shadow-2xs flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center justify-between text-xs min-h-[26px]">
              <div className="flex items-center space-x-2.5">
                <Activity className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="font-medium text-foreground whitespace-nowrap">
                  {runningCount > 0
                    ? t('transfers.transferringActive', { running: runningCount, total: transferConcurrency })
                    : discoveryState?.isActive
                    ? t('transfers.scanningPreparing')
                    : transfers.length > 0 && failedCount === 0 && stoppedCount === 0
                    ? t('transfers.allCompleted')
                    : transfers.length === 0
                    ? t('transfers.queueIdle')
                    : t('transfers.paused')}
                </span>
                {aggregateSpeed > 0 && (
                  <span className="font-mono text-emerald-400 font-semibold text-[11px] bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20 tabular-nums">
                    {formatSpeed(aggregateSpeed)}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4 font-mono text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                <span>
                  <strong className="text-foreground">{formatBytes(totalTransferredBytes)}</strong> {t('transfers.of')}{' '}
                  {formatBytes(totalAllBytes)}
                </span>
                {etaSeconds > 0 && (
                  <span>
                    {t('transfers.etaRemaining', { time: formatDuration(etaSeconds) })}
                  </span>
                )}
                <span className="text-xs font-bold text-foreground min-w-[55px] text-right">
                  {overallPercentage.toFixed(2)} %
                </span>
              </div>
            </div>

            {/* Overall Smooth Progress Bar */}
            <div className="w-full bg-muted/60 h-2.5 rounded-full overflow-hidden border border-border/40 mt-1">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  runningCount > 0
                    ? 'bg-emerald-500'
                    : failedCount > 0
                    ? 'bg-destructive'
                    : stoppedCount > 0
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${overallPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Main Detailed Table View (matching S3 Browser columns) */}
      <div className="flex-1 overflow-auto bg-plane-surface flex flex-col">
        {filteredTransfers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground space-y-3">
            <div className="w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center text-muted-foreground">
              {discoveryState?.isActive ? (
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
              ) : (
                <ArrowDownUp className="w-6 h-6" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {discoveryState?.isActive
                  ? t('transfers.scanningFolder')
                  : transfers.length === 0
                  ? t('transfers.emptyQueue')
                  : t('transfers.noTasksInCategory')}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {discoveryState?.isActive
                  ? t('transfers.scanningDesc')
                  : transfers.length === 0
                  ? t('transfers.emptyQueueHint')
                  : t('transfers.filterHint')}
              </p>
            </div>
            {transfers.length === 0 && !discoveryState?.isActive && (
              <button
                onClick={onGoToStorage}
                className="mt-2 flex items-center space-x-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium rounded-md transition-colors shadow-xs whitespace-nowrap flex-shrink-0"
                title={t('transfers.toBucketsTooltip')}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('transfers.toBuckets')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-[11px] font-mono table-fixed">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-xs border-b border-border shadow-2xs font-sans text-[11px] text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2 px-3 text-left w-auto">{t('transfers.colTask')}</th>
                  <th className="py-2 px-3 text-right w-24">{t('transfers.colSize')}</th>
                  <th className="py-2 px-3 text-right w-20">%</th>
                  <th className="py-2 px-3 text-center w-28">{t('transfers.colProgress')}</th>
                  <th className="py-2 px-3 text-left w-24">{t('transfers.colStatus')}</th>
                  <th className="py-2 px-3 text-right w-28">{t('transfers.colSpeed')}</th>
                  <th className="py-2 px-3 text-center w-14"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 select-text">
                {paginatedTransfers.map((item) => {
                  const isDownload = item.type === 'download';
                  const isRunning = item.status === 'in_progress';
                  const isQueued = item.status === 'queued' || item.status === 'pending';
                  const isCompleted = item.status === 'completed';
                  const isFailed = item.status === 'error';
                  const isStopped = item.status === 'cancelled';

                  // Build S3 Browser full task description string
                  const bytesString =
                    item.totalBytes !== undefined && item.totalBytes !== null
                      ? `(${item.totalBytes.toLocaleString('en-US')} bytes)`
                      : '';
                  const taskText = isDownload
                    ? `Downloading ${item.key} ${bytesString} to ${item.localPath}`
                    : `Uploading ${item.localPath} ${bytesString} to s3://${item.bucket}/${item.key}`;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/50 transition-colors group ${
                        isRunning ? 'bg-primary/5' : ''
                      }`}
                    >
                      {/* 1. Task Column with Direction Icon */}
                      <td className="py-1.5 px-3 truncate font-mono text-[11px] text-foreground">
                        <div className="flex items-center space-x-1.5 truncate">
                          {isDownload ? (
                            <ArrowDown
                              className={`w-3.5 h-3.5 flex-shrink-0 ${
                                isRunning
                                  ? 'text-emerald-400 stroke-[2.5]'
                                  : isCompleted
                                  ? 'text-emerald-500'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          ) : (
                            <ArrowUp
                              className={`w-3.5 h-3.5 flex-shrink-0 ${
                                isRunning
                                  ? 'text-primary stroke-[2.5]'
                                  : isCompleted
                                  ? 'text-primary/70'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          )}
                          <span
                            className={`truncate select-text ${
                              isRunning ? 'text-foreground font-medium' : 'text-foreground/90'
                            }`}
                            title={taskText}
                          >
                            {taskText}
                          </span>
                        </div>
                      </td>

                      {/* 2. Size Column */}
                      <td className="py-1.5 px-3 text-right whitespace-nowrap text-muted-foreground">
                        <span className="text-foreground">
                          {formatBytes(item.totalBytes)}
                        </span>
                      </td>

                      {/* 3. % Column */}
                      <td className="py-1.5 px-3 text-right whitespace-nowrap">
                        {isQueued && item.progress === 0 ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              isCompleted
                                ? 'text-emerald-400'
                                : isRunning
                                ? 'text-foreground'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {item.progress.toFixed(2)} %
                          </span>
                        )}
                      </td>

                      {/* 4. Progress Column (Visual Green Bar matching S3 Browser) */}
                      <td className="py-1.5 px-3 text-center">
                        <div className="w-full h-3 bg-muted/60 border border-border/80 rounded-xs overflow-hidden relative inline-block align-middle">
                          <div
                            className={`h-full transition-all duration-150 ${
                              isCompleted
                                ? 'bg-emerald-500'
                                : isFailed
                                ? 'bg-destructive'
                                : isStopped
                                ? 'bg-muted-foreground/40'
                                : 'bg-emerald-600'
                            }`}
                            style={{
                              width: `${Math.min(100, Math.max(0, item.progress))}%`,
                            }}
                          />
                        </div>
                      </td>

                      {/* 5. Status Column */}
                      <td className="py-1.5 px-3 whitespace-nowrap font-sans text-[11px]">
                        {isRunning && (
                          <span className="text-emerald-400 font-medium inline-flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>{t('transfers.statusRunning')}</span>
                          </span>
                        )}
                        {isQueued && <span className="text-muted-foreground">{t('transfers.statusQueued')}</span>}
                        {isCompleted && (
                          <span className="text-emerald-400 font-medium inline-flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>{t('transfers.statusCompleted')}</span>
                          </span>
                        )}
                        {isStopped && <span className="text-muted-foreground">{t('transfers.statusStopped')}</span>}
                        {isFailed && (
                          <span
                            className="text-destructive font-medium inline-flex items-center space-x-1 cursor-help"
                            title={item.error || t('transfers.transferError')}
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>{t('transfers.statusFailed')}</span>
                          </span>
                        )}
                      </td>

                      {/* 6. Speed Column */}
                      <td className="py-1.5 px-3 text-right whitespace-nowrap font-mono text-[11px]">
                        {isRunning ? (
                          <span className="text-emerald-400 font-medium">
                            {item.speedBytesPerSec
                              ? formatSpeed(item.speedBytesPerSec)
                              : item.speed || '...'}
                          </span>
                        ) : isCompleted ? (
                          <span className="text-foreground/80 font-mono">
                            {item.speed && item.speed !== 'Завершено'
                              ? item.speed
                              : item.speedBytesPerSec
                              ? formatSpeed(item.speedBytesPerSec)
                              : '—'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* 7. Action Button */}
                      <td className="py-1.5 px-3 text-center whitespace-nowrap">
                        {isRunning || isQueued ? (
                          <button
                            onClick={() => onCancelTransfer(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                            title={t('transfers.stop')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : isStopped || isFailed ? (
                          onResumeTransfer ? (
                            <button
                              onClick={() => onResumeTransfer(item.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-all"
                              title={t('transfers.retry')}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ) : null
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Bottom S3 Browser Style Status & Action Bar */}
      <div className="min-h-[44px] px-3 sm:px-4 border-t border-border bg-plane-surface/90 flex items-center justify-between flex-shrink-0 text-xs shadow-xs overflow-x-auto gap-2">
        {/* Left Side: S3 Browser Filter Tabs & Telemetry */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 py-1 flex-shrink-0">
          {/* Running Tab */}
          <button
            onClick={() => {
              setFilter('running');
              setCurrentPage(1);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0 ${
              filter === 'running'
                ? 'bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('transfers.tabRunningTooltip', { count: runningCount })}
          >
            <Play className="w-3 h-3 fill-current text-emerald-400" />
            <span className="hidden sm:inline">{t('transfers.tabRunning')}</span>
            <span className="text-[11px] font-mono">({runningCount})</span>
          </button>

          {/* Queued Tab */}
          <button
            onClick={() => {
              setFilter('queued');
              setCurrentPage(1);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0 ${
              filter === 'queued'
                ? 'bg-primary/15 text-primary font-semibold border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('transfers.tabQueuedTooltip', { count: queuedCount.toLocaleString() })}
          >
            <Clock className="w-3 h-3 text-primary" />
            <span className="hidden sm:inline">{t('transfers.tabQueued')}</span>
            <span className="text-[11px] font-mono">({queuedCount.toLocaleString()})</span>
          </button>

          {/* Stopped Tab */}
          <button
            onClick={() => {
              setFilter('stopped');
              setCurrentPage(1);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0 ${
              filter === 'stopped'
                ? 'bg-muted text-foreground font-semibold border border-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('transfers.tabStoppedTooltip', { count: stoppedCount.toLocaleString() })}
          >
            <Square className="w-3 h-3 text-muted-foreground fill-current" />
            <span className="hidden sm:inline">{t('transfers.tabStopped')}</span>
            <span className="text-[11px] font-mono">({stoppedCount.toLocaleString()})</span>
          </button>

          {/* Failed Tab */}
          <button
            onClick={() => {
              setFilter('failed');
              setCurrentPage(1);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0 ${
              filter === 'failed'
                ? 'bg-destructive/15 text-destructive font-semibold border border-destructive/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('transfers.tabFailedTooltip', { count: failedCount.toLocaleString() })}
          >
            <AlertCircle className="w-3 h-3 text-destructive" />
            <span className="hidden sm:inline">{t('transfers.tabFailed')}</span>
            <span className="text-[11px] font-mono">({failedCount.toLocaleString()})</span>
          </button>

          {/* Completed Tab */}
          <button
            onClick={() => {
              setFilter('completed');
              setCurrentPage(1);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0 ${
              filter === 'completed'
                ? 'bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('transfers.tabCompletedTooltip', { count: completedCount.toLocaleString() })}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">{t('transfers.tabCompleted')}</span>
            <span className="text-[11px] font-mono">({completedCount.toLocaleString()})</span>
          </button>

          {/* All Tab */}
          <button
            onClick={() => {
              setFilter('all');
              setCurrentPage(1);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0 ${
              filter === 'all'
                ? 'bg-accent text-foreground font-semibold border border-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title={t('transfers.tabAllTooltip', { count: transfers.length.toLocaleString() })}
          >
            <Sigma className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">{t('transfers.tabAll')}</span>
            <span className="text-[11px] font-mono">({transfers.length.toLocaleString()})</span>
          </button>

          {/* Real-time Telemetry text divider & metrics */}
          <div className="hidden lg:block h-4 w-[1px] bg-border mx-1 flex-shrink-0" />

          <div className="hidden lg:flex items-center space-x-3 text-[11px] font-mono text-muted-foreground whitespace-nowrap flex-shrink-0">
            <span>
              Data: <strong className="text-foreground">{formatBytes(totalTransferredBytes)}</strong> /{' '}
              {formatBytes(totalAllBytes)}
            </span>
            <span>|</span>
            <span>
              Speed:{' '}
              <strong className={aggregateSpeed > 0 ? 'text-emerald-400 font-semibold' : 'text-foreground'}>
                {formatSpeed(aggregateSpeed)}
              </strong>
            </span>
            <span>|</span>
            <span>
              Time: <strong className="text-foreground">{formatDuration(etaSeconds)}</strong>
            </span>
          </div>
        </div>

        {/* Right Side: Pagination & Action Buttons */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono mr-1 border-r border-border pr-2 whitespace-nowrap flex-shrink-0">
              <span className="hidden sm:inline">
                {safeCurrentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
                className="p-1 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-muted"
                title={t('transfers.firstPage')}
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-muted"
                title={t('transfers.prevPage')}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-muted"
                title={t('transfers.nextPage')}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
                className="p-1 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none rounded hover:bg-muted"
                title={t('transfers.lastPage')}
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* S3 Browser Action Buttons */}
          {(stoppedCount > 0 || failedCount > 0) && onStartAll && (
            <button
              onClick={onStartAll}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 rounded font-medium transition-colors whitespace-nowrap flex-shrink-0"
              title={t('transfers.startAllTooltip')}
            >
              <Play className="w-3 h-3 fill-current" />
              <span className="hidden md:inline">{t('transfers.startAll')}</span>
            </button>
          )}

          {(runningCount > 0 || queuedCount > 0) && onCancelAll && (
            <button
              onClick={onCancelAll}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 border border-destructive/20 rounded font-medium transition-colors whitespace-nowrap flex-shrink-0"
              title={t('transfers.stopAllTooltip')}
            >
              <Square className="w-3 h-3 fill-current" />
              <span className="hidden md:inline">{t('transfers.stopAll')}</span>
            </button>
          )}

          {/* Top toolbar Restart All button */}
          {completedCount > 0 && runningCount === 0 && queuedCount === 0 && onRestartAll && (
            <button
              onClick={onRestartAll}
              className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10 border border-primary/25 rounded font-medium transition-colors shadow-xs whitespace-nowrap flex-shrink-0"
              title={t('transfers.restartAllTooltip')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('transfers.restartAll')}</span>
            </button>
          )}

          {completedCount > 0 && (
            <button
              onClick={onClearCompleted}
              className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted border border-border rounded font-medium transition-colors whitespace-nowrap flex-shrink-0"
              title={t('transfers.clearCompletedTooltip')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('transfers.clear')}</span>
            </button>
          )}

          <button
            onClick={onGoToStorage}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-foreground bg-accent hover:bg-accent/80 border border-border rounded font-medium transition-colors whitespace-nowrap flex-shrink-0"
            title={t('transfers.toBucketsTooltip')}
          >
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">{t('transfers.toBuckets')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferQueue;
