import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  X,
  Save,
  Check,
  FileCode,
  Loader2,
  AlertCircle,
  Sparkles,
  Maximize2,
  Minimize2,
  Lock,
} from 'lucide-react';
import { S3Profile, S3Item } from '../../common/types';
import { useConfirm } from '../context/ConfirmContext';
import { useTranslation } from '../context/LanguageContext';

interface MonacoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: S3Item | null;
  profile: S3Profile | null;
  bucket: string;
  theme: 'dark' | 'light';
  onFileSaved?: () => void;
  isProActive?: boolean;
  onOpenProModal?: () => void;
}

const getLanguageFromExtension = (ext?: string): string => {
  if (!ext) return 'plaintext';
  const clean = ext.toLowerCase().replace('.', '');
  switch (clean) {
    case 'json':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'html':
      return 'html';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'sql':
      return 'sql';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'xml':
    case 'svg':
      return 'xml';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'env':
    case 'ini':
    case 'conf':
    case 'config':
      return 'ini';
    case 'dockerfile':
      return 'dockerfile';
    case 'rust':
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
      return 'cpp';
    case 'cs':
      return 'csharp';
    default:
      return 'plaintext';
  }
};

const SUPPORTED_LANGUAGES = [
  'json',
  'yaml',
  'javascript',
  'typescript',
  'python',
  'html',
  'css',
  'sql',
  'shell',
  'xml',
  'markdown',
  'ini',
  'dockerfile',
  'rust',
  'go',
  'plaintext',
];

export const MonacoEditorModal: React.FC<MonacoEditorModalProps> = ({
  isOpen,
  onClose,
  item,
  profile,
  bucket,
  theme,
  onFileSaved,
  isProActive = true,
  onOpenProModal,
}) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [content, setContent] = useState<string>('');
  const [initialContent, setInitialContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('plaintext');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isMaximized, setIsMaximized] = useState(false);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen && item && profile) {
      loadFile();
    } else {
      setContent('');
      setInitialContent('');
      setError(null);
    }
  }, [isOpen, item, profile]);

  const loadFile = async () => {
    if (!item || !profile) return;
    setLoading(true);
    setError(null);
    setSavedSuccess(false);

    try {
      const detectedLang = getLanguageFromExtension(item.extension || item.name.split('.').pop());
      setLanguage(detectedLang);

      const preview = await window.electronAPI.s3.getPreview(profile, bucket, item.key);
      const text = preview.text !== undefined ? preview.text : '';
      setContent(text);
      setInitialContent(text);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки файла');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!item || !profile || saving) return;
    if (!isProActive) {
      if (onOpenProModal) onOpenProModal();
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const codeToSave = editorRef.current ? editorRef.current.getValue() : content;
      await window.electronAPI.s3.saveTextContent(profile, bucket, item.key, codeToSave);
      setInitialContent(codeToSave);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      if (onFileSaved) onFileSaved();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения файла в S3');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut Ctrl + S (layout-independent via e.code)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyS' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        if (!isProActive) {
          if (onOpenProModal) onOpenProModal();
          return;
        }
        handleSave();
      } else if (e.code === 'Escape' && !isMaximized) {
        handleCloseRequest();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, content, saving, item, profile]);

  const handleCloseRequest = async () => {
    const isModified = editorRef.current
      ? editorRef.current.getValue() !== initialContent
      : content !== initialContent;

    if (isModified) {
      const ok = await confirm({
        title: t('monaco.unsavedTitle'),
        message: t('monaco.unsavedMsg'),
        confirmText: t('monaco.closeWithoutSaving'),
        cancelText: t('monaco.stayInEditor'),
        variant: 'warning',
      });
      if (ok) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  if (!isOpen || !item) return null;

  const isModified = editorRef.current
    ? editorRef.current.getValue() !== initialContent
    : content !== initialContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs animate-fade-in text-foreground p-3 sm:p-6">
      <div
        className={`bg-plane-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[85vh]'
        }`}
      >
        {/* Editor Header */}
        <div className="h-12 px-4 border-b border-border flex items-center justify-between bg-plane-surface/90 select-none flex-shrink-0">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <FileCode className="w-4 h-4" />
            </div>

            <div className="flex items-center space-x-2 truncate">
              <span className="font-semibold text-xs text-foreground truncate" title={item.name}>
                {item.name}
              </span>

              {isModified && (
                <span className="w-2 h-2 rounded-full bg-amber-400" title={t('monaco.modified')} />
              )}

              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 flex-shrink-0">
                <Sparkles className="w-2.5 h-2.5" /> Monaco (VS Code)
              </span>

              <span className="text-border hidden sm:inline">|</span>

              <span className="text-[11px] text-muted-foreground font-mono truncate hidden md:inline">
                s3://{bucket}/{item.key}
              </span>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* Language Selector */}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-background border border-border rounded-md px-2 py-1 text-[11px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>

            {/* Save / Pro Read-Only Button */}
            {!isProActive ? (
              <button
                onClick={onOpenProModal}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border border-amber-500/30 shadow-xs cursor-pointer"
                title={t('monaco.proReadOnlyTooltip')}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{t('monaco.readOnly')}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500 text-black px-1 rounded ml-0.5">
                  PRO
                </span>
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-xs ${
                  savedSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-primary hover:bg-primary-hover text-primary-foreground disabled:opacity-50'
                }`}
                title={t('monaco.saveTooltip')}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : savedSuccess ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{savedSuccess ? t('monaco.saved') : t('monaco.saveBtn')}</span>
                <kbd className="hidden sm:inline text-[9px] font-mono bg-black/20 px-1 py-0.2 rounded">
                  Ctrl S
                </kbd>
              </button>
            )}

            {/* Maximize Toggle */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={isMaximized ? t('monaco.restore') : t('monaco.maximize')}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close Button */}
            <button
              onClick={handleCloseRequest}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title={t('monaco.closeEditor')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Community Read-Only Notification Banner */}
        {!isProActive && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center justify-between select-none">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span>
                {t('monaco.communityBanner')}
              </span>
            </div>
            {onOpenProModal && (
              <button
                onClick={onOpenProModal}
                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold text-[11px] transition-colors ml-2 flex-shrink-0 cursor-pointer"
              >
                {t('monaco.activatePro')}
              </button>
            )}
          </div>
        )}

        {/* Error Notification Banner */}
        {error && (
          <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Monaco Editor Container */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-background">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground space-y-2">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="text-xs">{t('monaco.loadingFile')}</p>
            </div>
          ) : (
            <Editor
              height="100%"
              language={language}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              value={content}
              onChange={(val) => setContent(val || '')}
              onMount={handleEditorDidMount}
              options={{
                readOnly: !isProActive,
                domReadOnly: !isProActive,
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                lineNumbers: 'on',
                minimap: { enabled: true },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: 'on',
                formatOnPaste: true,
              }}
            />
          )}
        </div>

        {/* Editor Status Bar */}
        <div className="h-6 px-4 bg-plane-surface border-t border-border flex items-center justify-between text-[11px] text-muted-foreground select-none font-mono">
          <div className="flex items-center space-x-3">
            <span>
              {t('monaco.lineCol', { line: cursorPos.line, col: cursorPos.col })}
            </span>
            <span>•</span>
            <span>{t('monaco.chars', { count: content.length })}</span>
            <span>•</span>
            <span className="uppercase">{language}</span>
          </div>

          <div className="flex items-center space-x-2">
            <span>UTF-8</span>
            <span>•</span>
            <span>{isModified ? t('monaco.modified') : t('monaco.synced')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
