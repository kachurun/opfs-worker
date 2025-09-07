/**
 * Error code to numeric errno mapping (Node.js compatible)
 */
const ERROR_CODE_TO_ERRNO: Record<string, number> = {
    ENOENT: -2, // No such file or directory
    EISDIR: -21, // Is a directory
    ENOTDIR: -20, // Not a directory
    EACCES: -13, // Permission denied
    EEXIST: -17, // File exists
    ENOTEMPTY: -39, // Directory not empty
    EINVAL: -22, // Invalid argument
    EIO: -5, // I/O error
    ENOSPC: -28, // No space left on device
    EBUSY: -16, // Device or resource busy
    EINTR: -4, // Interrupted system call
    ENOTSUP: -95, // Operation not supported
    ERANGE: -34, // Result too large
    EBADF: -9, // Bad file descriptor
    EROOT: -1, // Custom: Cannot remove root directory
};

/**
 * Base error class for all OPFS-related errors (Node.js SystemError compatible)
 */
export class OPFSError extends Error {
    public readonly errno: number;
    public readonly syscall?: string;
    public readonly path?: string;

    constructor(
        message: string,
        code: string,
        path?: string,
        syscall?: string,
        cause?: any
    ) {
        super(message, { cause });
        this.name = code;
        this.errno = ERROR_CODE_TO_ERRNO[code] || -1;
        this.path = path;
        this.syscall = syscall;
    }
}

/**
 * Error thrown when OPFS is not supported in the current browser
 */
export class OPFSNotSupportedError extends OPFSError {
    constructor(cause?: unknown) {
        super('OPFS is not supported in this browser', 'ENOTSUP', undefined, undefined, cause);
    }
}

/**
 * Error thrown for invalid paths or path traversal attempts
 */
export class PathError extends OPFSError {
    constructor(message: string, path: string, cause?: unknown) {
        super(message, 'INVALID_PATH', path, 'access', cause);
    }
}

/**
 * Error thrown when files or directories don't exist
 */
export class ExistenceError extends OPFSError {
    constructor(type: 'file' | 'directory' | 'source', path: string, cause?: unknown) {
        const messages = {
            file: `File not found: ${ path }`,
            directory: `Directory not found: ${ path }`,
            source: `Source does not exist: ${ path }`,
        };

        super(messages[type], 'ENOENT', path, 'access', cause);
    }
}

/**
 * Error thrown when permission is denied for an operation
 */
export class PermissionError extends OPFSError {
    constructor(path: string, operation: string, cause?: unknown) {
        super(`Permission denied for ${ operation } on: ${ path }`, 'EACCES', path, operation, cause);
    }
}

/**
 * Error thrown when an operation fails due to insufficient storage
 */
export class StorageError extends OPFSError {
    constructor(message: string, path?: string, cause?: unknown) {
        super(message, 'ENOSPC', path, 'write', cause);
    }
}

/**
 * Error thrown when a file is busy (locked by another operation)
 */
export class FileBusyError extends OPFSError {
    constructor(path: string, cause?: unknown) {
        super(`File is busy: ${ path }`, 'EBUSY', path, 'open', cause);
    }
}

/**
 * Error thrown when file/directory type expectations don't match
 */
export class FileTypeError extends OPFSError {
    constructor(actualType: 'file' | 'directory', path: string, cause?: unknown) {
        const message = actualType === 'directory'
            ? `Is a directory: ${ path }`
            : `Not a directory: ${ path }`;
        const code = actualType === 'directory' ? 'EISDIR' : 'ENOTDIR';

        super(message, code, path, 'access', cause);
    }
}

/**
 * Error thrown for validation failures (invalid arguments, formats, etc.)
 */
export class ValidationError extends OPFSError {
    constructor(type: 'argument' | 'format' | 'descriptor' | 'overflow', message: string, path?: string, cause?: unknown) {
        const codes = {
            argument: 'EINVAL',
            format: 'INVALID_FORMAT',
            descriptor: 'EBADF',
            overflow: 'ERANGE',
        };

        super(message, codes[type], path, 'validate', cause);
    }
}

/**
 * Error thrown when an operation is aborted
 */
export class OperationAbortedError extends OPFSError {
    constructor(path: string, cause?: unknown) {
        super(`Operation aborted: ${ path }`, 'EINTR', path, 'interrupt', cause);
    }
}

/**
 * Error thrown for I/O operation failures
 */
export class IOError extends OPFSError {
    constructor(message: string, path?: string, cause?: unknown) {
        super(message, 'EIO', path, 'io', cause);
    }
}

/**
 * Error thrown when an operation is not supported
 */
export class OperationNotSupportedError extends OPFSError {
    constructor(path: string, cause?: unknown) {
        super(`Operation not supported: ${ path }`, 'ENOTSUP', path, 'operation', cause);
    }
}

/**
 * Error thrown when directory operations fail
 */
export class DirectoryOperationError extends OPFSError {
    constructor(code: string, path: string, cause?: unknown) {
        const messages = {
            RM_FAILED: `Failed to remove entry: ${ path }`,
            ENOTEMPTY: `Directory not empty: ${ path }. Use recursive option to force removal.`,
            EROOT: 'Cannot remove root directory',
        };

        super(messages[code as keyof typeof messages] || `Directory operation failed: ${ path }`, code, path, 'unlink', cause);
    }
}


/**
 * Error thrown when OPFS initialization fails
 */
export class InitializationFailedError extends OPFSError {
    constructor(path: string, cause?: unknown) {
        super('Failed to initialize OPFS', 'INIT_FAILED', path, 'init', cause);
    }
}

/**
 * Error thrown when file system operations fail
 */
export class FileSystemOperationError extends OPFSError {
    constructor(operation: string, path: string, cause?: unknown) {
        super(`Failed to ${ operation }: ${ path }`, `${ operation.toUpperCase() }_FAILED`, path, operation, cause);
    }
}

/**
 * Error thrown when a file or directory already exists
 */
export class AlreadyExistsError extends OPFSError {
    constructor(path: string, cause?: unknown) {
        super(`Destination already exists: ${ path }`, 'EEXIST', path, 'open', cause);
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
    const errorCode = `${ operation.toUpperCase() }_FAILED` as 'READ_FAILED' | 'WRITE_FAILED' | 'CLOSE_FAILED';

    return new OPFSError(`Failed to ${ operation } file descriptor: ${ fd }`, errorCode, path, operation, error);
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
            return new FileBusyError(path || 'unknown', error);

        case 'QuotaExceededError':
            return new StorageError(`No space left on device: ${ path || 'unknown' }`, path, error);

        case 'NotFoundError':
            return new ExistenceError('file', path!, error);

        case 'TypeMismatchError':
            if (isDirectory !== undefined) {
                if (isDirectory) {
                    return new FileTypeError('directory', path || 'unknown', error);
                }
                else {
                    return new FileTypeError('file', path || 'unknown', error);
                }
            }

            // Fall through to default for ambiguous cases
            return new ValidationError('argument', `Type mismatch: ${ path || 'unknown' }`, path, error);

        case 'NotAllowedError':
        case 'SecurityError':
            return new PermissionError(path!, 'unknown', error);

        case 'InvalidModificationError':
            return new ValidationError('argument', `Invalid modification: ${ path || 'unknown' }`, path, error);

        case 'AbortError':
            return new OperationAbortedError(path || 'unknown', error);

        case 'OperationError':
            return new IOError(`Operation failed: ${ path || 'unknown' }`, path, error);

        case 'TypeError':
            return new OperationNotSupportedError(path || 'unknown', error);

        default:
            return new IOError(`I/O error: ${ path || 'unknown' }`, path, error);
    }
}
