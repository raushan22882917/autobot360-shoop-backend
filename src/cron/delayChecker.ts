import { checkDelayedDeliveries } from '../services/tracking/trackingService';

let intervalId: NodeJS.Timeout | null = null;

export function startDelayChecker(): void {
  if (intervalId) {
    // Already running
    return;
  }

  // Check for delayed deliveries every 60 seconds
  intervalId = setInterval(async () => {
    try {
      await checkDelayedDeliveries();
    } catch (error) {
      console.error('Error checking delayed deliveries:', error);
    }
  }, 60 * 1000);
}

export function stopDelayChecker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
