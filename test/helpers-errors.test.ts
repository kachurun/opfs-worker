import { describe, it, expect } from 'vitest';

import {
  AlreadyExistsError,
  ExistenceError,
  FileBusyError,
  FileTypeError,
  IOError,
  OperationAbortedError,
  OperationNotSupportedError,
  PermissionError,
  StorageError,
  ValidationError,
  mapDomError,
} from '../src/utils/errors';
import {
  basename,
  dirname,
  extname,
  joinPath,
  normalizePath,
  resolvePath,
  buffersEqual,
  isPathExcluded,
  normalizeMinimatch,
} from '../src/utils/helpers';

describe('path helpers', () => {
  it('normalizePath / joinPath / basename / dirname / extname', () => {
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('a/b')).toBe('/a/b');
    expect(normalizePath('~/x')).toBe('/x');
    expect(joinPath(['a', 'b'])).toBe('/a/b');
    expect(joinPath('z')).toBe('z');
    expect(basename('/a/b.txt')).toBe('b.txt');
    expect(dirname('/a/b.txt')).toBe('/a');
    expect(extname('/a/b.txt')).toBe('.txt');
    expect(extname('/a/.hidden')).toBe('');
  });

  it('resolvePath handles ., .. and home', () => {
    expect(resolvePath('./config/../data/file.txt')).toBe('/data/file.txt');
    expect(resolvePath('/path/to/../file.txt')).toBe('/path/file.txt');
    expect(resolvePath('../../file.txt')).toBe('/file.txt');
    expect(resolvePath('~/config/../data/file.txt')).toBe('/data/file.txt');
  });

  it('buffersEqual / isPathExcluded / normalizeMinimatch', () => {
    expect(buffersEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(buffersEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
    expect(buffersEqual(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);

    expect(isPathExcluded('/a/b', undefined)).toBe(false);
    expect(isPathExcluded('/dist/x.js', ['**/dist/**'])).toBe(true);
    expect(isPathExcluded('/src/x.js', ['**/dist/**'])).toBe(false);

    expect(normalizeMinimatch('/data', true)).toBe('/data/**');
    expect(normalizeMinimatch('/data/', false)).toBe('/data');
  });
});

describe('mapDomError', () => {
  it('maps known DOM exception names', () => {
    expect(mapDomError({ name: 'InvalidStateError' }, { path: '/a' })).toBeInstanceOf(FileBusyError);
    expect(mapDomError({ name: 'QuotaExceededError' }, { path: '/a' })).toBeInstanceOf(StorageError);
    expect(mapDomError({ name: 'NotFoundError' }, { path: '/a' })).toBeInstanceOf(ExistenceError);
    expect(mapDomError({ name: 'TypeMismatchError' }, { path: '/a', isDirectory: true })).toBeInstanceOf(FileTypeError);
    expect(mapDomError({ name: 'TypeMismatchError' }, { path: '/a', isDirectory: false })).toBeInstanceOf(FileTypeError);
    expect(mapDomError({ name: 'TypeMismatchError' }, { path: '/a' })).toBeInstanceOf(ValidationError);
    expect(mapDomError({ name: 'NotAllowedError' }, { path: '/a' })).toBeInstanceOf(PermissionError);
    expect(mapDomError({ name: 'SecurityError' }, { path: '/a' })).toBeInstanceOf(PermissionError);
    expect(mapDomError({ name: 'InvalidModificationError' }, { path: '/a' })).toBeInstanceOf(ValidationError);
    expect(mapDomError({ name: 'AbortError' }, { path: '/a' })).toBeInstanceOf(OperationAbortedError);
    expect(mapDomError({ name: 'OperationError' }, { path: '/a' })).toBeInstanceOf(IOError);
    expect(mapDomError({ name: 'TypeError' }, { path: '/a' })).toBeInstanceOf(OperationNotSupportedError);
    expect(mapDomError({ name: 'SomethingElse' }, { path: '/a' })).toBeInstanceOf(IOError);
  });

  it('maps remove operation specially', () => {
    const empty = mapDomError(
      { name: 'InvalidModificationError' },
      { path: '/dir', operation: 'remove' }
    );

    expect(empty.name).toBe('ENOTEMPTY');

    const failed = mapDomError(
      { name: 'Unknown' },
      { path: '/dir', operation: 'remove' }
    );

    expect(failed.name).toBe('RM_FAILED');
  });

  it('uses existenceType for NotFoundError', () => {
    const err = mapDomError(
      { name: 'NotFoundError' },
      { path: '/d', existenceType: 'directory' }
    );

    expect(err).toBeInstanceOf(ExistenceError);
    expect(err.message).toContain('Directory not found');
  });
});

describe('error classes', () => {
  it('constructs common OPFS errors', () => {
    expect(new AlreadyExistsError('/x').name).toBe('EEXIST');
    expect(new ValidationError('overflow', 'too big').name).toBe('ERANGE');
    expect(new ValidationError('descriptor', 'bad').name).toBe('EBADF');
  });
});
