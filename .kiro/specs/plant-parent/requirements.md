# Requirements Document

## Introduction

Plant Parent is a React Native mobile application for plant enthusiasts who want to catalogue, care for, and celebrate their home plant collection. The MVP is local-first — all data lives on-device using SQLite, AsyncStorage, and the device file system. Push notifications are delivered locally via expo-notifications with no server dependency.

The app is structured around three core experiences:

1. **Plant Kingdom** — a personal repository of every plant a user owns, with rich profiles and care guides.
2. **Care Reminders** — scheduled notifications for watering, fertilising, and pruning, adaptable to plant-specific needs.
3. **Growth Journal** — a photo timeline that lets users watch their plants grow over time.

A "Virtual Jungle" dashboard ties these together, giving users a living overview of their entire plant collection and upcoming care tasks.

Later phases will add plant identification via image-recognition APIs, weather-based watering intelligence, cross-device sync via Supabase, and community features.

---

## Glossary

- **App**: The Plant Parent React Native application.
- **User**: A person who installs and uses the App on their mobile device.
- **Plant**: A single plant entity owned by a User, represented in the App by a Plant Profile.
- **Plant_Profile**: The data record for one Plant, including name, species, photo, location, and care settings.
- **Plant_Kingdom**: The full collection of all Plants belonging to a User.
- **Virtual_Jungle**: The home dashboard that displays a visual overview of the User's Plant_Kingdom and upcoming care tasks.
- **Care_Task**: A scheduled activity for a Plant — one of: watering, fertilising, or pruning.
- **Reminder**: A local push notification that fires when a Care_Task is due.
- **Growth_Journal**: A chronological photo log attached to a specific Plant, showing growth over time.
- **Journal_Entry**: A single timestamped photo and optional note within a Growth_Journal.
- **Care_Guide**: A curated set of care instructions for a plant species, stored locally in the App.
- **Symptom_Checker**: A built-in tool that walks the User through a decision tree to diagnose common plant problems.
- **Plant_Identifier**: A future-phase feature that calls an external image-recognition API to identify a plant from a photo.
- **Weather_Service**: A future-phase feature that calls an external weather API to adjust watering frequency recommendations.
- **Local_DB**: The on-device SQLite database that persists structured Plant data.
- **File_Store**: The on-device file system (expo-file-system) used to persist photo assets.
- **Notification_Service**: The expo-notifications subsystem used to schedule and deliver local Reminders.
- **Encyclopedia**: A bundled, offline-accessible reference of common houseplant species and their care requirements.

---

## Requirements

### Requirement 1: Plant Profile Management

**User Story:** As a User, I want to create and manage profiles for each of my plants, so that I have a single place to record everything about each plant in my collection.

#### Acceptance Criteria

1. THE App SHALL provide a form that allows the User to create a new Plant_Profile with at minimum: a display name (1–100 characters), an optional species name (0–100 characters), an optional location label (0–100 characters, e.g. "living room"), and an optional cover photo (JPEG or PNG, maximum 10 MB).
2. WHEN the User submits the Plant_Profile creation form with a valid display name, THE Local_DB SHALL persist the new Plant_Profile and assign it a globally unique identifier.
3. IF the User submits the Plant_Profile creation form without a display name, or with a display name that exceeds 100 characters, THEN THE App SHALL display an inline validation error adjacent to the display name field and prevent submission.
4. WHEN the User opens an existing Plant_Profile, THE App SHALL display all stored fields including display name, species (shown as empty if not set), location (shown as empty if not set), cover photo (shown as a placeholder if not set), creation date, and associated Care_Tasks.
5. WHEN the User saves edits to an existing Plant_Profile with a valid display name, THE App SHALL persist the updated values to the Local_DB and display a confirmation that the changes were saved. IF the edited display name is empty or exceeds 100 characters, THEN THE App SHALL display an inline validation error and prevent saving.
6. WHEN the User confirms deletion of a Plant_Profile, THE App SHALL remove the Plant_Profile record from the Local_DB, cancel all associated Reminders via the Notification_Service, and attempt to delete all associated Journal_Entry photo files from the File_Store; IF any individual file deletion fails, THE App SHALL continue deleting remaining files and log the failure without blocking the overall deletion.
7. IF the User attempts to delete a Plant_Profile, THEN THE App SHALL display a confirmation dialog that includes the Plant's display name before executing the deletion.
8. THE App SHALL display a count of the total number of active (non-deleted) Plants in the Plant_Kingdom on the main dashboard.
9. IF the User attempts to set a cover photo with an unsupported format (not JPEG or PNG) or a file size exceeding 10 MB, THEN THE App SHALL display an inline validation error and prevent the photo from being attached to the Plant_Profile.

---

### Requirement 2: Plant Kingdom Overview (Virtual Jungle Dashboard)

**User Story:** As a User, I want a home screen that shows all my plants at a glance along with what needs attention today, so that I can quickly triage my plant care without opening each profile individually.

#### Acceptance Criteria

1. WHEN the User opens the App, THE Virtual_Jungle SHALL be the first screen displayed.
2. THE Virtual_Jungle SHALL render a scrollable grid or list of Plant_Profile cards, each showing the plant's cover photo (or a placeholder if none is set), display name, and the next upcoming Care_Task due date formatted as a calendar date (DD/MM/YYYY); IF a Plant has no scheduled Care_Tasks, THE card SHALL display "No tasks scheduled" in place of a due date.
3. WHEN a Plant has a Care_Task due today or overdue, THE Virtual_Jungle SHALL display a visible badge or colour indicator on that Plant_Profile card that is distinguishable from cards with no tasks due.
4. THE Virtual_Jungle SHALL display a summary section showing the total number of Care_Tasks due today across all Plants; WHEN no tasks are due today, THE summary section SHALL display "0 tasks due today".
5. WHEN the User taps a Plant_Profile card on the Virtual_Jungle, THE App SHALL navigate to the full Plant_Profile screen for that Plant.
6. WHEN the Plant_Kingdom is empty, THE Virtual_Jungle SHALL display an empty-state message and a prominent call-to-action button to add the first Plant.
7. WHILE the App is loading Plant data from the Local_DB on startup, THE Virtual_Jungle SHALL display a loading indicator in place of the plant grid. IF the Local_DB fails to load within 5 seconds, THE App SHALL display an error message and a retry action.
8. A Care_Task is considered "due today" if its scheduled due timestamp falls within the current device local calendar date, from midnight (00:00:00) to the end of the day (23:59:59).

---

### Requirement 3: Care Reminders — Watering

**User Story:** As a User, I want to set recurring watering reminders for each plant, so that I never forget to water them and can keep track of when I last watered each one.

#### Acceptance Criteria

1. THE App SHALL allow the User to configure a watering schedule for each Plant_Profile, specifying a frequency in whole days (minimum 1, maximum 365).
2. WHEN the User saves a watering schedule, THE Notification_Service SHALL schedule a recurring local Reminder at the User's preferred time of day for the configured interval; IF no preferred time of day is set, THE Notification_Service SHALL default to 08:00 in the device's local timezone.
3. WHEN a watering Reminder fires, THE Notification_Service SHALL display a notification containing the Plant's display name and the text "Time to water!".
4. WHEN the User marks a watering Care_Task as complete, THE App SHALL record the completion timestamp in the Local_DB.
5. WHEN the User marks a watering Care_Task as complete, THE Notification_Service SHALL cancel the current pending Reminder and schedule the next Reminder for (completion date + configured interval days) at the preferred time of day.
6. WHEN the User opens a Plant_Profile screen, THE App SHALL display the last watered date formatted as DD/MM/YYYY, or "Not yet recorded" if no completion has been logged, and the next scheduled watering date formatted as DD/MM/YYYY.
7. IF the User has not granted notification permissions, THEN THE App SHALL display an in-app prompt explaining that Reminders require notification permissions and provide a button that opens the device notification permission settings.
8. WHEN the User disables the watering Reminder for a specific Plant, THE Notification_Service SHALL cancel the pending Reminder and THE App SHALL display a visible indicator on the Plant_Profile screen that the watering Reminder is disabled, while preserving the configured schedule frequency in the Local_DB.

---

### Requirement 4: Care Reminders — Fertilising

**User Story:** As a User, I want to set fertilising reminders for each plant, so that I fertilise them on the right schedule without having to remember the last time I did it.

#### Acceptance Criteria

1. THE App SHALL allow the User to configure a fertilising schedule for each Plant_Profile, specifying a frequency in whole days (minimum 1, maximum 365).
2. WHEN the User saves a fertilising schedule, THE Notification_Service SHALL schedule a recurring local Reminder at the User's preferred time of day for the configured interval; IF no preferred time of day is set, THE Notification_Service SHALL default to 08:00 in the device's local timezone.
3. WHEN a fertilising Reminder fires, THE Notification_Service SHALL display a notification containing the Plant's display name and the text "Time to fertilise!".
4. WHEN the User marks a fertilising Care_Task as complete, THE App SHALL record the completion timestamp in the Local_DB.
5. WHEN the User marks a fertilising Care_Task as complete, THE Notification_Service SHALL cancel the current pending Reminder and schedule the next Reminder for (completion date + configured interval days) at the preferred time of day.
6. WHEN the User opens a Plant_Profile screen, THE App SHALL display the last fertilised date formatted as DD/MM/YYYY, or "Not yet recorded" if no completion has been logged, and the next scheduled fertilising date formatted as DD/MM/YYYY.
7. WHEN the User disables the fertilising Reminder for a specific Plant, THE Notification_Service SHALL cancel the pending Reminder and THE App SHALL display a visible indicator on the Plant_Profile screen that the fertilising Reminder is disabled, while preserving the configured schedule frequency in the Local_DB.

---

### Requirement 5: Care Reminders — Pruning

**User Story:** As a User, I want to set pruning reminders for each plant, so that I clip dead leaves and branches at the right time and keep my plants healthy.

#### Acceptance Criteria

1. THE App SHALL allow the User to configure a pruning schedule for each Plant_Profile, specifying a frequency in whole days (minimum 1, maximum 365).
2. WHEN the User saves a pruning schedule, THE Notification_Service SHALL schedule a recurring local Reminder at the User's preferred time of day for the configured interval; IF no preferred time of day is set, THE Notification_Service SHALL default to 08:00 in the device's local timezone.
3. WHEN a pruning Reminder fires, THE Notification_Service SHALL display a notification containing the Plant's display name and the text "Time to prune!".
4. WHEN the User marks a pruning Care_Task as complete, THE App SHALL record the completion timestamp in the Local_DB.
5. WHEN the User marks a pruning Care_Task as complete, THE Notification_Service SHALL cancel the current pending Reminder and schedule the next Reminder for (completion date + configured interval days) at the preferred time of day.
6. WHEN the User opens a Plant_Profile screen, THE App SHALL display the last pruned date formatted as DD/MM/YYYY, or "Not yet recorded" if no completion has been logged, and the next scheduled pruning date formatted as DD/MM/YYYY.
7. WHEN the User disables the pruning Reminder for a specific Plant, THE Notification_Service SHALL cancel the pending Reminder and THE App SHALL display a visible indicator on the Plant_Profile screen that the pruning Reminder is disabled, while preserving the configured schedule frequency in the Local_DB.

---

### Requirement 6: Growth Journal and Photo Timeline

**User Story:** As a User, I want to photograph my plant and attach those photos to a timestamped timeline, so that I can look back and see how much my plant has grown.

#### Acceptance Criteria

1. THE App SHALL provide a Growth_Journal screen for each Plant_Profile displaying Journal_Entries in reverse-chronological order by capture timestamp.
2. WHEN the User adds a Journal_Entry, THE App SHALL present a choice to either take a new photo using the device camera or select an existing photo from the device gallery; IF the User denies camera or gallery permission, THEN THE App SHALL display an error message explaining the required permission and provide a button to open device permission settings.
3. WHEN the User adds a Journal_Entry, THE App SHALL record the capture timestamp automatically as the device's current date and time for camera captures, or the file's creation date for gallery imports; the User may additionally add an optional text note of up to 500 characters.
4. WHEN a Journal_Entry photo is saved, THE App SHALL store the image file in the File_Store under a plant-specific subdirectory and persist the file path, capture timestamp, and optional note as metadata in the Local_DB; IF the File_Store write fails, THEN THE App SHALL display an error message and not persist the Local_DB record.
5. IF the User attempts to save a Journal_Entry without a photo, THEN THE App SHALL display an inline validation error and prevent submission.
6. WHEN the User views a Journal_Entry, THE App SHALL display the photo at full width, the capture timestamp formatted as "DD MMM YYYY, HH:MM" (e.g. "12 Jun 2025, 09:30"), and the optional note (or nothing if no note was added).
7. WHEN the User confirms deletion of a Journal_Entry, THE App SHALL remove the Local_DB record and delete the associated image file from the File_Store; IF the file deletion fails, THE App SHALL still remove the Local_DB record and log the failure silently.
8. IF the User attempts to delete a Journal_Entry, THEN THE App SHALL display a confirmation dialog before executing the deletion.
9. WHERE a Plant has two or more Journal_Entries, THE App SHALL provide a side-by-side comparison view that displays the photos, capture timestamps, and notes of any two User-selected Journal_Entries simultaneously.

---

### Requirement 7: Plant Encyclopedia and Care Guides

**User Story:** As a User, I want to browse an offline reference of common houseplants and their care requirements, so that I can learn how to look after my plants without needing an internet connection.

#### Acceptance Criteria

1. THE App SHALL bundle an offline Encyclopedia containing care information for at least 50 common houseplant species.
2. THE Encyclopedia SHALL store, for each species entry: common name, scientific name, watering frequency guidance (expressed in days), fertilising frequency guidance (expressed in days), pruning frequency guidance (expressed in days), light requirements (one of: Low, Medium, Bright Indirect, Full Sun), and a care summary of up to 500 characters.
3. WHEN the User types into the Encyclopedia search field, THE App SHALL filter the species list in real time to show only entries whose common name or scientific name contains the typed string (case-insensitive); WHEN the User clears the search field, THE App SHALL restore the full unfiltered species list.
4. WHEN the User selects a species entry from the Encyclopedia, THE App SHALL display the full care guide for that species showing all fields defined in criterion 2.
5. WHEN the User is viewing a species entry in the Encyclopedia and taps the "Use This Plant" button, THE App SHALL navigate to the Plant_Profile creation form with the watering frequency, fertilising frequency, and pruning frequency fields pre-filled with the values from that species entry.
6. WHEN the User assigns a species from the Encyclopedia to an existing Plant_Profile, THE App SHALL display a confirmation dialog asking whether to update the existing care schedules to the Encyclopedia's recommended values; IF the User confirms, THE App SHALL update the watering, fertilising, and pruning schedule frequencies in the Local_DB; IF the User declines, THE App SHALL retain the existing schedule values unchanged.
7. IF the User searches the Encyclopedia and no results match the query, THEN THE App SHALL display a "No results found" message in place of the species list.

---

### Requirement 8: Symptom Checker

**User Story:** As a User, I want to describe what looks wrong with my plant and receive a likely diagnosis and recommended action, so that I can address problems before they kill my plant.

#### Acceptance Criteria

1. THE Symptom_Checker SHALL be accessible via a dedicated button on every Plant_Profile screen.
2. WHEN the User opens the Symptom_Checker, THE App SHALL present the first question in a guided decision tree about observable symptoms; each question SHALL offer a set of selectable answers that determine the next question or the final result.
3. WHEN the User completes the decision tree, THE Symptom_Checker SHALL display a likely cause (e.g. "Overwatering") and a specific recommended action (e.g. "Allow soil to dry out fully before next watering").
4. IF the decision tree path does not lead to a conclusive diagnosis, THEN THE Symptom_Checker SHALL display a "No diagnosis found" message and suggest the User consult a plant care resource.
5. THE Symptom_Checker SHALL operate fully offline with no network dependency; all decision tree data SHALL be bundled within the App.
6. WHEN the Symptom_Checker produces a result, THE App SHALL provide a "Save to Profile" button that appends the diagnosis and recommended action as a timestamped note on the relevant Plant_Profile.
7. THE Symptom_Checker decision tree SHALL cover at minimum the following symptom categories: overwatering, underwatering, root rot, nutrient deficiency, pest infestation, and sunlight problems.

---

### Requirement 9: Local Data Persistence and Storage

**User Story:** As a User, I want my plant data to be saved reliably on my device so that it is available when I open the App, even without an internet connection.

#### Acceptance Criteria

1. THE App SHALL use SQLite via a React Native SQLite library (e.g. expo-sqlite) as the Local_DB for all structured Plant data including Plant_Profiles, Care_Task schedules and completion records, and Journal_Entry metadata.
2. THE App SHALL use expo-file-system as the File_Store to persist all Journal_Entry photo assets in a dedicated application-scoped directory (e.g. `<DocumentDirectory>/plant-parent/journal/`).
3. WHEN the App is launched after a device restart, THE App SHALL load all Plant_Kingdom data from the Local_DB and render the Virtual_Jungle within 3 seconds on a device with up to 200 Plant_Profiles.
4. THE App SHALL perform all Local_DB read and write operations on a background thread or via asynchronous APIs so that the UI thread frame rate does not drop below 60 fps during database operations.
5. IF a Local_DB write operation fails, THEN THE App SHALL display an error message stating "Unable to save changes. Please try again." and roll back to the last committed database state, leaving previously persisted data intact.
6. THE App SHALL not transmit any Plant data, photos, user preferences, or personally identifiable information to any remote server in the MVP phase.

---

### Requirement 10: Onboarding

**User Story:** As a new User, I want to be guided through setting up the app on first launch, so that I understand the key features and can get started quickly.

#### Acceptance Criteria

1. WHEN the App is launched for the first time on a device where no onboarding-complete flag exists in AsyncStorage, THE App SHALL display an onboarding flow of exactly 4 screens before showing the Virtual_Jungle.
2. THE onboarding flow SHALL introduce the following features in sequence across the 4 screens: (1) Plant Kingdom, (2) Care Reminders, (3) Growth Journal, (4) Virtual Jungle dashboard.
3. WHEN the User taps "Done" on the final onboarding screen, or taps "Skip" on any onboarding screen, THE App SHALL write an onboarding-complete flag to AsyncStorage and navigate to the Virtual_Jungle; IF the AsyncStorage write fails, THE App SHALL still navigate to the Virtual_Jungle and retry the write silently on next launch.
4. THE onboarding flow SHALL include a dedicated screen that requests notification permissions from the User and explains in plain language that "Reminders notify you when it's time to water, fertilise, or prune your plants"; IF the User denies notification permissions during onboarding, THE App SHALL continue to the next onboarding screen without blocking progress.
5. THE App SHALL display a "Skip" button on every onboarding screen so that the User can bypass the entire remaining flow at any point.

---

### Requirement 11: Future Phase — Plant Identification (Plant_Identifier)

**User Story:** As a User, I want to take a photo of an unknown plant and have the App identify its species, so that I can quickly create an accurate Plant_Profile without manual species lookup.

#### Acceptance Criteria

1. WHERE the Plant_Identifier feature is enabled via a feature flag, THE App SHALL display an "Identify Plant" button on the Plant_Profile creation screen.
2. WHEN the User taps "Identify Plant" and selects or captures a photo, THE Plant_Identifier SHALL send the image to the configured third-party image-recognition API (Plant.id or PlantNet) and return up to 3 species matches, each with a species name and a confidence score expressed as a percentage.
3. WHEN identification results are returned, THE App SHALL display the matches in a ranked list; WHEN the User selects one match, THE App SHALL pre-fill the Plant_Profile's species field with the selected species name and, if a matching Encyclopedia entry exists, load that entry's care values into the care schedule fields.
4. IF the Plant_Identifier API call returns an HTTP error, times out after 15 seconds, or returns zero matches, THEN THE App SHALL display an error message stating "Could not identify plant. Please enter the species manually." and allow the User to type the species name directly.
5. WHILE an identification request is in progress, THE App SHALL display a loading indicator over the identification button and disable the button to prevent duplicate submissions; WHEN the request completes or fails, THE App SHALL re-enable the button.

---

### Requirement 12: Future Phase — Weather-Based Watering Adjustment (Weather_Service)

**User Story:** As a User, I want the App to factor in local weather conditions when recommending watering frequency, so that I don't overwater my plants on rainy weeks or underwater them during a heatwave.

#### Acceptance Criteria

1. WHERE the Weather_Service feature is enabled and the User has granted location permission, THE App SHALL fetch current conditions and a 7-day forecast from the configured weather API once per calendar day; subsequent opens on the same day SHALL use the cached response.
2. WHEN the Weather_Service determines that cumulative rainfall recorded in the last 24 hours exceeds 5 mm, THE App SHALL display a dismissible advisory banner on the Virtual_Jungle reading "Recent rainfall detected — consider skipping outdoor plant watering today."
3. WHEN the Weather_Service determines that the forecast maximum temperature for the current or next day exceeds 35 °C, THE App SHALL display a dismissible advisory banner on the Virtual_Jungle reading "High heat forecast — consider watering more frequently for sensitive species."
4. THE Weather_Service advisories SHALL be informational only; THE App SHALL not automatically reschedule, modify, or cancel any Reminders without explicit User confirmation.
5. IF the Weather_Service API call fails or the device has no network connectivity, THEN THE App SHALL silently use the cached forecast data if available; IF no cached data exists, THE App SHALL not display any weather advisory and SHALL continue to operate using the User-configured watering schedule without showing an error that blocks the UI.
