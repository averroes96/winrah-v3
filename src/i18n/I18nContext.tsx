// ============================================================================
// WINRAH - Localization Context & Hook
// Supports dynamic Arabic (RTL) & French (LTR) switching with persistence.
// Default language: Arabic (if device has no language or non-French default).
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Language, TranslationKey, translations } from './translations';

interface I18nContextType {
  language: Language;
  direction: 'rtl' | 'ltr';
  isRTL: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

/**
 * Determine initial language based on:
 * 1. Saved localStorage preference ('ar' or 'fr')
 * 2. Device/Browser default language (if French, use French)
 * 3. Default fallback: Arabic ('ar') per requirement
 */
export const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'ar';

  try {
    const saved = localStorage.getItem('winrah_language');
    if (saved === 'ar' || saved === 'fr') {
      return saved;
    }

    const nav = window.navigator;
    const deviceLang = (
      nav.language ||
      (nav.languages && nav.languages[0]) ||
      ''
    ).toLowerCase();

    // If device explicitly has French as primary language, use French
    if (deviceLang.startsWith('fr')) {
      return 'fr';
    }

    // Default to Arabic if device has no language, or is Arabic, or anything else
    return 'ar';
  } catch {
    return 'ar';
  }
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const direction: 'rtl' | 'ltr' = language === 'ar' ? 'rtl' : 'ltr';
  const isRTL = direction === 'rtl';

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('winrah_language', lang);
    } catch (e) {
      console.warn('Could not save language to localStorage:', e);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'ar' ? 'fr' : 'ar');
  }, [language, setLanguage]);

  // Synchronize document direction and lang attribute whenever language changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = direction;
      document.body.dir = direction;

      // Also set data attribute for specific CSS selectors if needed
      document.documentElement.setAttribute('data-lang', language);
    }
  }, [language, direction]);

  // Translation function with parameter interpolation
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const currentDict = translations[language] || translations.ar;
      let text = (currentDict as any)[key] || (translations.ar as any)[key] || key;

      if (params) {
        Object.entries(params).forEach(([paramKey, paramValue]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        });
      }

      return text;
    },
    [language]
  );

  return (
    <I18nContext.Provider
      value={{
        language,
        direction,
        isRTL,
        setLanguage,
        toggleLanguage,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
