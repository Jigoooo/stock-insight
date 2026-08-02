import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_FILE_UPLOAD_ACCEPT,
  DEFAULT_FILE_UPLOAD_MAX_SIZE,
  resolveFileUploadSelection,
} from '../src/shared/ui/file-upload/file-upload-state.ts';

const file = (name: string, size: number, type = '') => ({ name, size, type });

describe('shared FileUpload selection contract', () => {
  it('appends valid repeated files in multiple mode and reports invalid inputs', () => {
    let id = 0;
    const result = resolveFileUploadSelection({
      accept: DEFAULT_FILE_UPLOAD_ACCEPT,
      createId: () => `upload-${++id}`,
      currentFiles: [{ id: 'existing', name: 'existing.csv', size: 24 }],
      incomingFiles: [
        file('report.csv', 32, 'text/csv'),
        file('report.csv', 48, 'text/csv'),
        file('notes.txt', 64, 'text/plain'),
        file('large.pdf', DEFAULT_FILE_UPLOAD_MAX_SIZE + 1, 'application/pdf'),
      ],
      maxSize: DEFAULT_FILE_UPLOAD_MAX_SIZE,
      mode: 'multiple',
    });

    assert.deepEqual(
      result.files.map(({ id: fileId, name, size }) => ({ id: fileId, name, size })),
      [
        { id: 'existing', name: 'existing.csv', size: 24 },
        { id: 'upload-1', name: 'report.csv', size: 32 },
        { id: 'upload-2', name: 'report.csv', size: 48 },
      ],
    );
    assert.deepEqual(
      result.rejections.map(({ file: rejectedFile, reason }) => ({
        name: rejectedFile.name,
        reason,
      })),
      [
        { name: 'notes.txt', reason: 'type' },
        { name: 'large.pdf', reason: 'size' },
      ],
    );
  });

  it('replaces the current value with the first valid file in single mode', () => {
    let id = 0;
    const result = resolveFileUploadSelection({
      accept: '.csv,.pdf',
      createId: () => `single-${++id}`,
      currentFiles: [{ id: 'existing', name: 'existing.csv', size: 24 }],
      incomingFiles: [file('skip.txt', 12), file('first.pdf', 32), file('second.csv', 48)],
      maxSize: 1024,
      mode: 'single',
    });

    assert.deepEqual(
      result.files.map(({ id: fileId, name }) => ({ id: fileId, name })),
      [{ id: 'single-1', name: 'first.pdf' }],
    );
    assert.deepEqual(
      result.rejections.map(({ file: rejectedFile, reason }) => ({
        name: rejectedFile.name,
        reason,
      })),
      [{ name: 'skip.txt', reason: 'type' }],
    );
  });

  it('preserves the current file when a single-mode selection is fully rejected', () => {
    const currentFiles = [{ id: 'existing', name: 'existing.csv', size: 24 }];
    const result = resolveFileUploadSelection({
      accept: '.csv,.pdf',
      createId: () => 'unused',
      currentFiles,
      incomingFiles: [file('notes.txt', 12, 'text/plain')],
      maxSize: 1024,
      mode: 'single',
    });

    assert.equal(result.files, currentFiles);
    assert.deepEqual(
      result.rejections.map(({ reason }) => reason),
      ['type'],
    );
  });
});
