import { create } from 'zustand';

/**
 * Global UI state slice.
 *
 * Single source of truth for the app-wide ErrorBanner and loading
 * indicators. The ErrorBanner is rendered in the root layout (task 22.1)
 * and shows messages such as "Unable to save changes. Please try again."
 * when a DB write fails (Req 9.5).
 */
export interface UiState {
  /** Current global error banner message, or `null` when hidden. */
  errorBanner: string | null;
  /** General-purpose global loading flag. */
  isLoading: boolean;
  /** Keyed loading flags for tracking independent async operations. */
  loadingByKey: Record<string, boolean>;

  /** Show the global error banner with the given message. */
  setErrorBanner: (message: string) => void;
  /** Hide the global error banner. */
  clearErrorBanner: () => void;

  /** Set the general-purpose global loading flag. */
  setLoading: (loading: boolean) => void;
  /** Set the loading flag for a specific key. */
  setLoadingFor: (key: string, loading: boolean) => void;
  /** Read the loading flag for a specific key (defaults to `false`). */
  isLoadingFor: (key: string) => boolean;
}

export const useUiStore = create<UiState>((set, get) => ({
  errorBanner: null,
  isLoading: false,
  loadingByKey: {},

  setErrorBanner: (message: string) => set({ errorBanner: message }),
  clearErrorBanner: () => set({ errorBanner: null }),

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setLoadingFor: (key: string, loading: boolean) =>
    set((state) => ({
      loadingByKey: { ...state.loadingByKey, [key]: loading },
    })),
  isLoadingFor: (key: string) => get().loadingByKey[key] ?? false,
}));
