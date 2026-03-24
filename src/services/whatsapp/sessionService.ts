import { redis } from '../../config/redis';
import { env } from '../../config/env';

const MAX_MESSAGES = 5;

export interface SessionMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: string;
}

export interface WhatsAppSession {
  messages: SessionMessage[];
  language_code: string;
  user_type: 'shop_owner' | 'customer' | 'unknown';
}

function sessionKey(phone: string): string {
  return `wa_session:${phone}`;
}

export async function loadSession(phone: string): Promise<WhatsAppSession> {
  const raw = await redis.get(sessionKey(phone));
  if (!raw) {
    return { messages: [], language_code: 'en', user_type: 'unknown' };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { messages: [], language_code: 'en', user_type: 'unknown' };
  }
}

export async function saveSession(
  phone: string,
  session: WhatsAppSession
): Promise<void> {
  // Keep only last MAX_MESSAGES exchanges
  const trimmed = { ...session, messages: session.messages.slice(-MAX_MESSAGES) };
  const ttlSeconds = env.SESSION_EXPIRY_MINUTES * 60;
  await redis.setex(sessionKey(phone), ttlSeconds, JSON.stringify(trimmed));
}

export async function appendMessage(
  phone: string,
  role: 'user' | 'bot',
  content: string,
  language_code?: string
): Promise<void> {
  const session = await loadSession(phone);
  session.messages.push({ role, content, timestamp: new Date().toISOString() });
  if (language_code) session.language_code = language_code;
  await saveSession(phone, session);
}

export async function clearSession(phone: string): Promise<void> {
  await redis.del(sessionKey(phone));
}
