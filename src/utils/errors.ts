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


/**
 * Create an OPFSError with file descriptor context
 * 
 * @param operation - The operation that failed (e.g., 'read', 'write', 'close')
 * @param fd - The file descriptor number
 * @param path - The file path
 * @param error - The underlying error (optional)
 * @returns OPFSError with appropriate context
 */
export function createFDError(operation: string, fd: number, path: string, error?: any): OPFSError {
    const errorCode = `${ operation.toUpperCase() }_FAILED` as any;

    return new OPFSError(`Failed to ${ operation } file descriptor: ${ fd }`, errorCode, path, error);
}

/**
 * Map DOM exceptions to OPFS error codes
 * 
 * @param error - The DOM exception to map
 * @param context - Context information for better error mapping
 * @param context.path - File path for context-specific errors
 * @param context.isDirectory - Whether the operation involves a directory
 * @returns OPFSError with appropriate error code
 */
export function mapDomError(error: any, context?: { path?: string; isDirectory?: boolean }): OPFSError {
    const path = context?.path;
    const isDirectory = context?.isDirectory;

    switch (error.name) {
        case 'InvalidStateError':
            return new OPFSError(`File is busy: ${ path || 'unknown' }`, 'EBUSY', path, error);

        case 'QuotaExceededError':
            return new OPFSError(`No space left on device: ${ path || 'unknown' }`, 'ENOSPC', path, error);

        case 'NotFoundError':
            return new OPFSError(`No such file or directory: ${ path || 'unknown' }`, 'ENOENT', path, error);

        case 'TypeMismatchError':
            if (isDirectory !== undefined) {
                if (isDirectory) {
                    return new OPFSError(`Not a directory: ${ path || 'unknown' }`, 'ENOTDIR', path, error);
                }
                else {
                    return new OPFSError(`Is a directory: ${ path || 'unknown' }`, 'EISDIR', path, error);
                }
            }

            // Fall through to default for ambiguous cases
            return new OPFSError(`Type mismatch: ${ path || 'unknown' }`, 'EINVAL', path, error);

        case 'NotAllowedError':
        case 'SecurityError':
            return new OPFSError(`Permission denied: ${ path || 'unknown' }`, 'EACCES', path, error);

        case 'InvalidModificationError':
            return new OPFSError(`Invalid modification: ${ path || 'unknown' }`, 'EINVAL', path, error);

        case 'AbortError':
            return new OPFSError(`Operation aborted: ${ path || 'unknown' }`, 'EINTR', path, error);

        case 'OperationError':
            return new OPFSError(`Operation failed: ${ path || 'unknown' }`, 'EIO', path, error);

        case 'TypeError':
            return new OPFSError(`Operation not supported: ${ path || 'unknown' }`, 'ENOTSUP', path, error);

        default:
            return new OPFSError(`I/O error: ${ path || 'unknown' }`, 'EIO', path, error);
    }
}
