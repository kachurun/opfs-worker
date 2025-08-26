import { minimatch } from 'minimatch';

import { normalizePath } from './helpers';

/**
 * Normalize a minimatch pattern, adding recursive glob if requested
 */
export function normalizeMinimatch(path: string, recursive: boolean = false): string {
    path = path.replace(/\/$/, '');
    if (recursive && !path.includes('*')) {
        return `${ path }/**`;
    }

    return path;
}

/**
 * Test a path against a minimatch pattern with dotfiles enabled
 */
export function matchMinimatch(path: string, pattern: string): boolean {
    return minimatch(path, pattern, {
        dot: true,
        matchBase: true,
    });
}

/**
 * Parse .gitignore/.ignore content into ignore and unignore patterns
 */
export function parseIgnoreFile(content: string): { ignore: string[]; unignore: string[] } {
    const ignore: string[] = [];
    const unignore: string[] = [];

    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line || line.startsWith('#')) {
            continue;
        }

        if (line.startsWith('!')) {
            const pat = line.slice(1).trim();

            if (pat) {
                unignore.push(pat);
            }

            continue;
        }

        ignore.push(line);
    }

    return { ignore, unignore };
}

/**
 * Determine if a path is ignored by provided ignore and unignore patterns.
 */
export function isIgnoredByPatterns(path: string, ignore: string[], unignore: string[]): boolean {
    const normalized = normalizePath(path);

    const isUnignored = unignore.some(p => matchMinimatch(normalized, p));

    if (isUnignored) {
        return false;
    }

    return ignore.some(p => matchMinimatch(normalized, p));
}

/**
 * Combine include/exclude globs and ignore patterns to decide inclusion
 */
export function shouldIncludePath(
    path: string,
    opts: { include?: string[]; exclude?: string[] },
    ignore?: { ignore: string[]; unignore: string[] }
): boolean {
    const normalized = normalizePath(path);
    const include = (opts.include && opts.include.length > 0) ? opts.include : ['**'];
    const exclude = (opts.exclude ?? []);

    const included = include.some(p => (p ? matchMinimatch(normalized, p) : false));

    if (!included) {
        return false;
    }

    const excludedByGlob = exclude.some(p => (p ? matchMinimatch(normalized, p) : false));

    if (excludedByGlob) {
        return false;
    }

    if (ignore) {
        if (isIgnoredByPatterns(normalized, ignore.ignore, ignore.unignore)) {
            return false;
        }
    }

    return true;
}

