import { useUiStore } from '../uiStore';

// Helper to reset the store to a known clean state before each test.
const resetStore = () =>
  useUiStore.setState({
    errorBanner: null,
    isLoading: false,
    loadingByKey: {},
  });

describe('uiStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('error banner', () => {
    it('starts hidden (errorBanner is null)', () => {
      expect(useUiStore.getState().errorBanner).toBeNull();
    });

    it('setErrorBanner stores the message', () => {
      useUiStore.getState().setErrorBanner('Unable to save changes. Please try again.');
      expect(useUiStore.getState().errorBanner).toBe(
        'Unable to save changes. Please try again.'
      );
    });

    it('clearErrorBanner resets the message to null', () => {
      useUiStore.getState().setErrorBanner('boom');
      useUiStore.getState().clearErrorBanner();
      expect(useUiStore.getState().errorBanner).toBeNull();
    });
  });

  describe('loading state', () => {
    it('starts with isLoading false', () => {
      expect(useUiStore.getState().isLoading).toBe(false);
    });

    it('setLoading toggles the global flag', () => {
      useUiStore.getState().setLoading(true);
      expect(useUiStore.getState().isLoading).toBe(true);
      useUiStore.getState().setLoading(false);
      expect(useUiStore.getState().isLoading).toBe(false);
    });

    it('setLoadingFor tracks independent keyed flags', () => {
      useUiStore.getState().setLoadingFor('plants', true);
      expect(useUiStore.getState().isLoadingFor('plants')).toBe(true);
      expect(useUiStore.getState().isLoadingFor('care')).toBe(false);

      useUiStore.getState().setLoadingFor('care', true);
      expect(useUiStore.getState().isLoadingFor('plants')).toBe(true);
      expect(useUiStore.getState().isLoadingFor('care')).toBe(true);

      useUiStore.getState().setLoadingFor('plants', false);
      expect(useUiStore.getState().isLoadingFor('plants')).toBe(false);
      expect(useUiStore.getState().isLoadingFor('care')).toBe(true);
    });

    it('isLoadingFor defaults to false for unknown keys', () => {
      expect(useUiStore.getState().isLoadingFor('nope')).toBe(false);
    });
  });
});
