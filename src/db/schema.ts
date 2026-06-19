// db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const plants = sqliteTable('plants', {
  id:          text('id').primaryKey(),           // UUID v4
  displayName: text('display_name').notNull(),    // 1–100 chars
  speciesName: text('species_name'),              // optional
  locationLabel: text('location_label'),          // optional
  environment: text('environment').notNull().default('outdoor'), // 'indoor' | 'outdoor' — gates weather-based care adjustment
  coverPhotoPath: text('cover_photo_path'),       // local file path or null
  quantity:    integer('quantity').notNull().default(1), // how many physical plants this record represents
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

// Drizzle inferred types for downstream use
export type PlantRow = typeof plants.$inferSelect;
export type NewPlantRow = typeof plants.$inferInsert;

export type CareScheduleRow = typeof care_schedules.$inferSelect;
export type NewCareScheduleRow = typeof care_schedules.$inferInsert;

export type CareCompletionRow = typeof care_completions.$inferSelect;
export type NewCareCompletionRow = typeof care_completions.$inferInsert;

export type JournalEntryRow = typeof journal_entries.$inferSelect;
export type NewJournalEntryRow = typeof journal_entries.$inferInsert;

export type SymptomNoteRow = typeof symptom_notes.$inferSelect;
export type NewSymptomNoteRow = typeof symptom_notes.$inferInsert;
