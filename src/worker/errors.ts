/**
 * Base error class for all OPFS-related errors
 */
export class OPFSError extends Error {
    constructor(message: string, public readonly code: string, public readonly path?: string) {
        super(message);
        this.name = 'OPFSError';
    }
}

/**
 * Error thrown when OPFS is not supported in the current browser
 */
export class OPFSNotSupportedError extends OPFSError {
    constructor() {
        super('OPFS is not supported in this browser', 'OPFS_NOT_SUPPORTED');
    }
}

/**
 * Error thrown for invalid paths or path traversal attempts
 */
export class PathError extends OPFSError {
    constructor(message: string, path: string) {
        super(message, 'INVALID_PATH', path);
    }
}

/**
 * Error thrown when a requested file doesn't exist
 */
export class FileNotFoundError extends OPFSError {
    constructor(path: string) {
        super(`File not found: ${ path }`, 'FILE_NOT_FOUND', path);
    }
}

/**
 * Error thrown when a requested directory doesn't exist
 */
export class DirectoryNotFoundError extends OPFSError {
    constructor(path: string) {
        super(`Directory not found: ${ path }`, 'DIRECTORY_NOT_FOUND', path);
    }
}

/**
 * Error thrown when permission is denied for an operation
 */
export class PermissionError extends OPFSError {
    constructor(path: string, operation: string) {
        super(`Permission denied for ${ operation } on: ${ path }`, 'PERMISSION_DENIED', path);
    }
}

/**
 * Error thrown when an operation fails due to insufficient storage
 */
export class StorageError extends OPFSError {
    constructor(message: string, path?: string) {
        super(message, 'STORAGE_ERROR', path);
    }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends OPFSError {
    constructor(operation: string, path?: string) {
        super(`Operation timed out: ${ operation }`, 'TIMEOUT_ERROR', path);
    }
}
