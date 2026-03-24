import { supabaseAdmin } from '../../config/supabase';
import { loadSession, saveSession } from './sessionService';
import { classifyIntent } from './intentService';
import { dispatchIntent } from './botDispatcher';
import { detectLanguage, translate, translateToEnglish } from '../translation/translationService';
import { sendRawWhatsApp } from '../notification/notificationService';

export interface TwilioWebhookPayload {
  From: string;
  Body: string;
  Latitude?: string;
  Longitude?: string;
  [key: string]: string | undefined;
}

export async function handleInboundMessage(payload: TwilioWebhookPayload): Promise<void> {
  const fromPhone = payload.From.replace('whatsapp:', '');
  const messageBody = payload.Body ?? '';

  // [3] Load session
  const session = await loadSession(fromPhone);

  // [4+5] Detect language and translate to English
  const { text: englishText, detectedLanguage } = await translateToEnglish(messageBody);
  session.language_code = detectedLanguage;

  // [6] Identify user type
  const userType = await identifyUserType(fromPhone);
  session.user_type = userType;

  // [7] Classify intent
  const intent = await classifyIntent(englishText, session.messages, userType);

  // [8+9] Dispatch and get English reply
  const englishReply = await dispatchIntent(intent, fromPhone, userType);

  // [10] Translate reply back to detected language
  const localizedReply = detectedLanguage !== 'en'
    ? await translate(englishReply, detectedLanguage)
    : englishReply;

  // [11] Update session
  session.messages.push(
    { role: 'user', content: messageBody, timestamp: new Date().toISOString() },
    { role: 'bot', content: englishReply, timestamp: new Date().toISOString() }
  );
  await saveSession(fromPhone, session);

  // [12] Update user language preference if changed
  await updateUserLanguage(fromPhone, detectedLanguage);

  // [13] Send reply via Twilio
  await sendRawWhatsApp(fromPhone, localizedReply);
}

async function identifyUserType(phone: string): Promise<'shop_owner' | 'customer' | 'unknown'> {
  const cleanPhone = phone.replace('+91', '').replace(/\s+/g, '');

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .or(`phone.eq.${phone},phone.eq.+91${cleanPhone},phone.eq.${cleanPhone}`)
    .single();

  if (!user) return 'unknown';
  if (user.role === 'shop_owner' || user.role === 'admin') return 'shop_owner';
  return 'customer';
}

async function updateUserLanguage(phone: string, languageCode: string): Promise<void> {
  const cleanPhone = phone.replace('+91', '').replace(/\s+/g, '');

  await supabaseAdmin
    .from('users')
    .update({ language_code: languageCode, updated_at: new Date().toISOString() })
    .or(`phone.eq.${phone},phone.eq.+91${cleanPhone},phone.eq.${cleanPhone}`);
}
