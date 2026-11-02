// Internal module: not re-exported from the package entry points (unlike ./helpers).
import { normalizePath } from './helpers';

/**
 * Default watch event namespace for a root: `opfs-worker:${normalizedRoot}`.
 *
 * Shared by the backend (which stamps events) and the facade (which filters them),
 * so both agree for any spelling of the same root (`'app'`, `'/app'`).
 */
export function defaultNamespace(root: string): string {
    return `opfs-worker:${ normalizePath(root) }`;
}
