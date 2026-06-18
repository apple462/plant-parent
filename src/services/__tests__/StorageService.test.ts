// Feature: plant-parent, Task 5.2 — Unit tests for StorageService with
// `expo-file-system` mocked.
//
// Validates: Requirements 9.2 (File_Store directory layout), 6.4 (journal
// write failure surfaces a StorageError), 6.7 (journal delete failure is
// logged silently, never thrown), 1.6 (plant-deletion file failures do not
// block deletion).
//
// expo-file-system is mocked inline (jest.mock) so these tests run without a
// native runtime. The mock mirrors only the SDK 56 class-based members the
// service actually touches (verified against StorageService.ts and
// https://docs.expo.dev/versions/v56.0.0/sdk/filesystem/):
//   - Paths.document                       -> base document directory URI
//   - new Directory(...segments)           -> joins segments into a `.uri`
//   - directory.create({ intermediates, idempotent })
//   - new File(...segments)                -> joins segments into a `.uri`
//   - file.exists  (getter)                -> driven by a per-uri map
//   - file.delete()                        -> delegates to a configurable impl
//   - source.copy(destination)  (async)    -> delegates to a configurable impl
//
// Because the service constructs File/Directory instances internally, the mock
// exposes a `__mock` control surface so tests can (a) inspect created
// instances, (b) toggle `exists` per uri, and (c) force `copy`/`delete` to
// fail. Path/URI assertions are made against the value the service returns
// (destination.uri), which the mock composes from Directory segments + name.

jest.mock('expo-file-system', () => {
  /** Coerce a path segment (string, File, or Directory) to its string form. */
  const segmentToString = (segment: unknown): string => {
    if (segment == null) return '';
    if (typeof segment === 'string') return segment;
    if (typeof (segment as { uri?: unknown }).uri === 'string') {
      return (segment as { uri: string }).uri;
    }
    return String(segment);
  };

  /** Join path segments with single slashes, trimming any trailing slashes. */
  const joinSegments = (segments: unknown[]): string =>
    segments
      .map(segmentToString)
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/\/+$/, ''))
      .join('/');

  const createdDirectories: any[] = [];
  const createdFiles: any[] = [];
  const existsByUri: Record<string, boolean> = {};
  let copyImpl: (source: any, destination: any) => unknown = () => undefined;
  let deleteImpl: (file: any) => void = () => undefined;
  let createImpl: (directory: any, options: unknown) => void = () => undefined;

  class MockDirectory {
    uri: string;
    create: jest.Mock;

    constructor(...segments: unknown[]) {
      this.uri = joinSegments(segments);
      this.create = jest.fn((options: unknown) => createImpl(this, options));
      createdDirectories.push(this);
    }
  }

  class MockFile {
    uri: string;
    delete: jest.Mock;
    copy: jest.Mock;

    constructor(...segments: unknown[]) {
      this.uri = joinSegments(segments);
      this.delete = jest.fn(() => deleteImpl(this));
      this.copy = jest.fn((destination: any) => copyImpl(this, destination));
      createdFiles.push(this);
    }

    get exists(): boolean {
      return existsByUri[this.uri] ?? false;
    }
  }

  return {
    __esModule: true,
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: 'file:///document' },
    __mock: {
      createdDirectories,
      createdFiles,
      setExists: (uri: string, value: boolean) => {
        existsByUri[uri] = value;
      },
      setCopyImpl: (fn: (source: any, destination: any) => unknown) => {
        copyImpl = fn;
      },
      setDeleteImpl: (fn: (file: any) => void) => {
        deleteImpl = fn;
      },
      setCreateImpl: (fn: (directory: any, options: unknown) => void) => {
        createImpl = fn;
      },
      reset: () => {
        createdDirectories.length = 0;
        createdFiles.length = 0;
        for (const key of Object.keys(existsByUri)) delete existsByUri[key];
        copyImpl = () => undefined;
        deleteImpl = () => undefined;
        createImpl = () => undefined;
      },
    },
  };
});

import * as FileSystem from 'expo-file-system';

import {
  COVERS_DIR,
  JOURNAL_DIR,
  STORAGE_ROOT_DIR,
  StorageError,
  deletePhoto,
  getExtension,
  savePhoto,
  storageService,
} from '../StorageService';

// Control surface exposed by the mock factory above.
const fsMock = (FileSystem as unknown as {
  __mock: {
    createdDirectories: any[];
    createdFiles: any[];
    setExists: (uri: string, value: boolean) => void;
    setCopyImpl: (fn: (source: any, destination: any) => unknown) => void;
    setDeleteImpl: (fn: (file: any) => void) => void;
    setCreateImpl: (fn: (directory: any, options: unknown) => void) => void;
    reset: () => void;
  };
}).__mock;

const DOC = 'file:///document';

beforeEach(() => {
  fsMock.reset();
  jest.clearAllMocks();
});

describe('getExtension', () => {
  it.each<[string, string]>([
    ['IMG.JPG', 'jpg'], // upper-cased extension is lower-cased
    ['photo.png', 'png'],
    ['archive.tar.gz', 'gz'], // only the final extension is used
    ['noext', ''], // no dot
    ['.hidden', ''], // leading dot only
    ['trailing.', ''], // trailing dot only
  ])('maps %p to %p', (filename, expected) => {
    expect(getExtension(filename)).toBe(expected);
  });
});

describe('savePhoto — cover photo (no entryId)', () => {
  it('writes to covers/<plantId>.<ext> and returns the destination uri', async () => {
    const result = await savePhoto('plant-1', 'file:///tmp/source.jpg', 'photo.jpg');

    expect(result).toBe(`${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}/plant-1.jpg`);
  });

  it('derives the extension from the filename, lower-cased', async () => {
    const result = await savePhoto('plant-7', 'file:///tmp/source', 'CAPTURE.PNG');

    expect(result).toBe(`${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}/plant-7.png`);
  });

  it('omits the extension when the filename has none', async () => {
    const result = await savePhoto('plant-2', 'file:///tmp/source', 'noext');

    expect(result).toBe(`${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}/plant-2`);
  });

  it('creates the covers directory tree with intermediates and idempotency', async () => {
    await savePhoto('plant-1', 'file:///tmp/source.jpg', 'photo.jpg');

    const coversDir = fsMock.createdDirectories.find(
      (d) => d.uri === `${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}`,
    );
    expect(coversDir).toBeDefined();
    expect(coversDir.create).toHaveBeenCalledTimes(1);
    expect(coversDir.create).toHaveBeenCalledWith({ intermediates: true, idempotent: true });
  });

  it('copies the source file into the destination', async () => {
    const copySpy = jest.fn();
    fsMock.setCopyImpl(copySpy);

    await savePhoto('plant-1', 'file:///tmp/source.jpg', 'photo.jpg');

    expect(copySpy).toHaveBeenCalledTimes(1);
    const [source, destination] = copySpy.mock.calls[0];
    expect(source.uri).toBe('file:///tmp/source.jpg');
    expect(destination.uri).toBe(`${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}/plant-1.jpg`);
  });

  it('removes a pre-existing destination file before copying (cover replacement)', async () => {
    const destUri = `${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}/plant-1.jpg`;
    fsMock.setExists(destUri, true);

    await savePhoto('plant-1', 'file:///tmp/source.jpg', 'photo.jpg');

    const destination = fsMock.createdFiles.find((f) => f.uri === destUri);
    expect(destination).toBeDefined();
    expect(destination.delete).toHaveBeenCalledTimes(1);
  });
});

describe('savePhoto — journal photo (with entryId)', () => {
  it('writes to journal/<plantId>/<entryId>.<ext> and returns the destination uri', async () => {
    const result = await savePhoto('plant-1', 'file:///tmp/source.png', 'snap.png', {
      entryId: 'entry-9',
    });

    expect(result).toBe(
      `${DOC}/${STORAGE_ROOT_DIR}/${JOURNAL_DIR}/plant-1/entry-9.png`,
    );
  });

  it('creates the per-plant journal directory tree', async () => {
    await savePhoto('plant-1', 'file:///tmp/source.png', 'snap.png', { entryId: 'entry-9' });

    const journalDir = fsMock.createdDirectories.find(
      (d) => d.uri === `${DOC}/${STORAGE_ROOT_DIR}/${JOURNAL_DIR}/plant-1`,
    );
    expect(journalDir).toBeDefined();
    expect(journalDir.create).toHaveBeenCalledWith({ intermediates: true, idempotent: true });
  });
});

describe('savePhoto — write failures (Req 6.4)', () => {
  it('throws a StorageError when copy fails', async () => {
    fsMock.setCopyImpl(() => {
      throw new Error('disk full');
    });

    await expect(
      savePhoto('plant-1', 'file:///tmp/source.jpg', 'photo.jpg'),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it('throws a StorageError when an async copy rejects', async () => {
    fsMock.setCopyImpl(() => Promise.reject(new Error('io error')));

    await expect(
      savePhoto('plant-1', 'file:///tmp/source.jpg', 'photo.jpg'),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it('wraps the original error and references the plant id in the message', async () => {
    const original = new Error('permission denied');
    fsMock.setCopyImpl(() => {
      throw original;
    });

    await expect(
      savePhoto('plant-42', 'file:///tmp/source.jpg', 'photo.jpg'),
    ).rejects.toMatchObject({
      name: 'StorageError',
      message: expect.stringContaining('plant-42'),
      originalError: original,
    });
  });

  it('surfaces a StorageError when directory creation fails', async () => {
    fsMock.setCreateImpl(() => {
      throw new Error('mkdir failed');
    });

    await expect(
      savePhoto('plant-1', 'file:///tmp/source.jpg', 'photo.jpg'),
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe('deletePhoto', () => {
  it('deletes the file when it exists', async () => {
    const filePath = `${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}/plant-1.jpg`;
    fsMock.setExists(filePath, true);

    await expect(deletePhoto(filePath)).resolves.toBeUndefined();

    const file = fsMock.createdFiles.find((f) => f.uri === filePath);
    expect(file).toBeDefined();
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  it('does not call delete when the file does not exist', async () => {
    const filePath = `${DOC}/${STORAGE_ROOT_DIR}/${COVERS_DIR}/missing.jpg`;
    fsMock.setExists(filePath, false);

    await deletePhoto(filePath);

    const file = fsMock.createdFiles.find((f) => f.uri === filePath);
    expect(file.delete).not.toHaveBeenCalled();
  });

  it('logs and never throws when delete fails (Req 6.7, Req 1.6)', async () => {
    const filePath = `${DOC}/${STORAGE_ROOT_DIR}/${JOURNAL_DIR}/plant-1/entry-9.png`;
    fsMock.setExists(filePath, true);
    fsMock.setDeleteImpl(() => {
      throw new Error('delete failed');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(deletePhoto(filePath)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toEqual(expect.stringContaining(filePath));

    warnSpy.mockRestore();
  });
});

describe('storageService default instance', () => {
  it('exposes savePhoto and deletePhoto bound to the module functions', () => {
    expect(storageService.savePhoto).toBe(savePhoto);
    expect(storageService.deletePhoto).toBe(deletePhoto);
  });
});
