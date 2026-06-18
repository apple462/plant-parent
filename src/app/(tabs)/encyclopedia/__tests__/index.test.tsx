/**
 * Unit tests for the EncyclopediaListScreen (`src/app/(tabs)/encyclopedia/index.tsx`).
 *
 * Covers Req 7.3 and 7.7:
 *  - real-time filtering: typing in the search field filters the list so only
 *    matching entries render;
 *  - clear restores the full list: clearing the query shows all entries again;
 *  - no-results message: a query matching nothing renders "No results found".
 *
 * The REAL `EncyclopediaService` is used (it reads the bundled `encyclopedia.json`;
 * it is pure with no native dependencies), so the search/filter behaviour is
 * exercised for real. The real `Input` primitive from `@/components/ui` is also
 * used. Only `expo-router` is mocked, since the screen imports `{ router }` and
 * calls `router.push` on row press.
 */
import { fireEvent, render } from '@testing-library/react-native';

import EncyclopediaListScreen from '../index';

// --- Mocks -----------------------------------------------------------------

// The screen imports `{ router }` from 'expo-router' and calls `router.push`.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// The screen wraps its content in `<JungleBackground>`, which pulls in
// react-native-reanimated and expo-linear-gradient. Those native-backed
// dependencies are irrelevant to the search/filter behaviour under test, so the
// backdrop is reduced to a transparent passthrough that just renders children.
jest.mock('@/components/JungleBackground', () => ({
  JungleBackground: ({ children }: any) => children,
}));

// --- Tests -----------------------------------------------------------------

describe('EncyclopediaListScreen', () => {
  it('filters the list in real time as the user types (Req 7.3)', async () => {
    const { getByText, getByLabelText, queryByText } = await render(<EncyclopediaListScreen />);

    // Full list initially renders a variety of entries.
    expect(getByText('Snake Plant')).toBeTruthy();
    expect(getByText('Golden Pothos')).toBeTruthy();

    // Typing "snake" should leave only matching entries.
    await fireEvent.changeText(getByLabelText('Search'), 'snake');

    // The matching entry is still shown...
    expect(getByText('Snake Plant')).toBeTruthy();
    // ...while a non-matching entry has been filtered out.
    expect(queryByText('Golden Pothos')).toBeNull();
  });

  it('renders all matching entries for a multi-match query (Req 7.3)', async () => {
    const { getByText, getByLabelText, queryByText } = await render(<EncyclopediaListScreen />);

    await fireEvent.changeText(getByLabelText('Search'), 'monstera');

    // "monstera" matches three species by common or scientific name.
    expect(getByText('Swiss Cheese Plant')).toBeTruthy(); // Monstera deliciosa
    expect(getByText('Swiss Cheese Vine')).toBeTruthy(); // Monstera adansonii
    expect(getByText('Monstera Obliqua')).toBeTruthy(); // Monstera obliqua

    // An unrelated entry is excluded.
    expect(queryByText('Snake Plant')).toBeNull();
  });

  it('restores the full list when the query is cleared (Req 7.3)', async () => {
    const { getByText, getByLabelText, queryByText } = await render(<EncyclopediaListScreen />);

    const search = getByLabelText('Search');

    // Filter down so "Golden Pothos" is no longer shown.
    await fireEvent.changeText(search, 'snake');
    expect(queryByText('Golden Pothos')).toBeNull();

    // Clearing the query restores the full, unfiltered collection.
    await fireEvent.changeText(search, '');
    expect(getByText('Golden Pothos')).toBeTruthy();
    expect(getByText('Snake Plant')).toBeTruthy();
  });

  it('shows "No results found" when nothing matches the query (Req 7.7)', async () => {
    const { getByText, getByLabelText, queryByText } = await render(<EncyclopediaListScreen />);

    await fireEvent.changeText(getByLabelText('Search'), 'zzzznotaplant');

    // The empty-state message replaces the list.
    expect(getByText('No results found')).toBeTruthy();
    // No result rows are rendered.
    expect(queryByText('Snake Plant')).toBeNull();
    expect(queryByText('Golden Pothos')).toBeNull();
  });
});
