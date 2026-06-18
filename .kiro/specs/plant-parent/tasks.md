# Implementation Plan: Plant Parent

## Overview

Implement a local-first React Native (Expo) app for plant cataloguing, care reminders, and growth journaling. The stack is TypeScript, Expo Router, Drizzle ORM + expo-sqlite, Zustand, expo-notifications, expo-file-system, and fast-check for property-based tests. All 17 correctness properties from the design document map to PBT sub-tasks. Tasks progress from scaffolding → data layer → services → navigation → screens → integration.

---

## Tasks

- [x] 1. Scaffold project, install dependencies, and establish folder structure
  - Initialise a new Expo project with `expo-router` template (TypeScript)
  - Install production dependencies: `drizzle-orm`, `expo-sqlite`, `expo-notifications`, `expo-file-system`, `expo-image-picker`, `zustand`, `expo-linking`, `expo-constants`
  - Install dev/test dependencies: `drizzle-kit`, `jest`, `jest-expo`, `@testing-library/react-native`, `fast-check`, `ts-jest`
  - Create the full `src/` directory tree from the design module structure: `app/`, `db/`, `services/`, `stores/`, `hooks/`, `components/ui/`, `utils/`, `data/`, `constants/`
  - _Requirements: 9.1, 9.2, 9.4_

- [x] 2. Create constants, theme, and feature flags
  - [x] 2.1 Create `constants/featureFlags.ts` with `PLANT_IDENTIFIER_ENABLED`, `WEATHER_SERVICE_ENABLED`, `SUPABASE_SYNC_ENABLED` all set to `false`
    - _Requirements: 11.1, 12.1_
  - [x] 2.2 Create `constants/theme.ts` with colour palette, typography scale, spacing tokens, and border radius values
    - _Requirements: 2.2, 6.6_

- [x] 3. Define Drizzle schema, generate migrations, and initialise DB client
  - [x] 3.1 Write `db/schema.ts` with all five tables: `plants`, `care_schedules`, `care_completions`, `journal_entries`, `symptom_notes` matching the design data models exactly
    - Include UUID primary keys, foreign key references, soft-delete `deletedAt` on `plants`, Unix-ms timestamp columns
    - _Requirements: 9.1_
  - [x] 3.2 Configure `drizzle.config.ts`, run `drizzle-kit generate` to produce migration files in `db/migrations/`, and write `db/index.ts` to open the expo-sqlite connection and apply migrations on first run
    - _Requirements: 9.1, 9.3_
  - [x] 3.3 Write integration test: migration runs cleanly on a fresh in-memory SQLite file and all five tables are present
    - _Requirements: 9.1_

- [x] 4. Implement utility functions
  - [x] 4.1 Write `utils/dateUtils.ts` with `formatDDMMYYYY(date: Date): string`, `formatJournalTimestamp(date: Date): string`, `isDueToday(timestamp: number, referenceDate?: Date): boolean`, `isOverdue(timestamp: number, referenceDate?: Date): boolean`, and `computeNextDueDate(completionDate: Date, intervalDays: number, preferredHour?: number, preferredMinute?: number): Date`
    - _Requirements: 2.2, 2.3, 2.8, 3.2, 3.5, 3.6, 4.2, 4.5, 4.6, 5.2, 5.5, 5.6, 6.6_
  - [x] 4.2 Write property test: Property 10 — `formatDDMMYYYY` returns `DD/MM/YYYY` for any valid Date (100 iterations)
    - **Property 10: Date Formatting — DD/MM/YYYY**
    - **Validates: Requirements 2.2, 3.6, 4.6, 5.6**
  - [x] 4.3 Write property test: Property 11 — `isDueToday` returns true iff timestamp is within reference calendar day (100 iterations)
    - **Property 11: isDueToday Predicate**
    - **Validates: Requirements 2.3, 2.8**
  - [x] 4.4 Write property test: Property 13 — `formatJournalTimestamp` returns `DD MMM YYYY, HH:MM` for any valid Date (100 iterations)
    - **Property 13: Journal Timestamp Format**
    - **Validates: Requirements 6.6**
  - [x] 4.5 Write property test: Property 8 — `computeNextDueDate` returns completionDate + intervalDays at (preferredHour, preferredMinute), defaulting to 08:00 (100 iterations)
    - **Property 8: Next-Due-Date Calculation**
    - **Validates: Requirements 3.2, 3.5, 4.2, 4.5, 5.2, 5.5**
  - [x] 4.6 Write `utils/validation.ts` with `validateDisplayName(input: string): ValidationResult` and `validatePhoto(mimeType: string, sizeBytes: number): ValidationResult`
    - _Requirements: 1.1, 1.3, 1.5, 1.9_
  - [x] 4.7 Write property test: Property 1 — display name validation accepts trimmed-length 1–100, rejects empty/whitespace/over-100 (100 iterations)
    - **Property 1: Display Name Validation**
    - **Validates: Requirements 1.1, 1.3, 1.5**
  - [x] 4.8 Write property test: Property 2 — photo validation accepts JPEG/PNG ≤10 MB, rejects all other MIME types and oversized files (100 iterations)
    - **Property 2: Photo Validation**
    - **Validates: Requirements 1.9**

- [x] 5. Implement StorageService
  - [x] 5.1 Write `services/StorageService.ts` implementing the `StorageService` interface: `savePhoto(plantId, uri, filename)` copies source URI into `<DocumentDirectory>/plant-parent/covers/<plantId>.<ext>` or `journal/<plantId>/<entryId>.<ext>` and returns the destination path; `deletePhoto(filePath)` removes the file using expo-file-system
    - Handle file write failures by throwing a typed `StorageError` so callers can display the correct error message
    - _Requirements: 9.2, 6.4, 6.7, 1.6_
  - [x] 5.2 Write unit tests for StorageService with expo-file-system mocked: verify correct path construction, verify write failure throws `StorageError`, verify delete failure logs silently
    - _Requirements: 9.2, 6.4_

- [x] 6. Implement PlantService
  - [x] 6.1 Write `services/PlantService.ts` implementing `createPlant`, `updatePlant`, `deletePlant`, `getPlant`, `listPlants` using Drizzle queries against the `plants` table; deletePlant performs a cascade delete of `care_schedules`, `care_completions`, `journal_entries`, and `symptom_notes` rows for the plant, then calls `StorageService.deletePhoto` for each journal photo (tolerating file failures per Req 1.6)
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 1.8, 9.1, 9.5_
  - [x] 6.2 Write property test: Property 3 — create-then-get round-trip preserves displayName, speciesName, locationLabel and returns a unique non-empty id (100 iterations)
    - **Property 3: Plant Creation Round-Trip**
    - **Validates: Requirements 1.2, 1.4**
  - [x] 6.3 Write property test: Property 4 — updatePlant only changes supplied fields; all other fields retain original values (100 iterations)
    - **Property 4: Plant Update Preserves Only Changed Fields**
    - **Validates: Requirements 1.5**
  - [x] 6.4 Write property test: Property 5 — deletePlant removes plant from listPlants, makes getPlant return null, and leaves no orphan care_schedules or journal_entries rows (100 iterations)
    - **Property 5: Plant Deletion Cascades Completely**
    - **Validates: Requirements 1.6**
  - [x] 6.5 Write property test: Property 6 — active plant count after any sequence of creates and deletes always equals creates-minus-deletes (100 iterations)
    - **Property 6: Active Plant Count Invariant**
    - **Validates: Requirements 1.8**

- [x] 7. Implement CareService
  - [x] 7.1 Write `services/CareService.ts` implementing `saveSchedule`, `markComplete`, `disableReminder`, `enableReminder`, `getNextDueDate`, `getLastCompletionDate` against `care_schedules` and `care_completions` tables; `markComplete` calls `NotificationService.rescheduleAfterCompletion` and updates `nextDueAt` in the DB
    - _Requirements: 3.1–3.8, 4.1–4.7, 5.1–5.7, 9.1, 9.5_
  - [x] 7.2 Write property test: Property 7 — schedule validation accepts intervalDays in [1, 365], rejects 0, negatives, and >365 (100 iterations)
    - **Property 7: Care Schedule Interval Validation**
    - **Validates: Requirements 3.1, 4.1, 5.1**
  - [x] 7.3 Write property test: Property 9 — markComplete round-trip: querying care_completions for the schedule returns at least one record with completedAt matching input timestamp to millisecond precision (100 iterations)
    - **Property 9: Care Completion Round-Trip**
    - **Validates: Requirements 3.4, 4.4, 5.4**
  - [x] 7.4 Write unit tests for CareService: schedule creation, next-due-date update on completion, reminder enable/disable, getLastCompletionDate returns null when no completions exist
    - _Requirements: 3.2, 3.5, 3.8, 4.2, 4.7, 5.2, 5.7_

- [x] 8. Implement NotificationService
  - [x] 8.1 Write `services/NotificationService.ts` implementing `requestPermissions`, `scheduleReminder`, `cancelReminder`, `rescheduleAfterCompletion` using `expo-notifications`; use `DateTriggerInput` (single-shot) per the notification scheduling strategy in the design; persist `notificationId` back into `care_schedules.notificationId`
    - _Requirements: 3.2, 3.3, 3.5, 3.7, 4.2, 4.3, 4.5, 5.2, 5.3, 5.5, 10.4_
  - [x] 8.2 Write unit tests for NotificationService with expo-notifications mocked: verify scheduleReminder calls scheduleNotificationAsync with the correct DateTriggerInput, verify cancelReminder calls cancelScheduledNotificationAsync, verify permission-denied branch returns false
    - _Requirements: 3.7, 10.4_

- [x] 9. Implement JournalService
  - [x] 9.1 Write `services/JournalService.ts` implementing `addEntry`, `deleteEntry`, `listEntries`; `addEntry` calls `StorageService.savePhoto` first — if it throws, abort without writing to DB (atomicity per Property 14); `deleteEntry` removes the DB record first, then calls `StorageService.deletePhoto` tolerating failures; `listEntries` returns entries sorted descending by `capturedAt`
    - _Requirements: 6.1, 6.3, 6.4, 6.7, 9.1, 9.2_
  - [x] 9.2 Write property test: Property 12 — any array of JournalEntry objects sorted for display is in descending capturedAt order (100 iterations)
    - **Property 12: Journal Entries Are Reverse-Chronological**
    - **Validates: Requirements 6.1**
  - [x] 9.3 Write property test: Property 14 — when file write succeeds the DB record is present; when file write is simulated to fail no DB record is created (100 iterations)
    - **Property 14: Journal Entry Write Atomicity**
    - **Validates: Requirements 6.4**
  - [x] 9.4 Write unit tests for JournalService: addEntry happy path, addEntry with file failure does not insert DB row, deleteEntry with file failure still removes DB row, listEntries returns reverse-chrono order
    - _Requirements: 6.1, 6.4, 6.7_

- [x] 10. Implement EncyclopediaService and bundle static data
  - [x] 10.1 Create `data/encyclopedia.json` with at least 50 species entries conforming to the `SpeciesEntry` type (id, commonName, scientificName, wateringFrequencyDays, fertilisingFrequencyDays, pruningFrequencyDays, lightRequirement, careSummary)
    - _Requirements: 7.1, 7.2_
  - [x] 10.2 Create `data/symptomTree.json` encoding a decision tree covering the 7 required symptom categories (overwatering, underwatering, root rot, nutrient deficiency, pest infestation, sunlight problems, and at least one dead-end path); include leaf nodes with `conclusive: true/false`, `cause`, and `action` fields
    - _Requirements: 8.2, 8.3, 8.4, 8.7_
  - [x] 10.3 Write `services/EncyclopediaService.ts` implementing `search(query)`, `getById(id)`, `listAll()` over the bundled `encyclopedia.json`; search is case-insensitive substring match on `commonName` and `scientificName`; empty query returns all entries
    - _Requirements: 7.3, 7.4, 7.7_
  - [x] 10.4 Write property test: Property 15 — no false positives and no false negatives in encyclopedia search for any query string, plus empty-query returns full collection (100 iterations)
    - **Property 15: Encyclopedia Search Correctness**
    - **Validates: Requirements 7.3, 7.7**
  - [x] 10.5 Write `utils/notificationUtils.ts` with helper `traverseSymptomTree(tree, answers): TraversalResult` used by the SymptomChecker component
    - _Requirements: 8.2, 8.3, 8.4_
  - [x] 10.6 Write property test: Property 16 — traverseSymptomTree at non-leaf returns exact answer set, at conclusive leaf returns `conclusive=true` with non-empty cause/action, at dead-end returns `conclusive=false` (100 iterations)
    - **Property 16: Symptom Checker Decision Tree Traversal**
    - **Validates: Requirements 8.2, 8.3, 8.4**

- [x] 11. Implement Zustand stores and custom hooks
  - [x] 11.1 Write `stores/plantStore.ts` with Zustand slice: `plants: Plant[]`, `isLoading: boolean`, `error: string | null`, actions `loadPlants`, `addPlant`, `updatePlant`, `removePlant`; wire to `PlantService`
    - _Requirements: 2.6, 2.7, 1.8_
  - [x] 11.2 Write `stores/careStore.ts` with Zustand slice: `schedulesByPlantId: Record<string, CareSchedule[]>`, `completionsByScheduleId: Record<string, CareCompletion[]>`, actions `loadSchedules`, `saveSchedule`, `recordCompletion`, `toggleReminder`; wire to `CareService`
    - _Requirements: 3.1–3.8, 4.1–4.7, 5.1–5.7_
  - [x] 11.3 Write `stores/uiStore.ts` with loading states, `errorBanner: string | null`, `setErrorBanner`, `clearErrorBanner`
    - _Requirements: 9.5, 2.7_
  - [x] 11.4 Write `hooks/usePlants.ts` using `useLiveQuery` from Drizzle to reactively read the `plants` table and expose `plants`, `isLoading`, `error`
    - _Requirements: 2.1, 2.7, 9.4_
  - [x] 11.5 Write `hooks/useCareSchedule.ts` returning live schedules and completions for a given `plantId`, with helper booleans `isDueToday`, `isOverdue` per schedule
    - _Requirements: 2.3, 2.8, 3.6, 4.6, 5.6_
  - [x] 11.6 Write `hooks/useJournal.ts` returning live journal entries for a given `plantId` in reverse-chronological order
    - _Requirements: 6.1_

- [x] 12. Checkpoint — Ensure all service-layer and utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Build reusable UI components
  - [x] 13.1 Create `components/ui/` primitives: `Button.tsx`, `Input.tsx`, `TextArea.tsx`, `ErrorBanner.tsx` (accepts `ErrorCode` enum), `LoadingSpinner.tsx`, `ConfirmationDialog.tsx`, `Toast.tsx`
    - _Requirements: 1.3, 1.5, 9.5, 2.7_
  - [x] 13.2 Create `components/CareTaskBadge.tsx` rendering `due-today`, `overdue`, `upcoming`, or `none` states with distinguishable colour indicators
    - _Requirements: 2.3_
  - [x] 13.3 Create `components/PlantCard.tsx` showing cover photo (or placeholder), display name, next due date formatted as DD/MM/YYYY or "No tasks scheduled", and the `CareTaskBadge`; accept `onPress` handler
    - _Requirements: 2.2, 2.3_
  - [x] 13.4 Create `components/JournalTimeline.tsx` rendering a scrollable reverse-chronological list of `JournalEntry` items each showing the photo, formatted timestamp, and note
    - _Requirements: 6.1, 6.6_
  - [x] 13.5 Create `components/SymptomChecker.tsx` as a self-contained decision-tree walker that reads `symptomTree.json`, renders the current question and answer options, and calls `onDiagnosisComplete` with the `Diagnosis` result; uses `traverseSymptomTree` utility
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [x] 14. Set up Expo Router navigation structure
  - [x] 14.1 Write `app/_layout.tsx` (root layout): initialise DB migration on mount via `db/index.ts`, call `NotificationService.requestPermissions`, read `onboarding_complete` from AsyncStorage and redirect to `/onboarding/1` if absent, then render `<Stack>`
    - _Requirements: 9.1, 10.1, 10.3, 3.7_
  - [x] 14.2 Write `app/(tabs)/_layout.tsx` with a bottom tab navigator defining three tabs: Virtual Jungle (`index`), Encyclopedia (`encyclopedia/index`), and Settings (`settings`)
    - _Requirements: 2.1_
  - [x] 14.3 Write `app/onboarding/_layout.tsx` and the stack shell for the four onboarding steps; create `app/onboarding/[step].tsx` that renders the correct content for steps 1–4 based on the route param, includes a "Skip" button on every step, and writes `onboarding_complete` to AsyncStorage on "Done" or "Skip"
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 14.4 Write `app/plants/_layout.tsx` and `app/plants/[plantId]/_layout.tsx` for the plant stack navigator; create route files `app/plants/new.tsx`, `app/plants/[plantId]/index.tsx`, `app/plants/[plantId]/care.tsx`, `app/plants/[plantId]/journal/index.tsx`, `app/plants/[plantId]/journal/new.tsx`, `app/plants/[plantId]/journal/compare.tsx`, `app/plants/[plantId]/symptom-checker.tsx` as placeholder screens
    - _Requirements: 1.1, 2.5, 6.9, 8.1_
  - [x] 14.5 Write `app/(tabs)/encyclopedia/_layout.tsx` and route files `app/(tabs)/encyclopedia/index.tsx`, `app/(tabs)/encyclopedia/[speciesId].tsx` as placeholder screens; wire "Use This Plant" CTA to navigate to `/plants/new` with query params
    - _Requirements: 7.5_

- [x] 15. Implement Virtual Jungle screen
  - [x] 15.1 Implement `app/(tabs)/index.tsx` (`VirtualJungle`): render a 2-column `FlatList` of `PlantCard` components using `usePlants` hook; show loading spinner while `isLoading`, show error + retry button if load fails after 5 s; show empty-state message with "Add Plant" CTA when plant list is empty; show summary section with count of tasks due today
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7_
  - [x] 15.2 Wire `PlantCard` `onPress` to navigate to `/plants/[plantId]`; wire "Add Plant" CTA to navigate to `/plants/new`; display total active plant count badge
    - _Requirements: 1.8, 2.5_
  - [x] 15.3 Write unit tests for VirtualJungle: renders plant grid, shows empty state, shows loading state, shows error state with retry button, correct task-due-today count
    - _Requirements: 2.1, 2.4, 2.6, 2.7_

- [x] 16. Implement Plant Profile creation and editing screens
  - [x] 16.1 Implement `app/plants/new.tsx` (`PlantFormScreen`): form with display name input (inline validation), optional species name, optional location label, optional cover photo picker (JPEG/PNG ≤10 MB with inline error on violation); read pre-fill query params (`wateringDays`, `fertilisingDays`, `pruningDays`, `speciesId`) and populate care schedule fields; on submit call `PlantService.createPlant` and navigate to the new plant's profile
    - _Requirements: 1.1, 1.2, 1.3, 1.9, 7.5_
  - [x] 16.2 Implement edit mode within `app/plants/[plantId]/index.tsx` (`PlantProfileScreen`): display all stored fields, last watered/fertilised/pruned dates, next due dates formatted as DD/MM/YYYY or "Not yet recorded"; provide edit button that opens inline editing of name/species/location/photo; deletion button shows confirmation dialog with plant display name; on delete call `PlantService.deletePlant` and navigate back to Virtual Jungle
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 2.2, 3.6, 4.6, 5.6, 8.1_
  - [x] 16.3 Write unit tests for PlantFormScreen: valid submission creates plant, empty name shows inline error, name >100 chars shows inline error, invalid photo shows inline error, pre-fill from query params
    - _Requirements: 1.1, 1.3, 1.9, 7.5_

- [x] 17. Implement Care Schedules screen
  - [x] 17.1 Implement `app/plants/[plantId]/care.tsx` (`CareScreen`): display three sections (watering, fertilising, pruning) each with a frequency input (integer 1–365), reminder toggle, last-completed date (DD/MM/YYYY or "Not yet recorded"), and next-due date; on save call `CareService.saveSchedule` and `NotificationService.scheduleReminder`; show notification-permission prompt if permission not granted; show reminder-disabled indicator when reminder is toggled off
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 3.8, 4.1, 4.2, 4.6, 4.7, 5.1, 5.2, 5.6, 5.7_
  - [x] 17.2 Add "Mark as done" buttons on `CareScreen` for each care type; on tap call `CareService.markComplete` which triggers `NotificationService.rescheduleAfterCompletion` and updates `nextDueAt`; display updated last-completed and next-due dates immediately
    - _Requirements: 3.4, 3.5, 4.4, 4.5, 5.4, 5.5_
  - [x] 17.3 Write unit tests for CareScreen: interval validation (1–365), reminder toggle updates store, mark-done updates last-completed display, permission-denied shows prompt
    - _Requirements: 3.1, 3.7, 3.8, 4.1, 4.7, 5.1, 5.7_

- [x] 18. Implement Growth Journal screens
  - [x] 18.1 Implement `app/plants/[plantId]/journal/index.tsx` (`GrowthJournalScreen`): render `JournalTimeline` component fed by `useJournal` hook; show empty state when no entries; long-press or swipe on entry reveals delete button (with confirmation dialog); navigate to `journal/new` to add entries
    - _Requirements: 6.1, 6.7, 6.8_
  - [x] 18.2 Implement `app/plants/[plantId]/journal/new.tsx` (`JournalEntryForm`): present camera vs. gallery choice; capture timestamp automatically; optional note ≤500 chars; on submit call `JournalService.addEntry`; handle camera/gallery permission denial with error + settings link; prevent submit without photo
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  - [x] 18.3 Implement `app/plants/[plantId]/journal/compare.tsx` (`CompareScreen`): two pickers to select any two journal entries from the plant's timeline; render side-by-side photos, formatted timestamps, and notes; only available when plant has ≥2 entries
    - _Requirements: 6.9_
  - [x] 18.4 Write unit tests for JournalEntryForm: photo required validation, note length enforced at 500 chars, file-write failure shows error and no DB record, permission-denied shows settings link
    - _Requirements: 6.2, 6.4, 6.5_

- [x] 19. Implement Encyclopedia screens
  - [x] 19.1 Implement `app/(tabs)/encyclopedia/index.tsx` (`EncyclopediaListScreen`): search input that calls `EncyclopediaService.search` on change and updates the filtered list in real time; show full list when search is cleared; show "No results found" when query has no matches
    - _Requirements: 7.3, 7.7_
  - [x] 19.2 Implement `app/(tabs)/encyclopedia/[speciesId].tsx` (`SpeciesDetailScreen`): display all 7 fields per the design (common name, scientific name, watering/fertilising/pruning frequency, light requirement, care summary); "Use This Plant" button navigates to `/plants/new?wateringDays=...&fertilisingDays=...&pruningDays=...&speciesId=...`; if navigated from an existing plant profile, show "Apply to Plant" button that triggers the confirmation dialog for updating existing schedules
    - _Requirements: 7.4, 7.5, 7.6_
  - [x] 19.3 Write unit tests for EncyclopediaListScreen: real-time filtering, clear restores full list, no-results message
    - _Requirements: 7.3, 7.7_

- [x] 20. Implement Symptom Checker screen
  - [x] 20.1 Implement `app/plants/[plantId]/symptom-checker.tsx` (`SymptomCheckerScreen`): embed the `SymptomChecker` component; on `onDiagnosisComplete` display the diagnosis (cause + action) or the "No diagnosis found" message with external resource suggestion; provide "Save to Profile" button that calls `db` to insert a `symptom_notes` row for the plant
    - _Requirements: 8.1, 8.3, 8.4, 8.6, 8.5_
  - [x] 20.2 Write unit tests for SymptomCheckerScreen: renders first question, answer selection advances tree, conclusive leaf shows diagnosis with Save button, inconclusive leaf shows no-diagnosis message
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 21. Implement Settings screen
  - [x] 21.1 Implement `app/(tabs)/settings.tsx` (`SettingsScreen`): preferred reminder time picker (hour + minute, stored in AsyncStorage); display current notification permission status; show "Open Notification Settings" button if permission is denied
    - _Requirements: 3.2, 3.7, 4.2, 5.2_

- [x] 22. Add DB write failure handling and error infrastructure
  - [x] 22.1 Wrap all `PlantService`, `CareService`, and `JournalService` write operations in try/catch; on failure dispatch `uiStore.setErrorBanner('Unable to save changes. Please try again.')` and rollback via Drizzle transaction; ensure `ErrorBanner` component is rendered in the root layout and listens to `uiStore`
    - _Requirements: 9.5_
  - [x] 22.2 Write property test: Property 17 — any simulated DB write failure leaves the database state byte-for-byte identical to the state before the operation (100 iterations)
    - **Property 17: DB Write Failure Leaves State Unchanged**
    - **Validates: Requirements 9.5**
  - [x] 22.3 Write unit tests for error handling: toast appears on DB failure, rollback is called, previously persisted data is intact after failed write
    - _Requirements: 9.5_

- [x] 23. Checkpoint — Ensure all screen and integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 24. Integration tests for complete user workflows
  - [x] 24.1 Write integration test: complete care-task workflow — create plant → save watering schedule → mark complete → verify new `care_completions` row → verify `nextDueAt` updated → verify notification rescheduled
    - _Requirements: 3.2, 3.4, 3.5, 9.1_
  - [x] 24.2 Write integration test: journal entry lifecycle — add entry with photo → verify file exists at expected path → verify DB record → delete entry → verify DB record gone → verify file deleted
    - _Requirements: 6.4, 6.7, 9.2_
  - [x] 24.3 Write integration test: plant deletion cascade — create plant with 2 schedules and 3 journal entries → delete plant → verify plant gone from listPlants, no orphan schedules, no orphan journal entries, notifications cancelled
    - _Requirements: 1.6, 9.1_

- [x] 25. Smoke tests
  - [x] 25.1 Write smoke test: app mounts, root layout runs DB migration without error, Virtual Jungle renders with zero plants showing empty-state message
    - _Requirements: 2.1, 2.6, 9.1_
  - [x] 25.2 Write smoke test: onboarding flow — first launch redirects to `/onboarding/1`, "Skip" on step 2 writes `onboarding_complete` flag and renders Virtual Jungle
    - _Requirements: 10.1, 10.3, 10.5_
  - [x] 25.3 Write smoke test: notification permission prompt appears on onboarding step 4 and proceeds without blocking when permission is denied
    - _Requirements: 10.4_

- [x] 26. Feature flag infrastructure for future phases
  - [x] 26.1 Verify `constants/featureFlags.ts` has `PLANT_IDENTIFIER_ENABLED: false` and `WEATHER_SERVICE_ENABLED: false`; add conditional render in `app/plants/new.tsx` that shows the "Identify Plant" button only when `PLANT_IDENTIFIER_ENABLED` is true (no-op implementation); add conditional Weather advisory banner mount in `app/(tabs)/index.tsx` only when `WEATHER_SERVICE_ENABLED` is true
    - _Requirements: 11.1, 12.1, 12.2, 12.3_
  - [x] 26.2 Write unit tests for feature flag gating: `PLANT_IDENTIFIER_ENABLED=false` hides Identify button; `WEATHER_SERVICE_ENABLED=false` hides weather banner; toggling each flag true shows the stub UI
    - _Requirements: 11.1, 12.1_

- [x] 27. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build
- Each task references specific requirement clauses for full traceability
- Property tests use `fast-check` configured for a minimum of 100 iterations each; tag format: `// Feature: plant-parent, Property N: <property text>`
- Unit tests use `jest-expo` + `@testing-library/react-native` with mocked expo-sqlite, expo-file-system, and expo-notifications
- Drizzle migrations are bundled into the app binary — running `drizzle-kit generate` in CI is required before building the app
- All notification scheduling uses `DateTriggerInput` (single-shot) to ensure Android compatibility; `CalendarTriggerInput` is not used
- The `onboarding_complete` AsyncStorage write failure must not block navigation (Req 10.3)
- Feature flags in `constants/featureFlags.ts` must be the single source of truth for future-phase gating — no ad-hoc `if` branches outside flag checks


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2"] },
    { "id": 1, "tasks": ["3.1", "10.1", "10.2"] },
    { "id": 2, "tasks": ["3.2", "4.1", "4.6"] },
    { "id": 3, "tasks": ["3.3", "4.2", "4.3", "4.4", "4.5", "4.7", "4.8"] },
    { "id": 4, "tasks": ["5.1", "11.1", "11.2", "11.3"] },
    { "id": 5, "tasks": ["5.2", "6.1", "8.1", "10.3"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.5", "8.2", "10.4", "10.5"] },
    { "id": 7, "tasks": ["7.1", "9.1", "10.6", "11.4", "11.5", "11.6"] },
    { "id": 8, "tasks": ["7.2", "7.3", "7.4", "9.2", "9.3", "9.4"] },
    { "id": 9, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 10, "tasks": ["14.1", "14.2"] },
    { "id": 11, "tasks": ["14.3", "14.4", "14.5"] },
    { "id": 12, "tasks": ["15.1", "16.1", "17.1", "18.1", "19.1", "20.1", "21.1"] },
    { "id": 13, "tasks": ["15.2", "15.3", "16.2", "17.2", "18.2", "19.2", "20.2"] },
    { "id": 14, "tasks": ["16.3", "17.3", "18.3", "18.4", "19.3"] },
    { "id": 15, "tasks": ["22.1"] },
    { "id": 16, "tasks": ["22.2", "22.3"] },
    { "id": 17, "tasks": ["24.1", "24.2", "24.3"] },
    { "id": 18, "tasks": ["25.1", "25.2", "25.3"] },
    { "id": 19, "tasks": ["26.1"] },
    { "id": 20, "tasks": ["26.2"] }
  ]
}
```
