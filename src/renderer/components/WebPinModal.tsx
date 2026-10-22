import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Lock, Delete, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import syncraLogo from '../assets/logo.png';

interface WebPinModalProps {
  onAuthenticated: (token: string, allowedUrls?: string[]) => void;
}

export const WebPinModal: React.FC<WebPinModalProps> = ({ onAuthenticated }) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const handleSubmitPin = useCallback(
    async (pinToVerify: string) => {
      if (loading || pinToVerify.length !== 6) return;
      setLoading(true);
      setError(null);

      try {
        const res = await (window as any).electronAPI.webAuth.verifyPin(pinToVerify);
        if (res.success && res.token) {
          setIsSuccess(true);
          setTimeout(() => {
            onAuthenticated(res.token, res.allowedUrls);
          }, 400);
        } else {
          throw new Error(res.error || t('webPin.error'));
        }
      } catch (err: any) {
        setIsShaking(true);
        setError(err.message || t('webPin.error'));
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch {}
        }
        setTimeout(() => {
          setPin('');
          setIsShaking(false);
        }, 650);
      } finally {
        setLoading(false);
      }
    },
    [loading, onAuthenticated]
  );

  const handleDigitPress = (digit: string) => {
    if (loading || isSuccess) return;
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === 6) {
        handleSubmitPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (loading || isSuccess) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  // Keyboard support for desktop / laptop browser users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || isSuccess) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPin('');
        setError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, loading, isSuccess]);

  const keypadRows = [
    [
      { digit: '1', letters: '' },
      { digit: '2', letters: 'ABC' },
      { digit: '3', letters: 'DEF' },
    ],
    [
      { digit: '4', letters: 'GHI' },
      { digit: '5', letters: 'JKL' },
      { digit: '6', letters: 'MNO' },
    ],
    [
      { digit: '7', letters: 'PQRS' },
      { digit: '8', letters: 'TUV' },
      { digit: '9', letters: 'WXYZ' },
    ],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in text-foreground select-none">
      {/* Mobile-style Glassmorphic Passcode Viewport */}
      <div className="w-full max-w-sm bg-plane-surface/90 border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center relative overflow-hidden backdrop-blur-xl">
        {/* Ambient Top Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header & App Icon */}
        <div className="flex flex-col items-center text-center relative z-10">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-primary/15 mb-3 transition-transform duration-300 hover:scale-105 border border-border/60 bg-background p-1 flex items-center justify-center">
            {isSuccess ? (
              <CheckCircle2 className="w-9 h-9 text-emerald-400 animate-scale-up" />
            ) : (
              <img src={syncraLogo} alt="Syncra" className="w-full h-full object-cover rounded-xl" />
            )}
          </div>

          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            {t('webPin.title')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isSuccess
              ? t('webPin.accessGranted')
              : t('webPin.subtitle')}
          </p>
        </div>

        {/* 6 Circular Passcode Indicator Dots (Banking App Style) */}
        <div
          className={`flex items-center space-x-3.5 my-7 relative z-10 transition-transform duration-200 ${
            isShaking ? 'animate-shake' : ''
          }`}
        >
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                  isSuccess
                    ? 'bg-emerald-500 border-2 border-emerald-500 scale-125 shadow-md shadow-emerald-500/50'
                    : error
                    ? 'bg-destructive border-2 border-destructive scale-110 shadow-sm shadow-destructive'
                    : isFilled
                    ? 'bg-primary border-2 border-primary scale-125 shadow-lg shadow-primary/60'
                    : 'bg-transparent border-2 border-muted-foreground/30'
                }`}
              />
            );
          })}
        </div>

        {/* Error / Loading Feedback Line */}
        <div className="h-6 flex items-center justify-center text-center mb-1 relative z-10">
          {loading ? (
            <div className="flex items-center space-x-1.5 text-xs text-primary animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('webPin.verifyingCode')}</span>
            </div>
          ) : error ? (
            <div className="flex items-center space-x-1 text-xs text-destructive font-medium animate-fade-in">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        {/* Numeric Touch Keypad */}
        <div className="w-full max-w-[270px] grid grid-cols-3 gap-3.5 my-3 relative z-10">
          {keypadRows.map((row, rowIdx) =>
            row.map((item) => (
              <button
                key={item.digit}
                type="button"
                onClick={() => handleDigitPress(item.digit)}
                disabled={loading || isSuccess}
                className="w-16 h-16 sm:w-18 sm:h-18 mx-auto rounded-full flex flex-col items-center justify-center bg-muted/40 hover:bg-muted/80 active:scale-95 border border-border/50 text-foreground transition-all duration-150 shadow-xs cursor-pointer select-none group"
              >
                <span className="text-xl sm:text-2xl font-semibold leading-none group-active:text-primary">
                  {item.digit}
                </span>
                {item.letters && (
                  <span className="text-[9px] font-mono tracking-wider text-muted-foreground/70 uppercase mt-0.5 leading-none">
                    {item.letters}
                  </span>
                )}
              </button>
            ))
          )}

          {/* Bottom Row: [Biometric/Empty] [0] [Backspace] */}
          <div className="w-16 h-16 sm:w-18 sm:h-18 mx-auto flex items-center justify-center text-muted-foreground/40">
            <Lock className="w-5 h-5 opacity-40" />
          </div>

          <button
            type="button"
            onClick={() => handleDigitPress('0')}
            disabled={loading || isSuccess}
            className="w-16 h-16 sm:w-18 sm:h-18 mx-auto rounded-full flex flex-col items-center justify-center bg-muted/40 hover:bg-muted/80 active:scale-95 border border-border/50 text-foreground transition-all duration-150 shadow-xs cursor-pointer select-none group"
          >
            <span className="text-xl sm:text-2xl font-semibold leading-none group-active:text-primary">
              0
            </span>
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            disabled={loading || isSuccess || pin.length === 0}
            className="w-16 h-16 sm:w-18 sm:h-18 mx-auto rounded-full flex items-center justify-center bg-transparent hover:bg-muted/40 active:scale-95 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-all duration-150 cursor-pointer select-none"
            title={t('webPin.deleteTooltip')}
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Footer Security Notice */}
        <div className="mt-4 pt-3 border-t border-border/50 text-center w-full relative z-10">
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            {t('webPin.footerNotice')}
          </p>
        </div>
      </div>
    </div>
  );
};
