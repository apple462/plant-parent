// Feature: plant-parent, Task 8.2 — Unit tests for NotificationService
// with `expo-notifications` mocked.
//
// Validates: Requirements 3.7, 10.4
//
// The expo-notifications module is mocked inline (jest.mock) so these tests run
// without a native runtime. The mock mirrors only the v56 members the service
// actually touches (verified against
// https://docs.expo.dev/versions/v56.0.0/sdk/notifications/):
//   - scheduleNotificationAsync  -> resolves a string identifier
//   - cancelScheduledNotificationAsync
//   - getPermissionsAsync / requestPermissionsAsync -> NotificationPermissionsStatus
//   - SchedulableTriggerInputTypes (enum; .DATE === 'date')
//   - IosAuthorizationStatus (enum; DENIED=1, AUTHORIZED=2, PROVISIONAL=3)

jest.mock('expo-notifications', () => {
  const SchedulableTriggerInputTypes = {
    CALENDAR: 'calendar',
    DAILY: 'daily',
    DATE: 'date',
    MONTHLY: 'monthly',
    TIME_INTERVAL: 'timeInterval',
    WEEKLY: 'weekly',
    YEARLY: 'yearly',
  } as const;

  const IosAuthorizationStatus = {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  } as const;

  return {
    __esModule: true,
    SchedulableTriggerInputTypes,
    IosAuthorizationStatus,
    scheduleNotificationAsync: jest.fn(),
    cancelScheduledNotificationAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
  };
});

import * as Notifications from 'expo-notifications';

import {
  cancelReminder,
  CareSchedule,
  CareType,
  rescheduleAfterCompletion,
  requestPermissions,
  scheduleReminder,
} from '../NotificationService';
import { computeNextDueDate } from '../../utils/dateUtils';

// Typed handles to the mocked functions for ergonomic assertions.
const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;

/** Build a CareSchedule with sensible defaults, overridable per test. */
function makeSchedule(overrides: Partial<CareSchedule> = {}): CareSchedule {
  return {
    id: 'sched-1',
    plantId: 'plant-1',
    type: 'watering',
    intervalDays: 7,
    reminderEnabled: true,
    preferredHour: 9,
    preferredMinute: 30,
    ...overrides,
  };
}

/**
 * Build a NotificationPermissionsStatus-shaped object. Only the fields the
 * service reads (`granted`, `canAskAgain`, `ios.status`) matter here.
 */
function permStatus(opts: {
  granted: boolean;
  canAskAgain: boolean;
  iosStatus?: number;
}): Notifications.NotificationPermissionsStatus {
  return {
    granted: opts.granted,
    canAskAgain: opts.canAskAgain,
    status: opts.granted ? 'granted' : 'denied',
    expires: 'never',
    ios: opts.iosStatus !== undefined ? { status: opts.iosStatus } : undefined,
  } as unknown as Notifications.NotificationPermissionsStatus;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('scheduleReminder', () => {
  it('schedules a DATE-trigger notification at the computed next-due date and returns the id', async () => {
    mockSchedule.mockResolvedValue('notif-abc');
    const schedule = makeSchedule({ type: 'watering', intervalDays: 7 });
    const fromDate = new Date(2025, 5, 12, 14, 0, 0); // 12 Jun 2025, 14:00 local

    const id = await scheduleReminder(schedule, 'Fern', 9, 30, fromDate);

    const expectedDate = computeNextDueDate(fromDate, 7, 9, 30);
    expect(id).toBe('notif-abc');
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: expectedDate,
        }),
        content: expect.objectContaining({
          title: 'Fern',
          body: 'Time to water!',
        }),
      }),
    );
  });

  it.each<[CareType, string]>([
    ['watering', 'Time to water!'],
    ['fertilising', 'Time to fertilise!'],
    ['pruning', 'Time to prune!'],
  ])('uses the correct care message for %s', async (type, expectedBody) => {
    mockSchedule.mockResolvedValue('id');
    const schedule = makeSchedule({ type });
    const fromDate = new Date(2025, 0, 1, 8, 0, 0);

    await scheduleReminder(schedule, 'My Plant', 8, 0, fromDate);

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: 'My Plant', body: expectedBody }),
      }),
    );
  });
});

describe('cancelReminder', () => {
  it('cancels the scheduled notification by id', async () => {
    mockCancel.mockResolvedValue(undefined);

    await cancelReminder('notif-xyz');

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith('notif-xyz');
  });
});

describe('rescheduleAfterCompletion', () => {
  it('cancels the existing notification then schedules a new DATE-trigger at completionDate + interval at the preferred time', async () => {
    mockCancel.mockResolvedValue(undefined);
    mockSchedule.mockResolvedValue('notif-new');
    const schedule = makeSchedule({
      type: 'fertilising',
      intervalDays: 14,
      preferredHour: 7,
      preferredMinute: 15,
      notificationId: 'notif-old',
    });
    const completionDate = new Date(2025, 2, 10, 18, 45, 0); // 10 Mar 2025, 18:45

    const id = await rescheduleAfterCompletion(schedule, 'Cactus', completionDate);

    const expectedDate = computeNextDueDate(completionDate, 14, 7, 15);
    expect(id).toBe('notif-new');
    expect(mockCancel).toHaveBeenCalledWith('notif-old');
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: expectedDate,
        }),
        content: expect.objectContaining({
          title: 'Cactus',
          body: 'Time to fertilise!',
        }),
      }),
    );
  });

  it('does not cancel when the schedule has no existing notificationId', async () => {
    mockSchedule.mockResolvedValue('notif-new');
    const schedule = makeSchedule({ notificationId: undefined });
    const completionDate = new Date(2025, 2, 10, 8, 0, 0);

    await rescheduleAfterCompletion(schedule, 'Pothos', completionDate);

    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('requestPermissions', () => {
  it('returns true without prompting when already granted', async () => {
    mockGetPermissions.mockResolvedValue(permStatus({ granted: true, canAskAgain: true }));

    const result = await requestPermissions();

    expect(result).toBe(true);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('returns true without prompting when iOS authorization is provisional', async () => {
    mockGetPermissions.mockResolvedValue(
      permStatus({
        granted: false,
        canAskAgain: true,
        iosStatus: Notifications.IosAuthorizationStatus.PROVISIONAL,
      }),
    );

    const result = await requestPermissions();

    expect(result).toBe(true);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('prompts when denied but can ask again, and returns false if still denied', async () => {
    mockGetPermissions.mockResolvedValue(
      permStatus({
        granted: false,
        canAskAgain: true,
        iosStatus: Notifications.IosAuthorizationStatus.DENIED,
      }),
    );
    mockRequestPermissions.mockResolvedValue(
      permStatus({
        granted: false,
        canAskAgain: true,
        iosStatus: Notifications.IosAuthorizationStatus.DENIED,
      }),
    );

    const result = await requestPermissions();

    expect(result).toBe(false);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('returns true when prompting and the user then grants', async () => {
    mockGetPermissions.mockResolvedValue(
      permStatus({
        granted: false,
        canAskAgain: true,
        iosStatus: Notifications.IosAuthorizationStatus.DENIED,
      }),
    );
    mockRequestPermissions.mockResolvedValue(
      permStatus({
        granted: true,
        canAskAgain: true,
        iosStatus: Notifications.IosAuthorizationStatus.AUTHORIZED,
      }),
    );

    const result = await requestPermissions();

    expect(result).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('returns false without prompting when denied and cannot ask again', async () => {
    mockGetPermissions.mockResolvedValue(
      permStatus({
        granted: false,
        canAskAgain: false,
        iosStatus: Notifications.IosAuthorizationStatus.DENIED,
      }),
    );

    const result = await requestPermissions();

    expect(result).toBe(false);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });
});
