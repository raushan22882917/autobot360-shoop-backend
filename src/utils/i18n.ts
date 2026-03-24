import type { SupportedLanguage } from '../types';
import { SUPPORTED_LANGUAGES } from '../types';

// Message template keys
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

type Templates = Record<MessageKey, string>;

// English templates (base)
const EN_TEMPLATES: Templates = {
  ORDER_RECEIVED: 'New order received! Order #{orderId} from {customerName} ({customerPhone}) for {productName}. Message: {message}',
  PAYMENT_RECEIVED: 'Payment received for Order #{orderId}. Amount: ₹{amount}',
  PAYMENT_FAILED: 'Payment failed for Order #{orderId}. Please try again.',
  ORDER_NEARBY: 'Your order from {shopName} is almost there! {agentName} is nearby.',
  ORDER_DELIVERED: 'Your order #{orderId} from {shopName} has been delivered. Thank you!',
  DELIVERY_DELAYED: 'Order #{orderId} for customer {customerName} is running late. Please check.',
  LOW_STOCK: 'Low stock alert: {productName} has only {stockCount} units remaining.',
  SETTLEMENT_DONE: 'Settlement of ₹{amount} has been transferred to your account. Reference: {transferRef}',
  ONBOARDING_COMPLETE: 'Congratulations! Your shop is live on DukaanLive. Start receiving orders now!',
  AGENT_ASSIGNED: 'You have been assigned to deliver Order #{orderId} to {customerName} at {customerAddress}. Maps: {mapsLink}',
  SHOP_CLOSED: 'Sorry, the shop is currently closed. Next opening: {nextOpenTime}',
  REGISTRATION_PROMPT: 'Welcome to DukaanLive! Please register at {registrationUrl} to get started.',
  HELP_MESSAGE: 'Available commands:\n• ADD PRODUCT <name> <price>\n• LIST ORDERS\n• UPDATE ORDER <id> <status>\n• LIST PRODUCTS',
  UNKNOWN_COMMAND: 'I did not understand that. Type HELP to see available commands.',
};

// Hindi templates
const HI_TEMPLATES: Partial<Templates> = {
  ORDER_RECEIVED: 'नया ऑर्डर मिला! ऑर्डर #{orderId} {customerName} ({customerPhone}) से {productName} के लिए। संदेश: {message}',
  PAYMENT_RECEIVED: 'ऑर्डर #{orderId} के लिए भुगतान प्राप्त हुआ। राशि: ₹{amount}',
  PAYMENT_FAILED: 'ऑर्डर #{orderId} के लिए भुगतान विफल। कृपया पुनः प्रयास करें।',
  ORDER_NEARBY: 'आपका {shopName} से ऑर्डर लगभग पहुंच गया! {agentName} पास में है।',
  ORDER_DELIVERED: 'आपका ऑर्डर #{orderId} {shopName} से डिलीवर हो गया। धन्यवाद!',
  DELIVERY_DELAYED: 'ऑर्डर #{orderId} ग्राहक {customerName} के लिए देर हो रही है। कृपया जांचें।',
  LOW_STOCK: 'कम स्टॉक अलर्ट: {productName} में केवल {stockCount} यूनिट बचे हैं।',
  SETTLEMENT_DONE: '₹{amount} का भुगतान आपके खाते में स्थानांतरित किया गया। संदर्भ: {transferRef}',
  ONBOARDING_COMPLETE: 'बधाई हो! आपकी दुकान DukaanLive पर लाइव है। अभी ऑर्डर प्राप्त करना शुरू करें!',
  HELP_MESSAGE: 'उपलब्ध कमांड:\n• PRODUCT ADD करें <नाम> <कीमत>\n• ORDERS LIST करें\n• ORDER UPDATE करें <id> <स्थिति>\n• PRODUCTS LIST करें',
  UNKNOWN_COMMAND: 'मैं यह नहीं समझा। उपलब्ध कमांड देखने के लिए HELP टाइप करें।',
};

const LANGUAGE_TEMPLATES: Partial<Record<SupportedLanguage, Partial<Templates>>> = {
  hi: HI_TEMPLATES,
  en: EN_TEMPLATES,
};

export function getLocalizedString(
  key: MessageKey,
  language: string,
  params: Record<string, string | number> = {}
): string {
  const lang = SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)
    ? (language as SupportedLanguage)
    : 'en';

  const langTemplates = LANGUAGE_TEMPLATES[lang] ?? {};
  const template = (langTemplates[key] ?? EN_TEMPLATES[key]) as string;

  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  );
}

export function isLanguageSupported(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}
