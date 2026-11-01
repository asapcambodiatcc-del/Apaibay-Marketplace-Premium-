import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { LanguageCode, LanguageInfo, SUPPORTED_LANGUAGES } from './types';
import { TRANSLATIONS } from './translations';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  languages: LanguageInfo[];
  currentLanguageInfo: LanguageInfo;
  t: (key: string, fallback?: string) => string;
  tCategory: (slug: string, defaultName?: string) => string;
}

const STORAGE_KEY = 'apaibay_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const CATEGORY_KEY_MAP: Record<string, string> = {
  'all': 'cat.all',
  'fashion': 'cat.fashion',
  'electronics': 'cat.electronics',
  'modern-campaign': 'cat.modernCampaign',
  'beauty': 'cat.beauty',
  'home-kitchen': 'cat.homeKitchen',
  'sports': 'cat.sports',
  'furniture': 'cat.furniture',
  'groceries': 'cat.groceries',
  'gaming': 'cat.gaming',
  'automotive': 'cat.automotive',
  'pet-supplies': 'cat.petSupplies',
  'audio-accessories': 'cat.audioTech',
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
        return saved;
      }
    } catch {
      // Ignore storage read error
    }
    return 'en';
  });

  const setLanguage = (newLang: LanguageCode) => {
    if (SUPPORTED_LANGUAGES.some((l) => l.code === newLang)) {
      setLanguageState(newLang);
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
      } catch {
        // Ignore storage write error
      }
      try {
        document.documentElement.lang = newLang;
      } catch {
        // Ignore
      }
    }
  };

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // Ignore
    }
  }, [language]);

  const currentLanguageInfo = useMemo(() => {
    return (
      SUPPORTED_LANGUAGES.find((l) => l.code === language) ||
      SUPPORTED_LANGUAGES[0]
    );
  }, [language]);

  const t = (key: string, fallback?: string): string => {
    if (!key) return fallback || '';
    const langDict = TRANSLATIONS[language];
    if (langDict && langDict[key]) {
      return langDict[key];
    }
    const enDict = TRANSLATIONS['en'];
    if (enDict && enDict[key]) {
      return enDict[key];
    }
    return fallback !== undefined ? fallback : key;
  };

  const tCategory = (slug: string, defaultName?: string): string => {
    const key = CATEGORY_KEY_MAP[slug];
    if (key) {
      return t(key, defaultName || slug);
    }
    return defaultName || slug;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        languages: SUPPORTED_LANGUAGES,
        currentLanguageInfo,
        t,
        tCategory,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const useTranslation = () => {
  const { t, language, setLanguage, languages, currentLanguageInfo, tCategory } = useLanguage();
  return { t, language, setLanguage, languages, currentLanguageInfo, tCategory };
};
