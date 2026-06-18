/**
 * Unit tests for the VirtualJungle home screen (`src/app/(tabs)/index.tsx`).
 *
 * Covers Req 2.1, 2.4, 2.6, 2.7:
 *  - renders the plant grid (PlantCard items) when plants exist;
 *  - shows the empty state with an "Add Plant" CTA when there are no plants;
 *  - shows the loading state while `usePlants` reports `isLoading`;
 *  - shows the error state with a Retry button when `usePlants` returns an error;
 *  - shows the correct "tasks due today" count in the summary header.
 *
 * Native/data dependencies are mocked so the screen renders deterministically
 * without opening native SQLite or pulling in native UI modules:
 *  - `@/hooks/usePlants` — controls `{ plants, isLoading, error }` per test;
 *  - `drizzle-orm/expo-sqlite`'s `useLiveQuery` — controls the `care_schedules`
 *    rows used to compute the due-today count;
 *  - `@/db` — chainable stub so `db.select(...).from(...)` doesn't open SQLite;
 *  - `expo-router`'s `useRouter`;
 *  - `react-native-safe-area-context`, `@/components/PlantCard`, and the
 *    `@/components/ui` barrel — lightweight stubs.
 *
 * The real `@/utils/dateUtils` and `@/db/schema` (the `care_schedules` table
 * object) are used, so the due-today derivation under test is exercised for real.
 */
import { fireEvent, render } from '@testing-library/react-native';

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { usePlants } from '@/hooks/usePlants';
import type { Plant } from '@/services/PlantService';

import VirtualJungleScreen from '../index';

// --- Mocks -----------------------------------------------------------------

jest.mock('@/hooks/usePlants', () => ({ usePlants: jest.fn() }));

// JungleBackground pulls in reanimated + expo-linear-gradient; render it as a
// passthrough so the screen renders deterministically without native modules.
jest.mock('@/components/JungleBackground', () => ({
  JungleBackground: ({ children }: any) => children,
}));

// useUserName reads AsyncStorage; pin it to null so the header is deterministic
// ("My Jungle") without touching native storage.
jest.mock('@/hooks/useUserName', () => ({ useUserName: () => null }));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: jest.fn(() => ({ data: [], error: undefined, updatedAt: Date.now() })),
}));

// `db` is only used by the screen to build a Drizzle query that is then handed
// to the (mocked) `useLiveQuery`. A chainable stub keeps it from touching native
// SQLite while letting `db.select(...).from(...)` evaluate without throwing.
jest.mock('@/db', () => ({
  db: { select: jest.fn(() => ({ from: jest.fn(() => ({})) })) },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: any) => React.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Lightweight PlantCard stub: renders a queryable testID + the plant name and
// forwards onPress, avoiding expo-image and the CareTaskBadge tree.
jest.mock('@/components/PlantCard', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    PlantCard: ({ plant, onPress }: any) =>
      React.createElement(
        Pressable,
        { onPress, testID: `plant-card-${plant.id}` },
        React.createElement(Text, null, plant.displayName),
      ),
  };
});

// Lightweight UI primitives used by the screen (Button + LoadingSpinner).
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Pressable, Text, View, ActivityIndicator } = require('react-native');
  return {
    Button: ({ label, onPress }: any) =>
      React.createElement(
        Pressable,
        { onPress, accessibilityRole: 'button', testID: `button-${label}` },
        React.createElement(Text, null, label),
      ),
    LoadingSpinner: ({ label }: any) =>
      React.createElement(
        View,
        { accessibilityRole: 'progressbar', testID: 'loading-spinner' },
        React.createElement(ActivityIndicator, null),
        label ? React.createElement(Text, null, label) : null,
      ),
  };
});

// --- Helpers ---------------------------------------------------------------

const mockUsePlants = usePlants as jest.MockedFunction<typeof usePlants>;
const mockUseLiveQuery = useLiveQuery as jest.MockedFunction<typeof useLiveQuery>;

function makePlant(id: string, displayName: string): Plant {
  return {
    id,
    displayName,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };
}

/** Set the rows returned by the (mocked) care_schedules live query. */
function setScheduleRows(rows: { plantId: string; nextDueAt: number | null }[]): void {
  mockUseLiveQuery.mockReturnValue({
    data: rows,
    error: undefined,
    updatedAt: Date.now(),
  } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no care schedules unless a test overrides this.
  setScheduleRows([]);
});

// --- Tests -----------------------------------------------------------------

describe('VirtualJungleScreen', () => {
  it('renders the plant grid with a PlantCard for each plant (Req 2.1)', async () => {
    const plants = [makePlant('p1', 'Fern'), makePlant('p2', 'Cactus')];
    mockUsePlants.mockReturnValue({ plants, isLoading: false, error: undefined });

    const { getByTestId, getByText } = await render(<VirtualJungleScreen />);

    expect(getByTestId('plant-card-p1')).toBeTruthy();
    expect(getByTestId('plant-card-p2')).toBeTruthy();
    expect(getByText('Fern')).toBeTruthy();
    expect(getByText('Cactus')).toBeTruthy();
    // Summary reflects the active plant count.
    expect(getByText('2 plants')).toBeTruthy();
  });

  it('shows the empty state with an "Add Plant" CTA when there are no plants (Req 2.6)', async () => {
    mockUsePlants.mockReturnValue({ plants: [], isLoading: false, error: undefined });

    const { getByText, queryByTestId } = await render(<VirtualJungleScreen />);

    expect(getByText('Your jungle is empty')).toBeTruthy();
    expect(getByText('Add Plant')).toBeTruthy();
    // No plant cards are rendered.
    expect(queryByTestId(/^plant-card-/)).toBeNull();
  });

  it('shows the loading state while plants are loading (Req 2.7)', async () => {
    mockUsePlants.mockReturnValue({ plants: [], isLoading: true, error: undefined });

    const { getByTestId, getByText, queryByText } = await render(<VirtualJungleScreen />);

    expect(getByTestId('loading-spinner')).toBeTruthy();
    expect(getByText(/Loading your jungle/)).toBeTruthy();
    // Neither the grid nor the empty state is shown while loading.
    expect(queryByText('Your jungle is empty')).toBeNull();
  });

  it('shows the error state with a pressable Retry button when the hook errors (Req 2.7)', async () => {
    mockUsePlants.mockReturnValue({
      plants: [],
      isLoading: false,
      error: new Error('load failed'),
    });

    const { getByText } = await render(<VirtualJungleScreen />);

    expect(getByText("Couldn't load your jungle")).toBeTruthy();
    const retry = getByText('Retry');
    expect(retry).toBeTruthy();
    // The Retry button is pressable (the press handler runs without throwing).
    await expect(fireEvent.press(retry)).resolves.toBeUndefined();
  });

  it('shows the correct "tasks due today" count in the summary (Req 2.4)', async () => {
    mockUsePlants.mockReturnValue({
      plants: [makePlant('p1', 'Fern')],
      isLoading: false,
      error: undefined,
    });

    // Two schedules due today, one far in the future, one with no due date.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const todayMs = noon.getTime();
    const futureMs = todayMs + 10 * 24 * 60 * 60 * 1000;

    setScheduleRows([
      { plantId: 'p1', nextDueAt: todayMs },
      { plantId: 'p2', nextDueAt: todayMs },
      { plantId: 'p3', nextDueAt: futureMs },
      { plantId: 'p4', nextDueAt: null },
    ]);

    const { getByText } = await render(<VirtualJungleScreen />);

    expect(getByText('2 tasks due today')).toBeTruthy();
  });

  it('uses the singular label when exactly one task is due today (Req 2.4)', async () => {
    mockUsePlants.mockReturnValue({
      plants: [makePlant('p1', 'Fern')],
      isLoading: false,
      error: undefined,
    });

    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    setScheduleRows([{ plantId: 'p1', nextDueAt: noon.getTime() }]);

    const { getByText } = await render(<VirtualJungleScreen />);

    expect(getByText('1 task due today')).toBeTruthy();
  });
});
