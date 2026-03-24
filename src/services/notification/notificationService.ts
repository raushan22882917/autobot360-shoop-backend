import twilio from 'twilio';
import { env } from '../../config/env';
import { getLocalizedString } from '../../utils/i18n';

type MessageKey =
  | 'ORDER_RECEIVED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'ORDER_NEARBY'
  | 'ORDER_DELIVERED'
  | 'DELIVERY_DELAYED'
  | 'LOW_STOCK'
  | 'SETTLEMENT_DONE'
  | 'ONBOARDING_COMPLETE'
  | 'AGENT_ASSIGNED'
  | 'SHOP_CLOSED'
  | 'REGISTRATION_PROMPT'
  | 'HELP_MESSAGE'
  | 'UNKNOWN_COMMAND';

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

function formatWhatsAppNumber(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('whatsapp:')) return cleaned;
  if (cleaned.startsWith('+')) return `whatsapp:${cleaned}`;
  if (cleaned.startsWith('91') && cleaned.length === 12) return `whatsapp:+${cleaned}`;
  return `whatsapp:+91${cleaned}`;
}

export async function sendWhatsApp(
  toPhone: string,
  templateKey: MessageKey,
  params: Record<string, string | number> = {},
  language = 'en'
): Promise<void> {
  if (!toPhone) return;

  const message = getLocalizedString(templateKey, language, params);

  try {
    await twilioClient.messages.create({
      from: env.TWILIO_WHATSAPP_FROM,
      to: formatWhatsAppNumber(toPhone),
      body: message,
    });
  } catch (err: any) {
    // Non-blocking — log and continue
    console.error(`[Notification] Failed to send WhatsApp to ${toPhone}:`, err.message);
  }
}

export async function sendRawWhatsApp(toPhone: string, message: string): Promise<void> {
  if (!toPhone) return;

  try {
    await twilioClient.messages.create({
      from: env.TWILIO_WHATSAPP_FROM,
      to: formatWhatsAppNumber(toPhone),
      body: message,
    });
  } catch (err: any) {
    console.error(`[Notification] Failed to send WhatsApp to ${toPhone}:`, err.message);
  }
}
