# Design Document — Plant Parent

## Overview

Plant Parent is a local-first React Native (Expo) mobile application that helps users catalogue, care for, and celebrate their home plant collection. All data is stored on-device using SQLite, the device file system, and AsyncStorage; there is no server dependency in the MVP.

The application is structured around three core experiences — Plant Kingdom, Care Reminders, and Growth Journal — unified by a Virtual Jungle home dashboard. Local push notifications (scheduled via expo-notifications) replace any server-side delivery mechanism.

### Design Goals

- **Offline-first**: Every feature works without a network connection; the device is the source of truth.
- **Responsive UI**: Database and file I/O are always asynchronous so the UI thread stays at 60 fps.
- **Extensible architecture**: Future phases (Plant.id API, OpenWeatherMap, Supabase sync) are added as opt-in feature-flagged modules without restructuring the core.
- **Minimal data footprint**: Only the data the user explicitly creates is stored; no analytics or PII are transmitted.

### Key Research Findings

- **Drizzle ORM + expo-sqlite** is the recommended pattern for Expo SQLite as of 2024–2025. Drizzle provides type-safe queries, auto-generated migrations bundled into the app binary, live-query reactive hooks (`useLiveQuery`), and first-class Expo SQLite support. ([Expo blog](https://expo.dev/blog/modern-sqlite-for-react-native-apps), [Drizzle docs](https://orm.drizzle.team/docs/connect-expo-sqlite))
- **expo-notifications** supports `scheduleNotificationAsync` with a `DateTriggerInput` (fire at a specific timestamp) and `TimeIntervalTriggerInput` (fire after N seconds). Because `CalendarTriggerInput` is not supported on Android, the recommended pattern for variable-interval care reminders is to schedule a single `DateTriggerInput` for the next occurrence and re-schedule on task completion or app open.
- **Expo Router** (file-based routing) is the current recommended navigation solution for new Expo projects; it uses a tab-plus-stack layout with nested stack navigators under each tab.

---

## Architecture

### High-Level Layers

```
┌──────────────────────────────────────────────────┐
│                    UI Layer                       │
│  Expo Router screens + React Native components   │
│  Zustand store slices (reactive state)           │
└─────────────────────┬────────────────────────────┘
                      │ reads / dispatches
┌─────────────────────▼────────────────────────────┐
│               Service Layer                       │
│  PlantService  │ CareService  │ JournalService    │
│  EncyclopediaService  │  NotificationService      │
│  StorageService (file I/O)                        │
└──────┬──────────────┬──────────────┬─────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────────────┐
│  Local_DB   │ │ File_Store  │ │  AsyncStorage   │
│ (SQLite via │ │(expo-file-  │ │  (preferences / │
│  Drizzle)   │ │  system)    │ │  onboarding)    │
└─────────────┘ └────────────┘ └─────────────────┘
```

### Module Structure

```
src/
├── app/                      # Expo Router screens (file-based routing)
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Bottom tab navigator
│   │   ├── index.tsx         # Virtual Jungle (home)
│   │   ├── encyclopedia/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx     # Encyclopedia list
│   │   │   └── [speciesId].tsx
│   │   └── settings.tsx
│   ├── plants/
│   │   ├── new.tsx           # Create Plant_Profile
│   │   ├── [plantId]/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx     # Plant_Profile detail
│   │   │   ├── care.tsx      # Care schedules editor
│   │   │   ├── journal/
│   │   │   │   ├── index.tsx # Growth Journal list
│   │   │   │   ├── new.tsx   # Add Journal_Entry
│   │   │   │   └── compare.tsx # Side-by-side comparison
│   │   │   └── symptom-checker.tsx
│   ├── onboarding/
│   │   ├── _layout.tsx
│   │   └── [step].tsx        # Steps 1–4
│   └── _layout.tsx           # Root layout (DB init, notification setup)
├── db/
│   ├── schema.ts             # Drizzle table definitions
│   ├── migrations/           # Auto-generated migration files
│   └── index.ts              # Drizzle client singleton
├── services/
│   ├── PlantService.ts
│   ├── CareService.ts
│   ├── JournalService.ts
│   ├── NotificationService.ts
│   ├── EncyclopediaService.ts
│   └── StorageService.ts
├── stores/
│   ├── plantStore.ts         # Zustand slice for plant list
│   ├── careStore.ts
│   └── uiStore.ts            # Loading states, error banners
├── hooks/
│   ├── usePlants.ts
│   ├── useCareSchedule.ts
│   └── useJournal.ts
├── data/
│   ├── encyclopedia.json     # Bundled 50+ species data
│   └── symptomTree.json      # Decision tree data
├── components/
│   ├── PlantCard.tsx
│   ├── CareTaskBadge.tsx
│   ├── JournalTimeline.tsx
│   ├── SymptomChecker.tsx
│   └── ui/                   # Generic primitives (Button, Input, etc.)
├── utils/
│   ├── dateUtils.ts          # DD/MM/YYYY formatting, due-date logic
│   ├── notificationUtils.ts  # Schedule / cancel helpers
│   └── validation.ts         # Plant name, photo validation
└── constants/
    ├── featureFlags.ts        # PLANT_IDENTIFIER_ENABLED, WEATHER_ENABLED
    └── theme.ts
```

### Notification Scheduling Strategy

Because `CalendarTriggerInput` is unsupported on Android, the app uses a **single-shot `DateTriggerInput`** per reminder:

1. When a schedule is saved (or a task marked complete), compute `nextDueDate = lastCompletedDate + intervalDays` at the user's preferred time of day.
2. Call `Notifications.scheduleNotificationAsync({ trigger: { date: nextDueDate } })`.
3. Persist the returned `notificationId` in the `care_tasks` table.
4. On task completion: cancel the stored `notificationId`, compute the new `nextDueDate`, schedule a new notification, and update the stored `notificationId`.
5. On app open: scan `care_tasks` for rows where `nextDueDate < now` and the notification hasn't fired (i.e., the task is overdue), and reschedule as needed.

This pattern is cross-platform (iOS and Android) and handles missed notifications gracefully.

### Feature Flag System

Future-phase features are gated behind compile-time flags in `constants/featureFlags.ts`:

```typescript
export const FEATURE_FLAGS = {
  PLANT_IDENTIFIER_ENABLED: false,   // Req 11
  WEATHER_SERVICE_ENABLED: false,    // Req 12
  SUPABASE_SYNC_ENABLED: false,      // Future
} as const;
```

---

## Components and Interfaces

### Screen Components

| Screen | Route | Purpose |
|--------|-------|---------|
| `VirtualJungle` | `/(tabs)/` | Home dashboard — plant grid + summary |
| `PlantProfileScreen` | `/plants/[plantId]/` | Full profile detail |
| `PlantFormScreen` | `/plants/new` | Create / edit plant profile |
| `CareScreen` | `/plants/[plantId]/care` | Configure care schedules |
| `GrowthJournalScreen` | `/plants/[plantId]/journal/` | Photo timeline |
| `JournalEntryForm` | `/plants/[plantId]/journal/new` | Add journal entry |
| `CompareScreen` | `/plants/[plantId]/journal/compare` | Side-by-side comparison |
| `SymptomCheckerScreen` | `/plants/[plantId]/symptom-checker` | Decision tree |
| `EncyclopediaListScreen` | `/(tabs)/encyclopedia/` | Search + browse species |
| `SpeciesDetailScreen` | `/(tabs)/encyclopedia/[speciesId]` | Full care guide |
| `OnboardingScreen` | `/onboarding/[step]` | Steps 1–4 |
| `SettingsScreen` | `/(tabs)/settings` | Preferences (reminder time, etc.) |

### Service Interfaces

```typescript
// PlantService.ts
interface PlantService {
  createPlant(input: CreatePlantInput): Promise<Plant>;
  updatePlant(id: string, input: UpdatePlantInput): Promise<Plant>;
  deletePlant(id: string): Promise<void>;
  getPlant(id: string): Promise<Plant | null>;
  listPlants(): Promise<Plant[]>;
}

// CareService.ts
interface CareService {
  saveSchedule(plantId: string, type: CareType, input: ScheduleInput): Promise<CareSchedule>;
  markComplete(scheduleId: string): Promise<CareCompletion>;
  disableReminder(scheduleId: string): Promise<void>;
  enableReminder(scheduleId: string): Promise<void>;
  getNextDueDate(scheduleId: string): Date | null;
  getLastCompletionDate(scheduleId: string): Date | null;
}

// JournalService.ts
interface JournalService {
  addEntry(plantId: string, input: JournalEntryInput): Promise<JournalEntry>;
  deleteEntry(entryId: string): Promise<void>;
  listEntries(plantId: string): Promise<JournalEntry[]>;
}

// NotificationService.ts
interface NotificationService {
  requestPermissions(): Promise<boolean>;
  scheduleReminder(schedule: CareSchedule, preferredHour: number, preferredMinute: number): Promise<string>;
  cancelReminder(notificationId: string): Promise<void>;
  rescheduleAfterCompletion(schedule: CareSchedule, completionDate: Date): Promise<string>;
}

// StorageService.ts
interface StorageService {
  savePhoto(plantId: string, uri: string, filename: string): Promise<string>;
  deletePhoto(filePath: string): Promise<void>;
}

// EncyclopediaService.ts
interface EncyclopediaService {
  search(query: string): SpeciesEntry[];
  getById(id: string): SpeciesEntry | null;
  listAll(): SpeciesEntry[];
}
```

### Reusable UI Components

```typescript
// PlantCard — displayed in the Virtual Jungle grid
interface PlantCardProps {
  plant: Plant;
  nextDueTask: CareTask | null;
  isDueToday: boolean;
  isOverdue: boolean;
  onPress: () => void;
}

// CareTaskBadge — overdue/due-today indicator on PlantCard
interface CareTaskBadgeProps {
  status: 'due-today' | 'overdue' | 'upcoming' | 'none';
}

// SymptomChecker — self-contained decision-tree walker
interface SymptomCheckerProps {
  plantId: string;
  onDiagnosisComplete: (diagnosis: Diagnosis) => void;
}
```

---

## Data Models

### SQLite Schema (Drizzle)

```typescript
// db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const plants = sqliteTable('plants', {
  id:          text('id').primaryKey(),           // UUID v4
  displayName: text('display_name').notNull(),    // 1–100 chars
  speciesName: text('species_name'),              // optional
  locationLabel: text('location_label'),          // optional
  coverPhotoPath: text('cover_photo_path'),       // local file path or null
  createdAt:   integer('created_at').notNull(),   // Unix ms
  updatedAt:   integer('updated_at').notNull(),
  deletedAt:   integer('deleted_at'),             // soft-delete timestamp
});

export const care_schedules = sqliteTable('care_schedules', {
  id:            text('id').primaryKey(),
  plantId:       text('plant_id').notNull().references(() => plants.id),
  type:          text('type').notNull(),          // 'watering' | 'fertilising' | 'pruning'
  intervalDays:  integer('interval_days').notNull(), // 1–365
  reminderEnabled: integer('reminder_enabled').notNull().default(1), // 0 | 1
  notificationId: text('notification_id'),        // expo notification id
  nextDueAt:     integer('next_due_at'),          // Unix ms
  preferredHour:  integer('preferred_hour').default(8),
  preferredMinute: integer('preferred_minute').default(0),
  createdAt:     integer('created_at').notNull(),
  updatedAt:     integer('updated_at').notNull(),
});

export const care_completions = sqliteTable('care_completions', {
  id:          text('id').primaryKey(),
  scheduleId:  text('schedule_id').notNull().references(() => care_schedules.id),
  completedAt: integer('completed_at').notNull(), // Unix ms
});

export const journal_entries = sqliteTable('journal_entries', {
  id:           text('id').primaryKey(),
  plantId:      text('plant_id').notNull().references(() => plants.id),
  photoPath:    text('photo_path').notNull(),     // File_Store path
  capturedAt:   integer('captured_at').notNull(), // Unix ms
  note:         text('note'),                     // up to 500 chars
  createdAt:    integer('created_at').notNull(),
});

export const symptom_notes = sqliteTable('symptom_notes', {
  id:         text('id').primaryKey(),
  plantId:    text('plant_id').notNull().references(() => plants.id),
  diagnosis:  text('diagnosis').notNull(),
  action:     text('action').notNull(),
  createdAt:  integer('created_at').notNull(),
});
```

### TypeScript Domain Types

```typescript
type CareType = 'watering' | 'fertilising' | 'pruning';

interface Plant {
  id: string;
  displayName: string;          // 1–100 chars
  speciesName?: string;
  locationLabel?: string;
  coverPhotoPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CareSchedule {
  id: string;
  plantId: string;
  type: CareType;
  intervalDays: number;         // 1–365
  reminderEnabled: boolean;
  notificationId?: string;
  nextDueAt?: Date;
  preferredHour: number;        // 0–23
  preferredMinute: number;      // 0–59
}

interface CareCompletion {
  id: string;
  scheduleId: string;
  completedAt: Date;
}

interface JournalEntry {
  id: string;
  plantId: string;
  photoPath: string;
  capturedAt: Date;
  note?: string;
}

interface SpeciesEntry {
  id: string;
  commonName: string;
  scientificName: string;
  wateringFrequencyDays: number;
  fertilisingFrequencyDays: number;
  pruningFrequencyDays: number;
  lightRequirement: 'Low' | 'Medium' | 'Bright Indirect' | 'Full Sun';
  careSummary: string;          // up to 500 chars
}

interface Diagnosis {
  cause: string;
  action: string;
  conclusive: boolean;
}
```

### AsyncStorage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `onboarding_complete` | `'true'` | First-launch flag (Req 10) |
| `preferred_reminder_hour` | `string` (number) | Global preferred hour (default 8) |
| `preferred_reminder_minute` | `string` (number) | Global preferred minute (default 0) |

### File Store Layout

```
<DocumentDirectory>/
└── plant-parent/
    ├── covers/
    │   └── <plantId>.<ext>          # Plant cover photo
    └── journal/
        └── <plantId>/
            └── <entryId>.<ext>      # Journal entry photo
```

---

## Navigation

The app uses Expo Router with a bottom tab navigator wrapping stack navigators per tab.

```
Root Layout (_layout.tsx)
│  ← DB migration on mount, notification permission check
│
├── /onboarding/[step]        (shown only on first launch)
│
└── (tabs)/_layout.tsx        (bottom tab bar: 3 tabs)
    ├── index (Virtual Jungle)
    │   └── /plants/
    │       ├── new              (modal)
    │       └── [plantId]/
    │           ├── index        (Plant Profile)
    │           ├── care         (Care schedules)
    │           ├── journal/
    │           │   ├── index    (Growth Journal)
    │           │   ├── new      (Add entry, modal)
    │           │   └── compare  (Side-by-side)
    │           └── symptom-checker
    ├── encyclopedia/
    │   ├── index                (Species list)
    │   └── [speciesId]          (Care guide)
    └── settings
```

### Navigation Flow: Onboarding

On first launch, the root `_layout.tsx` reads `onboarding_complete` from AsyncStorage. If absent, it redirects to `/onboarding/1` before the tab navigator is mounted.

### Navigation Flow: "Use This Plant" Encyclopedia CTA

When the user taps "Use This Plant" on a species detail screen, Expo Router navigates to `/plants/new` with query params `?wateringDays=7&fertilisingDays=30&pruningDays=14&speciesId=...` so the form can pre-fill the schedule fields.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| DB write failure | Toast: "Unable to save changes. Please try again." Roll back to last committed state (Req 9.5) |
| DB load timeout (>5 s) | Error message + Retry button on Virtual Jungle (Req 2.7) |
| File write failure for journal photo | Error message; do not persist DB record (Req 6.4) |
| File delete failure for journal entry | Silently log; remove DB record anyway (Req 6.7) |
| File delete failure during plant deletion | Continue deleting remaining files; log; do not block deletion (Req 1.6) |
| Notification permission denied | In-app prompt with link to device settings (Req 3.7) |
| Camera / gallery permission denied | Error message + link to device permission settings (Req 6.2) |
| Onboarding AsyncStorage write failure | Navigate anyway; retry silently next launch (Req 10.3) |
| Plant name validation error | Inline error adjacent to field; prevent submission (Req 1.3, 1.5) |
| Photo format / size error | Inline error on photo picker; prevent attachment (Req 1.9) |
| Encyclopedia: no search results | "No results found" message (Req 7.7) |
| Symptom checker: no diagnosis | "No diagnosis found" + external resource suggestion (Req 8.4) |

All error toasts and inline messages use a shared `ErrorBanner` component that accepts an `ErrorCode` enum so copy can be updated centrally. DB errors and file I/O errors are also written to a silent in-memory log (accessible in dev builds via a hidden developer screen) for debugging.

---

## Testing Strategy

### Unit Tests (Jest + React Native Testing Library)

Unit tests cover service-layer logic with SQLite mocked via `jest.mock`, file system calls mocked, and notification scheduling mocked:

- `PlantService`: create, update, delete, validation edge cases
- `CareService`: schedule creation, task completion, next-due-date computation
- `NotificationService`: scheduling logic, cancellation, rescheduling after completion
- `JournalService`: entry creation and deletion
- `EncyclopediaService`: search filtering (case-insensitive, empty query)
- `dateUtils`: `formatDDMMYYYY`, `isDueToday`, `isOverdue`, next-due computation
- `validation`: display name length, photo format/size

### Property-Based Tests (fast-check)

Property-based testing is applicable to this feature. The core scheduling logic, date formatting, input validation, and search filtering all involve pure functions over a large input space where input variation reveals edge cases.

The app will use **[fast-check](https://github.com/dubzzz/fast-check)** as the property-based testing library (TypeScript-native, no runtime dependency). Each property test is configured to run a minimum of **100 iterations**.

Tag format: `// Feature: plant-parent, Property N: <property text>`

See the Correctness Properties section for the full property list.

### Integration Tests

- DB migration runs cleanly on a fresh SQLite file
- Complete care-task workflow: create plant → save schedule → mark complete → verify next notification scheduled
- Journal entry lifecycle: add photo → verify file written → delete entry → verify file removed
- Plant deletion: verify all associated `care_schedules`, `care_completions`, `journal_entries`, and notification IDs are cleaned up

### Smoke Tests

- App launches and Virtual Jungle renders with zero plants
- Onboarding flow completes (Skip path and Done path)
- Notification permissions prompt appears correctly


---

## Correctness Properties

### Property 1: Display Name Validation

*For any* string input used as a plant display name, the validation function SHALL accept the string if and only if its trimmed length is between 1 and 100 characters (inclusive); it SHALL reject empty strings, strings composed entirely of whitespace, and strings whose trimmed length exceeds 100 characters.

**Validates: Requirements 1.1, 1.3, 1.5**

---

### Property 2: Photo Validation

*For any* combination of MIME type and file size in bytes, the photo validation function SHALL accept the photo if and only if the MIME type is `image/jpeg` or `image/png` AND the file size is less than or equal to 10,485,760 bytes (10 MB); it SHALL reject all other MIME types and any file that exceeds the size limit regardless of type.

**Validates: Requirements 1.9**

---

### Property 3: Plant Creation Round-Trip

*For any* valid Plant input (display name 1–100 chars, optional species name, optional location), creating a plant via `PlantService.createPlant` and then retrieving it via `PlantService.getPlant(id)` SHALL return a record whose display name, species name, and location label match the original input exactly, and whose `id` is a non-empty globally unique identifier not already present in the database.

**Validates: Requirements 1.2, 1.4**

---

### Property 4: Plant Update Preserves Only Changed Fields

*For any* existing plant and any valid update payload that changes a subset of fields, calling `PlantService.updatePlant` and then reading back the plant SHALL produce a record where every field in the update payload matches the new value AND every field not included in the update payload retains its original value unchanged.

**Validates: Requirements 1.5**

---

### Property 5: Plant Deletion Cascades Completely

*For any* plant that has N care schedules and M journal entries (N ≥ 0, M ≥ 0), after calling `PlantService.deletePlant(id)`, the plant SHALL not appear in the result of `PlantService.listPlants()`, `PlantService.getPlant(id)` SHALL return null, and no `care_schedules` or `journal_entries` rows with `plantId` equal to the deleted plant's ID SHALL remain in the database.

**Validates: Requirements 1.6**

---

### Property 6: Active Plant Count Invariant

*For any* sequence of create and delete operations applied to the plant collection, the count of active plants returned by `PlantService.listPlants()` SHALL always equal the exact number of plants that have been created and not yet deleted at that point in the sequence.

**Validates: Requirements 1.8**

---

### Property 7: Care Schedule Interval Validation

*For any* integer value supplied as the `intervalDays` field of a care schedule (watering, fertilising, or pruning), the schedule validation function SHALL accept values in the range [1, 365] inclusive and SHALL reject zero, negative integers, and integers greater than 365.

**Validates: Requirements 3.1, 4.1, 5.1**

---

### Property 8: Next-Due-Date Calculation

*For any* combination of a completion date, an interval in whole days (1–365), a preferred hour (0–23), and a preferred minute (0–59), the `computeNextDueDate` function SHALL return a Date whose calendar date is exactly `completionDate + intervalDays` days and whose time-of-day component is exactly the specified `(preferredHour, preferredMinute)`; when no preferred time is provided, the returned time SHALL default to 08:00 in the device's local timezone.

**Validates: Requirements 3.2, 3.5, 4.2, 4.5, 5.2, 5.5**

---

### Property 9: Care Completion Round-Trip

*For any* valid care schedule and any completion timestamp, calling `CareService.markComplete(scheduleId, completedAt)` and then querying `care_completions` for that schedule SHALL return at least one record whose `completedAt` value matches the input timestamp exactly (to millisecond precision).

**Validates: Requirements 3.4, 4.4, 5.4**

---

### Property 10: Date Formatting — DD/MM/YYYY

*For any* valid JavaScript `Date` object (any year, month, day combination), the `formatDDMMYYYY` utility function SHALL return a string that matches the pattern `DD/MM/YYYY` where DD is a zero-padded day (01–31), MM is a zero-padded month (01–12), and YYYY is a four-digit year; the function SHALL correctly handle month/day boundaries, leap years, and year boundaries.

**Validates: Requirements 2.2, 3.6, 4.6, 5.6**

---

### Property 11: isDueToday Predicate

*For any* timestamp, `isDueToday(timestamp, referenceDate)` SHALL return `true` if and only if the timestamp falls within the calendar day of `referenceDate` (from 00:00:00.000 to 23:59:59.999 local time inclusive); it SHALL return `false` for timestamps that fall on any other calendar day, including the day immediately before (yesterday) and the day immediately after (tomorrow).

**Validates: Requirements 2.3, 2.8**

---

### Property 12: Journal Entries Are Reverse-Chronological

*For any* non-empty array of `JournalEntry` objects with arbitrary `capturedAt` timestamps (including duplicates), the result of sorting them for display SHALL be in descending order of `capturedAt`, such that for every adjacent pair (entries[i], entries[i+1]) in the result, `entries[i].capturedAt >= entries[i+1].capturedAt`.

**Validates: Requirements 6.1**

---

### Property 13: Journal Timestamp Format

*For any* valid JavaScript `Date` object, the `formatJournalTimestamp` utility function SHALL return a string matching the pattern `"DD MMM YYYY, HH:MM"` where DD is zero-padded day, MMM is a 3-letter English month abbreviation with the first letter uppercase (Jan–Dec), YYYY is a 4-digit year, HH is zero-padded 24-hour hours (00–23), and MM is zero-padded minutes (00–59).

**Validates: Requirements 6.6**

---

### Property 14: Journal Entry Write Atomicity

*For any* journal entry add operation: (a) when the File_Store write succeeds, the `journal_entries` table SHALL contain a record with the correct `plantId`, `photoPath`, and `capturedAt`; (b) when the File_Store write fails (simulated), the `journal_entries` table SHALL contain no new record for that entry — the operation is atomic in the failure direction.

**Validates: Requirements 6.4**

---

### Property 15: Encyclopedia Search Correctness

*For any* search query string Q (including empty string, whitespace, single characters, and long strings) applied against any collection of `SpeciesEntry` records, the search function SHALL satisfy two invariants simultaneously:
- **No false positives**: every entry in the result has a `commonName` or `scientificName` that contains Q as a case-insensitive substring.
- **No false negatives**: every entry in the collection whose `commonName` or `scientificName` contains Q as a case-insensitive substring appears in the result.
- **Empty query**: when Q is the empty string, the result SHALL be the full unfiltered collection.

**Validates: Requirements 7.3, 7.7**

---

### Property 16: Symptom Checker Decision Tree Traversal

*For any* valid sequence of answers that follows a defined path through the bundled `symptomTree.json`, the `traverseSymptomTree` function SHALL: (a) at each non-leaf node, return the exact set of answer options defined for that node in the tree data; (b) at a conclusive leaf node, return a `Diagnosis` with non-empty `cause` and `action` fields and `conclusive = true`; (c) at a dead-end node (no defined path), return a `Diagnosis` with `conclusive = false`.

**Validates: Requirements 8.2, 8.3, 8.4**

---

### Property 17: DB Write Failure Leaves State Unchanged

*For any* write operation (create, update, or delete) that is simulated to fail at the database layer, the state of the database after the failed operation SHALL be byte-for-byte identical to the state immediately before the operation was attempted — no partial writes, no orphaned rows, and no missing rows.

**Validates: Requirements 9.5**
