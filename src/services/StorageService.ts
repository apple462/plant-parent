/**
 * StorageService — photo file I/O for Plant Parent.
 *
 * Persists plant cover photos and Growth Journal entry photos to the device
 * File_Store and removes them on deletion. Built on the Expo SDK 56
 * `expo-file-system` class-based API (`File`, `Directory`, `Paths`); the
 * legacy function API (`copyAsync`, `makeDirectoryAsync`, `deleteAsync`) is
 * deprecated in SDK 56 and throws at runtime, so it is intentionally not used.
 *
 * File_Store layout (per design):
 *
 *   <DocumentDirectory>/plant-parent/
 *   ├── covers/<plantId>.<ext>            ← cover photo (one per plant)
 *   └── journal/<plantId>/<entryId>.<ext> ← journal entry photo
 *
 * Validates: Requirements 9.2 (File_Store directory), 6.4 (journal write
 * failure surfaces an error), 6.7 (journal delete failure logged silently),
 * 1.6 (plant-deletion file failures do not block deletion).
 */
import { Directory, File, Paths } from 'expo-file-system';

/** Root subdirectory (under the document directory) for all app photo assets. */
export const STORAGE_ROOT_DIR = 'plant-parent';

/** Subdirectory holding plant cover photos. */
export const COVERS_DIR = 'covers';

/** Subdirectory holding Growth Journal entry photos (one folder per plant). */
export const JOURNAL_DIR = 'journal';

/**
 * Error thrown when a photo cannot be written to the File_Store.
 *
 * Callers (e.g. `JournalService.addEntry`, `PlantService` cover-photo save)
 * catch this to surface the correct user-facing message and to abort the
 * associated Local_DB write (atomicity — Req 6.4).
 */
export class StorageError extends Error {
  /** The underlying error that caused the failure, if any. */
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.originalError = originalError;
    // Restore prototype chain for `instanceof` after transpilation to ES5/ES6.
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/**
 * Options that determine the destination of a saved photo.
 *
 * When `entryId` is provided the photo is treated as a Growth Journal entry
 * photo and stored under `journal/<plantId>/<entryId>.<ext>`. When omitted the
 * photo is treated as the plant cover photo and stored under
 * `covers/<plantId>.<ext>`.
 */
export interface SavePhotoOptions {
  /** Journal entry id. Presence selects the journal destination. */
  entryId?: string;
}

/** Public surface of the storage service. */
export interface StorageService {
  savePhoto(
    plantId: string,
    uri: string,
    filename: string,
    options?: SavePhotoOptions,
  ): Promise<string>;
  deletePhoto(filePath: string): Promise<void>;
}

/**
 * Derives the lower-cased file extension (without the leading dot) from a
 * filename. Returns an empty string when the filename has no usable extension
 * (e.g. no dot, a leading dot, or a trailing dot).
 *
 * Examples: `"IMG_001.JPG"` → `"jpg"`, `"photo.png"` → `"png"`,
 * `"noext"` → `""`, `".hidden"` → `""`.
 */
export function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return '';
  }
  return filename.slice(dotIndex + 1).toLowerCase();
}

/** Builds the destination file name: `<base>.<ext>` (or just `<base>` when no extension). */
function buildDestinationName(base: string, ext: string): string {
  return ext.length > 0 ? `${base}.${ext}` : base;
}

/**
 * Copies a source photo URI into the app File_Store and returns the
 * destination path.
 *
 * - Cover photos go to `covers/<plantId>.<ext>`.
 * - Journal photos (when `options.entryId` is set) go to
 *   `journal/<plantId>/<entryId>.<ext>`.
 *
 * Intermediate directories are created as needed. Any write failure is wrapped
 * in a {@link StorageError} so the caller can surface the correct message and
 * avoid persisting an orphaned Local_DB record (Req 6.4).
 *
 * @param plantId  Owning plant id (used for the cover file name and the journal subfolder).
 * @param uri      Source URI of the photo to copy (camera capture or gallery import).
 * @param filename Original file name; only its extension is used for the destination.
 * @param options  Optional target selector; provide `entryId` for journal photos.
 * @returns The `file://` URI of the written destination file.
 */
export async function savePhoto(
  plantId: string,
  uri: string,
  filename: string,
  options?: SavePhotoOptions,
): Promise<string> {
  const ext = getExtension(filename);

  try {
    let destinationDir: Directory;
    let destinationName: string;

    if (options?.entryId) {
      // Journal photo: journal/<plantId>/<entryId>.<ext>
      destinationDir = new Directory(Paths.document, STORAGE_ROOT_DIR, JOURNAL_DIR, plantId);
      destinationName = buildDestinationName(options.entryId, ext);
    } else {
      // Cover photo: covers/<plantId>.<ext>
      destinationDir = new Directory(Paths.document, STORAGE_ROOT_DIR, COVERS_DIR);
      destinationName = buildDestinationName(plantId, ext);
    }

    // Create the destination directory tree if it does not already exist.
    // `intermediates` creates parent folders; `idempotent` avoids throwing
    // when the directory already exists.
    destinationDir.create({ intermediates: true, idempotent: true });

    const source = new File(uri);
    const destination = new File(destinationDir, destinationName);

    // If a file already exists at the destination (e.g. replacing a cover
    // photo), remove it first so the copy does not fail on an existing target.
    if (destination.exists) {
      destination.delete();
    }

    await source.copy(destination);

    return destination.uri;
  } catch (error) {
    throw new StorageError(
      `Failed to save photo for plant "${plantId}".`,
      error,
    );
  }
}

/**
 * Removes a photo file from the File_Store.
 *
 * Delete failures are tolerated and logged rather than thrown: per Req 6.7 a
 * failed journal-photo delete must still allow the Local_DB record to be
 * removed, and per Req 1.6 a failed delete during plant deletion must not block
 * the overall deletion. Callers can therefore await this method without
 * guarding against rejection.
 *
 * @param filePath Path/URI of the file to remove.
 */
export async function deletePhoto(filePath: string): Promise<void> {
  try {
    const file = new File(filePath);
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    // Silently log — never throw (Req 6.7, Req 1.6).
    console.warn(`StorageService.deletePhoto: failed to delete "${filePath}"`, error);
  }
}

/** Default service instance implementing the {@link StorageService} interface. */
export const storageService: StorageService = {
  savePhoto,
  deletePhoto,
};
