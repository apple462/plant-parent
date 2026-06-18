CREATE TABLE `care_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `care_schedules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `care_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`plant_id` text NOT NULL,
	`type` text NOT NULL,
	`interval_days` integer NOT NULL,
	`reminder_enabled` integer DEFAULT 1 NOT NULL,
	`notification_id` text,
	`next_due_at` integer,
	`preferred_hour` integer DEFAULT 8,
	`preferred_minute` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`plant_id` text NOT NULL,
	`photo_path` text NOT NULL,
	`captured_at` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plants` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`species_name` text,
	`location_label` text,
	`cover_photo_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `symptom_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`plant_id` text NOT NULL,
	`diagnosis` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE no action
);
