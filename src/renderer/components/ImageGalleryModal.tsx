import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  X,
  Images,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { S3Item, S3Profile } from '../../common/types';
import { formatBytes, formatDate } from '../utils/formatters';
import { useTranslation } from '../context/LanguageContext';

export const isImageFile = (ext?: string): boolean => {
  if (!ext) return false;
  const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico', 'tiff'];
  return imageExts.includes(ext.toLowerCase().replace('.', ''));
};

export interface ImageGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: S3Item[];
  initialItem: S3Item | null;
  profile: S3Profile | null;
  bucket: string;
  onDownload?: (item: S3Item) => void;
}

interface GalleryThumbnailItemProps {
  item: S3Item;
  profile: S3Profile | null;
  bucket: string;
  isCurrent: boolean;
  cachedUrl?: string;
  onClick: () => void;
}

const GalleryThumbnailItem: React.FC<GalleryThumbnailItemProps> = ({
  item,
  profile,
  bucket,
  isCurrent,
  cachedUrl,
  onClick,
}) => {
  const [thumb, setThumb] = useState<string | null>(cachedUrl || null);

  useEffect(() => {
    if (cachedUrl) {
      setThumb(cachedUrl);
      return;
    }
    let isMounted = true;
    if (profile && bucket) {
      window.electronAPI?.s3
        ?.getThumbnail(profile, bucket, item.key)
        .then((t) => {
          if (isMounted && t) setThumb(t);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [item.key, bucket, profile, cachedUrl]);

  return (
    <button
      onClick={onClick}
      className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 transition-all flex items-center justify-center bg-white/5 border ${
        isCurrent
          ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-black scale-105 opacity-100'
          : 'border-white/15 opacity-50 hover:opacity-90 hover:border-white/40'
      }`}
      title={item.name}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={item.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-[10px] text-white/50 font-mono truncate px-1">
          {item.name.slice(0, 4)}
        </span>
      )}
    </button>
  );
};

export const ImageGalleryModal: React.FC<ImageGalleryModalProps> = ({
  isOpen,
  onClose,
  items,
  initialItem,
  profile,
  bucket,
  onDownload,
}) => {
  const { t } = useTranslation();
  // Filter all image items in the current folder
  const imageItems = useMemo(() => {
    return items.filter((item) => !item.isPrefix && isImageFile(item.extension || item.name.split('.').pop()));
  }, [items]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // URL Cache for images
  const [urlCache, setUrlCache] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const thumbnailStripRef = useRef<HTMLDivElement>(null);

  // Set initial image when modal opens
  useEffect(() => {
    if (isOpen && initialItem) {
      const idx = imageItems.findIndex((i) => i.key === initialItem.key);
      if (idx !== -1) {
        setCurrentIndex(idx);
      } else {
        setCurrentIndex(0);
      }
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen, initialItem, imageItems]);

  const currentItem = imageItems[currentIndex] || null;

  // Load current image URL and prefetch adjacent images
  useEffect(() => {
    if (!isOpen || !currentItem || !profile) return;

    let isMounted = true;

    const loadCurrentUrl = async () => {
      if (urlCache[currentItem.key]) {
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const preview = await window.electronAPI.s3.getPreview(profile, bucket, currentItem.key);
        if (!isMounted) return;

        if (preview?.url) {
          const url = preview.url;
          setUrlCache((prev) => ({ ...prev, [currentItem.key]: url }));
          setLoading(false);
        } else {
          setError('Не удалось получить адрес изображения');
          setLoading(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Failed to load image preview:', err);
        setError(err.message || 'Ошибка загрузки изображения');
        setLoading(false);
      }
    };

    loadCurrentUrl();

    // Prefetch next and previous images for instant navigation
    if (imageItems.length > 1) {
      const nextIdx = (currentIndex + 1) % imageItems.length;
      const prevIdx = (currentIndex - 1 + imageItems.length) % imageItems.length;

      const prefetchItem = async (idx: number) => {
        const item = imageItems[idx];
        if (!item || urlCache[item.key]) return;
        try {
          const p = await window.electronAPI.s3.getPreview(profile, bucket, item.key);
          if (p?.url) {
            const url = p.url;
            setUrlCache((prev) => ({ ...prev, [item.key]: url }));
            const img = new Image();
            img.src = url;
          }
        } catch (_) {}
      };

      prefetchItem(nextIdx);
      prefetchItem(prevIdx);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentIndex, currentItem, profile, bucket, imageItems]);

  // Reset zoom & pan on index change
  const handleNext = useCallback(() => {
    if (imageItems.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % imageItems.length);
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, [imageItems.length]);

  const handlePrev = useCallback(() => {
    if (imageItems.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + imageItems.length) % imageItems.length);
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, [imageItems.length]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    if (!thumbnailStripRef.current) return;
    const activeThumb = thumbnailStripRef.current.children[currentIndex] as HTMLElement;
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex]);

  // Keyboard navigation & zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(z + 0.25, 4));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(z - 0.25, 0.5));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
        setRotation(0);
        setPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  // Touch Swipe detection
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom > 1) return; // Allow pan when zoomed
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || zoom > 1) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Horizontal swipe threshold: 45px, horizontal > vertical
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        handleNext(); // Swiped left -> next
      } else {
        handlePrev(); // Swiped right -> prev
      }
    }
    touchStartRef.current = null;
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(z + 0.2, 4));
    } else {
      setZoom((z) => {
        const next = Math.max(z - 0.2, 0.5);
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    }
  };

  // Mouse pan when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!isOpen || !currentItem) return null;

  const currentUrl = urlCache[currentItem.key];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between text-white select-none animate-in fade-in duration-200 overflow-hidden"
      onMouseUp={handleMouseUp}
    >
      {/* Top Header Bar */}
      <div className="h-14 px-4 sm:px-6 bg-black/50 border-b border-white/10 flex items-center justify-between z-30 flex-shrink-0">
        {/* Left: Info */}
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-primary flex-shrink-0">
            <Images className="w-4 h-4 text-primary" />
          </div>
          <div className="truncate">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-xs sm:text-sm text-white truncate max-w-[180px] sm:max-w-md" title={currentItem.name}>
                {currentItem.name}
              </h3>
              {imageItems.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px] font-mono font-medium text-white/90 flex-shrink-0">
                  {t('gallery.of', { current: currentIndex + 1, total: imageItems.length })}
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/50 font-mono truncate">
              {formatBytes(currentItem.size)} • {formatDate(currentItem.lastModified)}
            </p>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
          {/* Zoom Out */}
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
            disabled={zoom <= 0.5}
            className="p-1.5 sm:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={t('gallery.zoomOut')}
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Zoom Reset */}
          <button
            onClick={() => {
              setZoom(1);
              setRotation(0);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2 py-1 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={t('gallery.zoomReset')}
          >
            {Math.round(zoom * 100)}%
          </button>

          {/* Zoom In */}
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
            disabled={zoom >= 4}
            className="p-1.5 sm:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={t('gallery.zoomIn')}
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Rotate */}
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 sm:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={t('gallery.rotate')}
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Download */}
          {onDownload && (
            <button
              onClick={() => onDownload(currentItem)}
              className="p-1.5 sm:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title={t('gallery.download')}
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1"
            title={t('gallery.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden p-2 sm:p-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        {/* Previous Button (Left Arrow) */}
        {imageItems.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-2 sm:left-6 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl backdrop-blur-sm"
            title={t('gallery.prev')}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Next Button (Right Arrow) */}
        {imageItems.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-2 sm:right-6 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl backdrop-blur-sm"
            title={t('gallery.next')}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Image Display */}
        {loading && !currentUrl ? (
          <div className="flex flex-col items-center justify-center space-y-3 text-white/70">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs font-mono">{t('gallery.loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center p-6 bg-red-950/40 border border-red-500/30 rounded-xl max-w-md">
            <p className="text-sm font-medium text-red-400 mb-1">{t('gallery.error')}</p>
            <p className="text-xs text-white/70">{error}</p>
          </div>
        ) : (
          <div
            className={`max-w-full max-h-full flex items-center justify-center transition-transform ${
              isDragging ? 'cursor-grabbing duration-0' : zoom > 1 ? 'cursor-grab duration-150' : 'cursor-default duration-200'
            }`}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            }}
            onDoubleClick={() => {
              if (zoom === 1) {
                setZoom(2);
              } else {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }
            }}
          >
            <img
              src={currentUrl}
              alt={currentItem.name}
              className="max-h-[75vh] max-w-[90vw] object-contain rounded shadow-2xl pointer-events-none"
              draggable={false}
            />
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Strip (Gallery Filmstrip) */}
      {imageItems.length > 1 && (
        <div className="h-20 px-4 bg-black/60 border-t border-white/10 flex items-center justify-center z-30 flex-shrink-0">
          <div
            ref={thumbnailStripRef}
            className="flex items-center space-x-2.5 overflow-x-auto max-w-5xl py-2 px-4 no-scrollbar"
          >
            {imageItems.map((item, idx) => (
              <GalleryThumbnailItem
                key={item.key}
                item={item}
                profile={profile}
                bucket={bucket}
                isCurrent={idx === currentIndex}
                cachedUrl={urlCache[item.key]}
                onClick={() => {
                  setCurrentIndex(idx);
                  setZoom(1);
                  setRotation(0);
                  setPan({ x: 0, y: 0 });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
