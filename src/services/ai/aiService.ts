import axios from 'axios';
import { env } from '../../config/env';
import { HttpError } from '../../utils/errors';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GEMINI_TIMEOUT_MS = 10_000;

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}(.*?)`{1,3}/gs, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^[-*+]\s/gm, '')
    .replace(/^\d+\.\s/gm, '')
    .trim();
}

export async function generateDescription(
  productName: string,
  category: string,
  language = 'en'
): Promise<string> {
  const langInstruction = language !== 'en'
    ? `Write the description in ${language} language.`
    : 'Write the description in English.';

  const prompt = `You are a product copywriter for an Indian e-commerce platform.
Write a compelling product description for "${productName}" in the "${category}" category.
The description must be between 50 and 150 words.
${langInstruction}
Do not use any markdown formatting. Plain text only.
Focus on benefits, quality, and appeal to Indian customers.`;

  try {
    const response = await Promise.race([
      axios.post(
        `${GEMINI_API_URL}?key=${env.GOOGLE_GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
        },
        { timeout: GEMINI_TIMEOUT_MS }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), GEMINI_TIMEOUT_MS)
      ),
    ]);

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new HttpError(503, 'AI_ERROR', 'No description generated');
    }

    return stripMarkdown(text);
  } catch (err: any) {
    if (err instanceof HttpError) throw err;
    if (err.message === 'GEMINI_TIMEOUT' || err.code === 'ECONNABORTED') {
      throw new HttpError(503, 'AI_TIMEOUT', 'AI service timed out. Please try again.');
    }
    throw new HttpError(503, 'AI_ERROR', `AI service error: ${err.message}`);
  }
}

export async function classifyIntent(
  englishText: string,
  sessionMessages: Array<{ role: string; content: string }>,
  userType: 'shop_owner' | 'customer' | 'unknown'
): Promise<{ intent: string; params: Record<string, unknown>; confidence: number }> {
  const prompt = `You are a WhatsApp bot assistant for DukaanLive, an Indian commerce platform.
The user is a ${userType}.
Conversation history: ${JSON.stringify(sessionMessages.slice(-5))}
User message (in English): "${englishText}"

Classify the intent as one of: ADD_PRODUCT, LIST_ORDERS, UPDATE_ORDER, LIST_PRODUCTS,
BROWSE_PRODUCTS, PLACE_ORDER, CHECK_ORDER, SHOP_HOURS, ONBOARDING_STEP, LOCATION_UPDATE, UNKNOWN, HELP.
Extract relevant parameters (product name, price, order_id, status, date_filter, etc.).
Respond ONLY in JSON: { "intent": "...", "params": {...}, "confidence": 0.0-1.0 }`;

  try {
    const response = await Promise.race([
      axios.post(
        `${GEMINI_API_URL}?key=${env.GOOGLE_GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        },
        { timeout: GEMINI_TIMEOUT_MS }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), GEMINI_TIMEOUT_MS)
      ),
    ]);

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { intent: 'UNKNOWN', params: {}, confidence: 0 };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intent: parsed.intent ?? 'UNKNOWN',
      params: parsed.params ?? {},
      confidence: parsed.confidence ?? 0,
    };
  } catch {
    return { intent: 'UNKNOWN', params: {}, confidence: 0 };
  }
}
