// Feature: plant-parent, Task 17.3 — Unit tests for the Care screen.
//
// Validates: Requirements 3.1, 3.7, 3.8, 4.1, 4.7, 5.1, 5.7
//
// These tests render the real `CareScreen`. The platform / data edges are
// mocked so no native SQLite or notification APIs are touched:
//   - `expo-router` so `useLocalSearchParams` yields a fixed plantId,
//   - `@/hooks/useCareSchedule` (live read) so we control the schedules /
//     status the screen renders, and can simulate a re-render after a write,
//   - `@/stores/careStore` so the write actions (`saveSchedule`,
//     `toggleReminder`, `recordCompletion`) are spy functions exposed through
//     the selector form the screen uses,
//   - `@/services/NotificationService` so `requestPermissions` is controllable,
//   - `@/db` so importing the REAL `CareService` (for the pure
//     `validateInterval` + MIN/MAX constants) never opens native sqlite.
//
// NOTE: @testing-library/react-native v14 runs under the React 19 concurrent
// renderer, so `render` / `fireEvent.*` are awaited and effect-driven state
// (the on-mount permission check) is asserted inside `waitFor(...)`.

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// `@/constants/theme` pulls in `@/global.css` for web styling, which Jest's JS
// transformer can't parse. Stub it out — no runtime behaviour here.
jest.mock('@/global.css', () => ({}), { virtual: true });

// JungleBackground pulls in reanimated + expo-linear-gradient; render it as a
// passthrough so the screen renders deterministically without native modules.
jest.mock('@/components/JungleBackground', () => ({
  JungleBackground: ({ children }: any) => children,
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ plantId: 'p1' }),
  useRouter: () => ({ back: jest.fn() }),
}));

// Mutable holder so a test can swap the live-hook return between renders (used
// to simulate the screen re-rendering after a completion is recorded).
const mockCareScheduleHolder = {
  value: {
    schedules: [] as unknown[],
    isLoading: false,
    error: undefined as Error | undefined,
  },
};
jest.mock('@/hooks/useCareSchedule', () => ({
  __esModule: true,
  useCareSchedule: () => mockCareScheduleHolder.value,
}));

// Store action spies. The screen reads each action via a selector:
//   useCareStore((state) => state.saveSchedule)
// so the mock implements the selector form.
const mockSaveSchedule = jest.fn();
const mockToggleReminder = jest.fn();
const mockRecordCompletion = jest.fn();
jest.mock('@/stores/careStore', () => ({
  __esModule: true,
  useCareStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      saveSchedule: mockSaveSchedule,
      toggleReminder: mockToggleReminder,
      recordCompletion: mockRecordCompletion,
      error: null,
    }),
}));

const mockRequestPermissions = jest.fn();
jest.mock('@/services/NotificationService', () => ({
  __esModule: true,
  NotificationService: {
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
  },
}));

// Prevent the real CareService (imported for the pure validateInterval +
// MIN/MAX constants) from opening native sqlite when it imports `../db`.
// `db.select(...).from(...).where(...)` is also evaluated by the screen's
// plant-environment live query, so the stub must be chainable.
jest.mock('@/db', () => {
  const chain = { from: () => ({ where: () => ({}) }) };
  return { db: { select: () => chain } };
});

// The screen reads the plant's indoor/outdoor environment via a Drizzle live
// query; mock it to a stable outdoor result so the weather chip gating renders.
jest.mock('drizzle-orm/expo-sqlite', () => ({
  __esModule: true,
  useLiveQuery: () => ({ data: [{ environment: 'outdoor' }], error: undefined, updatedAt: 1 }),
}));

import CareScreen from '@/app/plants/[plantId]/care';

const INTERVAL_ERROR = 'Enter a whole number from 1 to 365.';

/** Build a ScheduleWithStatus-shaped object for the mocked live hook. */
function makeStatus(overrides: {
  id?: string;
  type?: string;
  intervalDays?: number;
  reminderEnabled?: boolean;
  nextDueAt?: Date;
  lastCompletedAt?: Date | null;
}) {
  const {
    id = 's1',
    type = 'watering',
    intervalDays = 7,
    reminderEnabled = true,
    nextDueAt = new Date(2024, 0, 8),
    lastCompletedAt = new Date(2024, 0, 1),
  } = overrides;
  return {
    schedule: {
      id,
      plantId: 'p1',
      type,
      intervalDays,
      reminderEnabled,
      nextDueAt,
      preferredHour: 8,
      preferredMinute: 0,
    },
    completions: [],
    lastCompletedAt,
    isDueToday: false,
    isOverdue: false,
  };
}

/** Reset the live-hook return to a loaded state with the given schedules. */
function setSchedules(schedules: unknown[]) {
  mockCareScheduleHolder.value = { schedules, isLoading: false, error: undefined };
}

beforeEach(() => {
  jest.clearAllMocks();
  setSchedules([]);
  mockSaveSchedule.mockResolvedValue(undefined);
  mockToggleReminder.mockResolvedValue(undefined);
  mockRecordCompletion.mockResolvedValue(undefined);
  // Permission granted by default so the prompt is hidden unless a test opts in.
  mockRequestPermissions.mockResolvedValue(true);
});

describe('CareScreen', () => {
  describe('interval validation (Req 3.1, 4.1, 5.1)', () => {
    it('shows an inline error and disables Save for an out-of-range low value (0)', async () => {
      await render(<CareScreen />);
      await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());

      const intervalInput = screen.getAllByLabelText('Repeat every (days)')[0];
      await fireEvent.changeText(intervalInput, '0');

      expect(screen.getByText(INTERVAL_ERROR)).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled();
    });

    it('shows an inline error and disables Save for an out-of-range high value (366)', async () => {
      await render(<CareScreen />);
      await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());

      const intervalInput = screen.getAllByLabelText('Repeat every (days)')[0];
      await fireEvent.changeText(intervalInput, '366');

      expect(screen.getByText(INTERVAL_ERROR)).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled();
    });

    it('shows an inline error and disables Save for a non-numeric value', async () => {
      await render(<CareScreen />);
      await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());

      const intervalInput = screen.getAllByLabelText('Repeat every (days)')[0];
      await fireEvent.changeText(intervalInput, 'abc');

      expect(screen.getByText(INTERVAL_ERROR)).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled();
    });

    it('clears the error and enables Save for a valid value (7)', async () => {
      await render(<CareScreen />);
      await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());

      const intervalInput = screen.getAllByLabelText('Repeat every (days)')[0];
      // First make it invalid, then valid, to prove the error is cleared.
      await fireEvent.changeText(intervalInput, '0');
      expect(screen.getByText(INTERVAL_ERROR)).toBeTruthy();

      await fireEvent.changeText(intervalInput, '7');
      expect(screen.queryByText(INTERVAL_ERROR)).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Save' })[0]).not.toBeDisabled();
    });
  });

  describe('reminder toggle (Req 3.8, 4.7, 5.7)', () => {
    it('calls toggleReminder for an existing schedule when switched off', async () => {
      setSchedules([makeStatus({ id: 's1', type: 'watering', reminderEnabled: true })]);

      await render(<CareScreen />);
      await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());

      const wateringSwitch = screen.getByLabelText('Watering reminder');
      await fireEvent(wateringSwitch, 'valueChange', false);

      await waitFor(() => {
        expect(mockToggleReminder).toHaveBeenCalledWith('s1', false);
      });
      // Turning the reminder off surfaces the "Reminder disabled" indicator.
      expect(screen.getByText('Reminder disabled')).toBeTruthy();
    });
  });

  describe('mark-done updates the last-completed display (Req 3.7 flow / completions)', () => {
    it('calls recordCompletion and updates the displayed last-completed date', async () => {
      setSchedules([
        makeStatus({
          id: 's1',
          type: 'watering',
          lastCompletedAt: new Date(2024, 0, 1),
          nextDueAt: new Date(2024, 0, 15),
        }),
      ]);

      await render(<CareScreen />);
      await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());

      // Initial last-completed date is shown.
      expect(screen.getByText('01/01/2024')).toBeTruthy();

      await fireEvent.press(screen.getByLabelText('Mark watering as done'));
      await waitFor(() => expect(mockRecordCompletion).toHaveBeenCalledWith('s1'));

      // Simulate the live hook re-rendering with the new completion date.
      setSchedules([
        makeStatus({
          id: 's1',
          type: 'watering',
          lastCompletedAt: new Date(2024, 0, 8),
          nextDueAt: new Date(2024, 0, 15),
        }),
      ]);
      await screen.rerender(<CareScreen />);

      await waitFor(() => {
        expect(screen.getByText('08/01/2024')).toBeTruthy();
      });
    });
  });

  describe('notification permission prompt (Req 3.7)', () => {
    it('renders the in-app prompt and Open Settings button when permission is denied', async () => {
      mockRequestPermissions.mockResolvedValue(false);

      await render(<CareScreen />);

      await waitFor(() => {
        expect(screen.getByText('Notifications are off')).toBeTruthy();
      });
      expect(screen.getByRole('button', { name: 'Open Settings' })).toBeTruthy();
    });

    it('does not render the prompt when permission is granted', async () => {
      mockRequestPermissions.mockResolvedValue(true);

      await render(<CareScreen />);
      await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalled());

      expect(screen.queryByText('Notifications are off')).toBeNull();
    });
  });
});
