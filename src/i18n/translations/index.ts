import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { ja } from './ja';
import { km } from './km';
import { zh } from './zh';
import { ko } from './ko';
import { LanguageCode } from '../types';

export const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en,
  es,
  fr,
  de,
  ja,
  km,
  zh,
  ko,
};

export type TranslationKey = keyof typeof en;
