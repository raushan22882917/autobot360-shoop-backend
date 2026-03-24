import { supabaseAdmin } from '../../config/supabase';
import { HttpError } from '../../utils/errors';

const INDIAN_PHONE_REGEX = /^(\+91)?[6-9]\d{9}$/;

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+91')) return cleaned;
  if (cleaned.startsWith('91') && cleaned.length === 12) return `+${cleaned}`;
  return `+91${cleaned}`;
}

function validateIndianPhone(phone: string): void {
  if (!INDIAN_PHONE_REGEX.test(phone.replace(/\s+/g, ''))) {
    throw new HttpError(422, 'INVALID_PHONE', 'Please provide a valid Indian phone number');
  }
}

export async function sendOtp(phone: string): Promise<{ message: string }> {
  validateIndianPhone(phone);
  const normalizedPhone = normalizePhone(phone);

  const { error } = await supabaseAdmin.auth.signInWithOtp({
    phone: normalizedPhone,
  });

  if (error) {
    throw new HttpError(502, 'OTP_SEND_FAILED', error.message);
  }

  return { message: 'OTP sent successfully' };
}

export async function verifyOtp(
  phone: string,
  token: string
): Promise<{
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    phone: string;
    role: string;
    plan: string;
    onboarding_complete: boolean;
  };
}> {
  validateIndianPhone(phone);
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabaseAdmin.auth.verifyOtp({
    phone: normalizedPhone,
    token,
    type: 'sms',
  });

  if (error) {
    if (error.message.toLowerCase().includes('expired')) {
      throw new HttpError(401, 'OTP_EXPIRED', 'OTP has expired. Please request a new one.');
    }
    throw new HttpError(401, 'OTP_INVALID', 'Invalid OTP. Please try again.');
  }

  if (!data.session || !data.user) {
    throw new HttpError(401, 'AUTH_FAILED', 'Authentication failed');
  }

  // Upsert user profile on first login
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        id: data.user.id,
        phone: normalizedPhone,
        role: 'user',
        plan: 'free',
        onboarding_complete: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id', ignoreDuplicates: false }
    )
    .select('id, phone, role, plan, onboarding_complete')
    .single();

  if (profileError || !profile) {
    throw new HttpError(500, 'PROFILE_ERROR', 'Failed to create user profile');
  }

  // Create onboarding_steps record if not exists
  await supabaseAdmin
    .from('onboarding_steps')
    .upsert({ user_id: data.user.id }, { onConflict: 'user_id', ignoreDuplicates: true });

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: profile.id,
      phone: profile.phone,
      role: profile.role,
      plan: profile.plan,
      onboarding_complete: profile.onboarding_complete,
    },
  };
}

export async function refreshToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string }> {
  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}
