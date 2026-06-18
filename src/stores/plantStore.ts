import { create } from 'zustand';

import {
  PlantService,
  type Plant,
  type CreatePlantInput,
  type UpdatePlantInput,
} from '../services/PlantService';

/**
 * Imperative plant state slice.
 *
 * This store owns the imperative/optimistic side of plant data: it drives
 * loading and error UI for create/update/delete actions and keeps a working
 * copy of the active plant list in `plants`. It complements the reactive
 * `usePlants` hook (`hooks/usePlants.ts`), which reads plants via Drizzle live
 * queries — the two are intended to be used side by side, not as replacements
 * for one another.
 *
 * All actions delegate to {@link PlantService} without passing a database
 * argument so the service uses the shared on-device SQLite singleton. On any
 * service failure the store records a user-friendly `error` message and leaves
 * the in-memory `plants` array unchanged so state stays consistent.
 *
 * Requirements: 2.6, 2.7, 1.8
 */
export interface PlantState {
  /** Active (non-deleted) plants loaded into memory. */
  plants: Plant[];
  /** True while an async action is in flight. */
  isLoading: boolean;
  /** Last user-friendly error message, or `null` when there is none. */
  error: string | null;

  /** Load all active plants from the service into `plants`. */
  loadPlants: () => Promise<void>;
  /** Create a plant, add it to `plants`, and return the created record. */
  addPlant: (input: CreatePlantInput) => Promise<Plant | undefined>;
  /** Update a plant and replace the matching entry in `plants`. */
  updatePlant: (id: string, input: UpdatePlantInput) => Promise<Plant | undefined>;
  /** Delete a plant and remove it from `plants`. */
  removePlant: (id: string) => Promise<void>;
}

/** Extract a user-friendly message from an unknown thrown value. */
function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export const usePlantStore = create<PlantState>((set, get) => ({
  plants: [],
  isLoading: false,
  error: null,

  loadPlants: async () => {
    set({ isLoading: true, error: null });
    try {
      const plants = await PlantService.listPlants();
      set({ plants, isLoading: false, error: null });
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to load plants. Please try again.'),
      });
    }
  },

  addPlant: async (input: CreatePlantInput) => {
    set({ isLoading: true, error: null });
    try {
      const created = await PlantService.createPlant(input);
      set((state) => ({
        plants: [...state.plants, created],
        isLoading: false,
        error: null,
      }));
      return created;
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to add plant. Please try again.'),
      });
      return undefined;
    }
  },

  updatePlant: async (id: string, input: UpdatePlantInput) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await PlantService.updatePlant(id, input);
      set((state) => ({
        plants: state.plants.map((plant) => (plant.id === id ? updated : plant)),
        isLoading: false,
        error: null,
      }));
      return updated;
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to save changes. Please try again.'),
      });
      return undefined;
    }
  },

  removePlant: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await PlantService.deletePlant(id);
      set((state) => ({
        plants: state.plants.filter((plant) => plant.id !== id),
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: toErrorMessage(error, 'Unable to delete plant. Please try again.'),
      });
    }
  },
}));
