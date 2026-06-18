// Feature: plant-parent, Task 20.2 — Unit tests for the Symptom Checker screen.
//
// Validates: Requirements 8.2, 8.3, 8.4
//
// These tests render the real `SymptomCheckerScreen`, which embeds the
// self-contained `SymptomChecker` decision-tree walker. The walker reads the
// REAL bundled `src/data/symptomTree.json` and the REAL pure
// `traverseSymptomTree` util, so the flow exercises the actual decision tree:
// we drive it by pressing real answer labels along known paths.
//
// Only the platform edges are mocked:
//   - `expo-router` so `useLocalSearchParams` yields a fixed plantId, and
//   - `@/db` so "Save to Profile" performs no native SQLite write.
//
// NOTE: @testing-library/react-native v14 makes `render` and `fireEvent.*`
// asynchronous (React 19 concurrent renderer), so every interaction is awaited.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

// `@/constants/theme` pulls in `@/global.css` for web styling, which Jest's
// JS transformer can't parse. Stub it out — it has no runtime behaviour here.
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

jest.mock('@/db', () => ({
  db: {
    insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
  },
}));

import SymptomCheckerScreen from '@/app/plants/[plantId]/symptom-checker';
import { db } from '@/db';

// Known answer labels from the real symptomTree.json.
const ROOT_QUESTION = "Which symptom best describes what you're seeing on your plant?";
const ANSWER_YELLOWING = 'Leaves turning yellow';
const SECOND_QUESTION = 'Feel the soil. How does it feel?';
const ANSWER_WET = "Wet or soggy, hasn't dried out in days";
const ANSWER_LOWER_LEAVES = 'Lower or older leaves yellowing first, soil stays wet';
const ANSWER_UNCLEAR = "Nothing clear, can't tell what's wrong";

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SymptomCheckerScreen', () => {
  it('renders the first question with its answer options (Req 8.2)', async () => {
    await render(<SymptomCheckerScreen />);

    // Root question text is shown.
    expect(screen.getByText(ROOT_QUESTION)).toBeTruthy();
    // Representative answer options from the root node are rendered.
    expect(screen.getByText(ANSWER_YELLOWING)).toBeTruthy();
    expect(screen.getByText('Plant drooping or wilting')).toBeTruthy();
  });

  it('advances the tree when an answer is selected (Req 8.2)', async () => {
    await render(<SymptomCheckerScreen />);

    await fireEvent.press(screen.getByText(ANSWER_YELLOWING));

    // The next question and its options appear; the root question is gone.
    expect(screen.getByText(SECOND_QUESTION)).toBeTruthy();
    expect(screen.getByText(ANSWER_WET)).toBeTruthy();
    expect(screen.queryByText(ROOT_QUESTION)).toBeNull();
  });

  it('shows a conclusive diagnosis (cause + action + Save to Profile) at a conclusive leaf (Req 8.3)', async () => {
    await render(<SymptomCheckerScreen />);

    // Path: yellowing -> wet soil -> lower leaves yellowing => leaf_overwater.
    await fireEvent.press(screen.getByText(ANSWER_YELLOWING));
    await fireEvent.press(screen.getByText(ANSWER_WET));
    await fireEvent.press(screen.getByText(ANSWER_LOWER_LEAVES));

    const card = screen.getByTestId('diagnosis-result');
    // Cause from the real tree's leaf_overwater node.
    expect(within(card).getByText('Overwatering')).toBeTruthy();
    // Recommended action text.
    expect(within(card).getByText(/Allow the soil to dry out fully/)).toBeTruthy();
    // Save to Profile button.
    expect(within(card).getByText('Save to Profile')).toBeTruthy();
  });

  it('persists the diagnosis and relabels the button when Save to Profile is pressed (Req 8.3)', async () => {
    await render(<SymptomCheckerScreen />);

    await fireEvent.press(screen.getByText(ANSWER_YELLOWING));
    await fireEvent.press(screen.getByText(ANSWER_WET));
    await fireEvent.press(screen.getByText(ANSWER_LOWER_LEAVES));

    const card = screen.getByTestId('diagnosis-result');
    await fireEvent.press(within(card).getByText('Save to Profile'));

    // A row is inserted into symptom_notes.
    await waitFor(() => {
      expect(db.insert).toHaveBeenCalledTimes(1);
    });
    // After a successful save the button relabels to "Saved".
    await waitFor(() => {
      expect(within(screen.getByTestId('diagnosis-result')).getByText('Saved')).toBeTruthy();
    });
  });

  it('shows the "No diagnosis found" message at an inconclusive dead end (Req 8.4)', async () => {
    await render(<SymptomCheckerScreen />);

    // Path: yellowing -> wet soil -> nothing clear => deadend_inconclusive.
    await fireEvent.press(screen.getByText(ANSWER_YELLOWING));
    await fireEvent.press(screen.getByText(ANSWER_WET));
    await fireEvent.press(screen.getByText(ANSWER_UNCLEAR));

    const card = screen.getByTestId('no-diagnosis-result');
    expect(within(card).getByText('No diagnosis found')).toBeTruthy();
    // No conclusive diagnosis card / Save button is shown.
    expect(screen.queryByTestId('diagnosis-result')).toBeNull();
    expect(screen.queryByText('Save to Profile')).toBeNull();
  });
});
