/**
 * notificationActions — handle the user's response to a care reminder.
 *
 * Wires the care-reminder action buttons + taps (registered in
 * `NotificationService`) to app behaviour, the local equivalent of a "water
 * now" quick-action:
 *   - "Mark as done"  → records the completion (which reschedules the next
 *                       reminder via CareService).
 *   - "Snooze 1 day"  → schedules a one-off reminder a day later.
 *   - default tap     → deep-links to the plant's Care screen.
 *
 * Pure-ish: navigation is injected as a callback so this module has no
 * dependency on the router and stays unit-friendly.
 */
import type * as Notifications from 'expo-notifications';

import { CareService } from './CareService';
import {
  CARE_ACTION_DONE,
  CARE_ACTION_SNOOZE,
  NotificationService,
} from './NotificationService';
import type { CareType } from './NotificationService';
import { PlantService } from './PlantService';

/** The `data` payload carried on care reminders. */
export interface CareNotificationData {
  scheduleId?: string;
  plantId?: string;
  type?: CareType;
}

/**
 * Handle a notification response. `navigateToCare(plantId)` is invoked for a
 * default tap so the caller (root layout) can route with expo-router.
 */
export async function handleCareNotificationResponse(
  response: Notifications.NotificationResponse,
  navigateToCare: (plantId: string) => void,
): Promise<void> {
  const data = (response.notification.request.content.data ?? {}) as CareNotificationData;
  const action = response.actionIdentifier;

  try {
    if (action === CARE_ACTION_DONE && data.scheduleId) {
      await CareService.markComplete(data.scheduleId);
      return;
    }

    if (action === CARE_ACTION_SNOOZE && data.scheduleId && data.plantId && data.type) {
      const plant = await PlantService.getPlant(data.plantId);
      await NotificationService.snoozeReminder(
        { scheduleId: data.scheduleId, plantId: data.plantId, type: data.type },
        plant?.displayName ?? 'Plant care',
      );
      return;
    }

    // Default tap (or any other action): open the plant's Care screen.
    if (data.plantId) {
      navigateToCare(data.plantId);
    }
  } catch (error) {
    console.warn('handleCareNotificationResponse failed', error);
  }
}
