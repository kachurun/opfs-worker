/**
 * Base error class for all OPFS-related errors
 */
export class OPFSError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly path?: string,
        cause?: any
    ) {
        super(message, { cause });
        this.name = 'OPFSError';
    }
}

/**
 * Error thrown when OPFS is not supported in the current browser
 */
export class OPFSNotSupportedError extends OPFSError {
    constructor(cause?: unknown) {
        super('OPFS is not supported in this browser', 'OPFS_NOT_SUPPORTED', undefined, cause);
    }
}


/**
 * Error thrown when OPFS is not mounted
 */
export class OPFSNotMountedError extends OPFSError {
    constructor(cause?: unknown) {
        super('OPFS is not mounted', 'OPFS_NOT_MOUNTED', undefined, cause);
    }
}

/**
 * Error thrown for invalid paths or path traversal attempts
 */
export class PathError extends OPFSError {
    constructor(message: string, path: string, cause?: unknown) {
        super(message, 'INVALID_PATH', path, cause);
    }
}

/**
 * Error thrown when a requested file doesn't exist
 */
export class FileNotFoundError extends OPFSError {
    constructor(path: string, cause?: unknown) {
        super(`File not found: ${ path }`, 'FILE_NOT_FOUND', path, cause);
    }
}

/**
 * Error thrown when a requested directory doesn't exist
 */
export class DirectoryNotFoundError extends OPFSError {
    constructor(path: string, cause?: unknown) {
        super(`Directory not found: ${ path }`, 'DIRECTORY_NOT_FOUND', path, cause);
    }
}

/**
 * Error thrown when permission is denied for an operation
 */
export class PermissionError extends OPFSError {
    constructor(path: string, operation: string, cause?: unknown) {
        super(`Permission denied for ${ operation } on: ${ path }`, 'PERMISSION_DENIED', path, cause);
    }
}

/**
 * Error thrown when an operation fails due to insufficient storage
 */
export class StorageError extends OPFSError {
    constructor(message: string, path?: string, cause?: unknown) {
        super(message, 'STORAGE_ERROR', path, cause);
    }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends OPFSError {
    constructor(operation: string, path?: string, cause?: unknown) {
        super(`Operation timed out: ${ operation }`, 'TIMEOUT_ERROR', path, cause);
    }
}
