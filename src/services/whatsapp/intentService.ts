import axios from 'axios';
import { env } from '../../config/env';
import { classifyIntent as geminiClassify } from '../ai/aiService';
import type { SessionMessage } from './sessionService';

const CONFIDENCE_THRESHOLD = 0.6;

export interface BotIntent {
  type: string;
  params: Record<string, unknown>;
  confidence: number;
}

export async function classifyIntent(
  englishText: string,
  sessionMessages: SessionMessage[],
  userType: 'shop_owner' | 'customer' | 'unknown'
): Promise<BotIntent> {
  // Primary: Gemini
  const geminiResult = await geminiClassify(englishText, sessionMessages, userType);

  if (geminiResult.confidence >= CONFIDENCE_THRESHOLD) {
    return {
      type: geminiResult.intent,
      params: geminiResult.params,
      confidence: geminiResult.confidence,
    };
  }

  // Fallback: Google Cloud Natural Language API
  try {
    const nlpResult = await classifyWithNLP(englishText);
    if (nlpResult) {
      return { type: nlpResult, params: {}, confidence: 0.5 };
    }
  } catch {
    // NLP fallback failed — use Gemini result anyway
  }

  return {
    type: geminiResult.intent || 'UNKNOWN',
    params: geminiResult.params,
    confidence: geminiResult.confidence,
  };
}

async function classifyWithNLP(text: string): Promise<string | null> {
  try {
    const response = await axios.post(
      `https://language.googleapis.com/v1/documents:classifyText?key=${env.GOOGLE_CLOUD_NL_API_KEY}`,
      {
        document: { type: 'PLAIN_TEXT', content: text },
      },
      { timeout: 5000 }
    );

    const categories = response.data?.categories ?? [];
    if (categories.length === 0) return null;

    // Map NLP categories to bot intents
    const topCategory = categories[0]?.name ?? '';
    if (topCategory.includes('Shopping')) return 'BROWSE_PRODUCTS';
    if (topCategory.includes('Business')) return 'LIST_ORDERS';
    return null;
  } catch {
    return null;
  }
}
