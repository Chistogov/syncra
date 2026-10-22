import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, translations } from '../i18n/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

// Convenient alias matching popular i18n convention
export const useTranslation = () => {
  return useLanguage();
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const savedLang = localStorage.getItem('s3_explorer_language');
      if (savedLang === 'ru' || savedLang === 'en') {
        return savedLang;
      }
      // Also check in AppSettings if stored there
      const settingsStr = localStorage.getItem('s3_explorer_settings');
      if (settingsStr) {
        const parsed = JSON.parse(settingsStr);
        if (parsed.language === 'ru' || parsed.language === 'en') {
          return parsed.language;
        }
      }
    } catch {}
    return 'ru';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('s3_explorer_language', lang);
      // Synchronize with settings in localStorage
      const settingsStr = localStorage.getItem('s3_explorer_settings');
      if (settingsStr) {
        const parsed = JSON.parse(settingsStr);
        parsed.language = lang;
        localStorage.setItem('s3_explorer_settings', JSON.stringify(parsed));
      }
    } catch {}
    document.documentElement.lang = lang;
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const langDict = (translations as any)[language];
      let text = langDict?.[key];

      // Fallback to English or Russian if key is missing
      if (!text) {
        text = (translations as any)['en']?.[key] || (translations as any)['ru']?.[key] || key;
      }

      // Replace {param} placeholders if params are provided
      if (params && typeof text === 'string') {
        Object.entries(params).forEach(([paramKey, paramVal]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
        });
      }

      return text;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
