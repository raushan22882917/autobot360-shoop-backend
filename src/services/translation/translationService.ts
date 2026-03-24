import axios from 'axios';
import { env } from '../../config/env';
import { SUPPORTED_LANGUAGES } from '../../types';

const TRANSLATE_API = 'https://translation.googleapis.com/language/translate/v2';
const DETECT_API = 'https://translation.googleapis.com/language/translate/v2/detect';

export async function detectLanguage(text: string): Promise<string> {
  try {
    const response = await axios.post(
      `${DETECT_API}?key=${env.GOOGLE_CLOUD_TRANSLATION_API_KEY}`,
      { q: text },
      { timeout: 5000 }
    );
    const detected = response.data?.data?.detections?.[0]?.[0]?.language ?? 'en';
    // Normalize to supported language or fall back to English
    return SUPPORTED_LANGUAGES.includes(detected as any) ? detected : 'en';
  } catch {
    return 'en';
  }
}

export async function translate(text: string, targetLang: string): Promise<string> {
  if (targetLang === 'en' && !(await isNonEnglish(text))) return text;

  try {
    const response = await axios.post(
      `${TRANSLATE_API}?key=${env.GOOGLE_CLOUD_TRANSLATION_API_KEY}`,
      { q: text, target: targetLang, format: 'text' },
      { timeout: 5000 }
    );
    return response.data?.data?.translations?.[0]?.translatedText ?? text;
  } catch {
    return text; // Fall back to original on error
  }
}

async function isNonEnglish(text: string): Promise<boolean> {
  const lang = await detectLanguage(text);
  return lang !== 'en';
}

export async function translateToEnglish(text: string): Promise<{ text: string; detectedLanguage: string }> {
  const detectedLanguage = await detectLanguage(text);
  if (detectedLanguage === 'en') return { text, detectedLanguage };
  const translated = await translate(text, 'en');
  return { text: translated, detectedLanguage };
}
