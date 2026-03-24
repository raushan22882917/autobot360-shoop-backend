import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError } from '../../utils/errors';
import { sendWhatsApp } from '../notification/notificationService';

export interface OnboardingStatus {
  create_shop: boolean;
  add_product: boolean;
  set_pricing: boolean;
  go_live: boolean;
  completed_at?: string;
  is_complete: boolean;
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const { data: onboarding, error } = await supabaseAdmin
    .from('onboarding_steps')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
    handleSupabaseError(error);
  }

  if (!onboarding) {
    return {
      create_shop: false,
      add_product: false,
      set_pricing: false,
      go_live: false,
      is_complete: false,
    };
  }

  const allStepsComplete = onboarding.create_shop && 
                          onboarding.add_product && 
                          onboarding.set_pricing && 
                          onboarding.go_live;

  return {
    create_shop: onboarding.create_shop,
    add_product: onboarding.add_product,
    set_pricing: onboarding.set_pricing,
    go_live: onboarding.go_live,
    completed_at: onboarding.completed_at,
    is_complete: allStepsComplete,
  };
}

export async function markStep(
  userId: string,
  step: 'create_shop' | 'add_product' | 'set_pricing' | 'go_live'
): Promise<OnboardingStatus> {
  // Check if user exists
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('phone, onboarding_complete')
    .eq('id', userId)
    .single();

  if (userError) handleSupabaseError(userError);
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');

  // Upsert onboarding step
  const { data: onboarding, error: onboardingError } = await supabaseAdmin
    .from('onboarding_steps')
    .upsert({
      user_id: userId,
      [step]: true,
    }, {
      onConflict: 'user_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (onboardingError) handleSupabaseError(onboardingError);

  // Check if all steps are now complete
  const allStepsComplete = onboarding.create_shop && 
                          onboarding.add_product && 
                          onboarding.set_pricing && 
                          onboarding.go_live;

  let completedAt = onboarding.completed_at;
  let shouldNotify = false;

  if (allStepsComplete && !onboarding.completed_at) {
    completedAt = new Date().toISOString();
    
    // Mark onboarding as complete
    await supabaseAdmin
      .from('onboarding_steps')
      .update({ completed_at: completedAt })
      .eq('user_id', userId);

    // Mark user's onboarding as complete
    await supabaseAdmin
      .from('users')
      .update({ onboarding_complete: true, updated_at: new Date().toISOString() })
      .eq('id', userId);

    shouldNotify = !user.onboarding_complete;
  }

  // Send WhatsApp notification if just completed
  if (shouldNotify && user.phone) {
    try {
      await sendWhatsApp(user.phone, 'ONBOARDING_COMPLETE', {}, 'en');
    } catch (err) {
      // Log error but don't fail the operation
      console.error('Failed to send onboarding completion WhatsApp:', err);
    }
  }

  return {
    create_shop: onboarding.create_shop,
    add_product: onboarding.add_product,
    set_pricing: onboarding.set_pricing,
    go_live: onboarding.go_live,
    completed_at: completedAt,
    is_complete: allStepsComplete,
  };
}

export async function resetOnboarding(userId: string): Promise<OnboardingStatus> {
  const { error } = await supabaseAdmin
    .from('onboarding_steps')
    .update({
      create_shop: false,
      add_product: false,
      set_pricing: false,
      go_live: false,
      completed_at: null,
    })
    .eq('user_id', userId);

  if (error) handleSupabaseError(error);

  // Also mark user's onboarding as incomplete
  await supabaseAdmin
    .from('users')
    .update({ onboarding_complete: false, updated_at: new Date().toISOString() })
    .eq('id', userId);

  return {
    create_shop: false,
    add_product: false,
    set_pricing: false,
    go_live: false,
    is_complete: false,
  };
}

export async function getOnboardingProgress(userId: string): Promise<{
  completed_steps: number;
  total_steps: number;
  progress_percentage: number;
  next_step?: 'create_shop' | 'add_product' | 'set_pricing' | 'go_live';
}> {
  const status = await getOnboardingStatus(userId);
  
  const steps = ['create_shop', 'add_product', 'set_pricing', 'go_live'] as const;
  const completedSteps = steps.filter(step => status[step]).length;
  const totalSteps = steps.length;
  const progressPercentage = Math.round((completedSteps / totalSteps) * 100);

  let nextStep: typeof steps[number] | undefined;
  for (const step of steps) {
    if (!status[step]) {
      nextStep = step;
      break;
    }
  }

  return {
    completed_steps: completedSteps,
    total_steps: totalSteps,
    progress_percentage: progressPercentage,
    next_step: nextStep,
  };
}
