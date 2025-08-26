import { isBinaryFileExtension } from '../utils/encoder';
import { parseIgnoreFile, shouldIncludePath } from '../utils/glob';
import { parseSizeToBytes } from '../utils/helpers';

import type { SearchInWorkspaceOptions, SearchInWorkspaceResult, SearchMatch } from '../types';

interface FSHost {
    readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
    readFile: (path: string) => Promise<Uint8Array>;
    exists: (path: string) => Promise<boolean>;
    stat: (path: string) => Promise<{ isDirectory: boolean; size: number }>;
}

const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'];

/**
 * Loads ignore patterns from .gitignore and .ignore files in the workspace root.
 * 
 * @param host - The file system host interface for reading files
 * @param includeIgnored - If true, returns undefined (no ignore patterns applied)
 * @returns Object containing ignore and unignore patterns, or undefined if no patterns should be applied
 */
async function loadIgnoreSet(host: FSHost, includeIgnored: boolean): Promise<{ ignore: string[]; unignore: string[] } | undefined> {
    if (includeIgnored) {
        return undefined;
    }

    try {
        const patterns: { ignore: string[]; unignore: string[] } = { ignore: [], unignore: [] };

        if (await host.exists('/.gitignore')) {
            const content = new TextDecoder().decode(await host.readFile('/.gitignore'));
            const parsed = parseIgnoreFile(content);

            patterns.ignore.push(...parsed.ignore);
            patterns.unignore.push(...parsed.unignore);
        }
        if (await host.exists('/.ignore')) {
            const content = new TextDecoder().decode(await host.readFile('/.ignore'));
            const parsed = parseIgnoreFile(content);

            patterns.ignore.push(...parsed.ignore);
            patterns.unignore.push(...parsed.unignore);
        }

        return patterns;
    }
    catch {
        return undefined;
    }
}

/**
 * Builds a search matcher based on the query and search options.
 * Creates either a regular expression matcher or a plain text matcher.
 * 
 * @param query - The search query string
 * @param opts - Search options including regex flags and case sensitivity
 * @returns Object containing either a regex matcher or plain text matcher
 */
function buildMatcher(query: string, opts: { useRegExp: boolean; matchCase: boolean; multiline: boolean; dotAll: boolean }): { regex: RegExp; plain: string | null } {
    if (opts.useRegExp) {
        const flags = `${ opts.matchCase ? '' : 'i' }${ opts.multiline ? 'm' : '' }${ opts.dotAll ? 's' : '' }g`;

        return { regex: new RegExp(query, flags), plain: null as string | null };
    }

    // For plain text, we'll create a regex with proper escaping and case sensitivity
    const escapedQuery = escapeRegExp(query);
    const flags = `${ opts.matchCase ? '' : 'i' }g`;

    return { regex: new RegExp(escapedQuery, flags), plain: null as string | null };
}

/**
 * Creates a function that checks if a match occurs at a word boundary.
 * Used for whole word matching to ensure matches don't occur in the middle of words.
 * 
 * @returns Function that takes text and match boundaries and returns true if at word boundary
 */
function createWordBoundaryChecker(): (text: string, start: number, end: number) => boolean {
    return (text: string, start: number, end: number): boolean => {
        const left: string = start - 1 >= 0 ? text[start - 1] ?? '' : '';
        const right: string = end < text.length ? text[end] ?? '' : '';
        const reWord = /[\p{L}\p{N}_$]/u;

        return !reWord.test(left) && !reWord.test(right);
    };
}

/**
 * Collects the starting positions of all lines in a text content.
 * Used for efficient line number calculation during search result processing.
 * 
 * @param content - The text content to analyze
 * @returns Array of character indices where each line starts
 */
function collectLineStarts(content: string): number[] {
    const lineStarts: number[] = [0];

    for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') {
            lineStarts.push(i + 1);
        }
    }

    return lineStarts;
}

/**
 * Performs binary search to find the line number for a given character index.
 * More efficient than linear search for large files with many lines.
 * 
 * @param lineStarts - Array of line start positions from collectLineStarts
 * @param index - Character index to find the line number for
 * @returns The 1-based line number where the character index is located
 */
function binarySearchLine(lineStarts: number[], index: number): number {
    let lineNum = 1;
    let lo = 0;
    let hi = lineStarts.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const midValue = lineStarts[mid];

        if (midValue !== undefined && midValue <= index) {
            lineNum = mid + 1;
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }

    return lineNum;
}

/**
 * Scans text content to find search matches using regex.
 * Handles both regex patterns and plain text with support for whole word boundaries and result limits.
 * 
 * @param content - The text content to search in
 * @param matcher - Object containing the regex to use for matching
 * @param matchWholeWord - Whether to only match at word boundaries
 * @param isWholeWordBoundary - Function to check word boundaries
 * @param maxResults - Maximum total results to return
 * @param maxResultsPerFile - Maximum results per file
 * @param shouldAbort - Optional function to check if search should be aborted
 * @returns Object containing found matches and whether global limit was reached
 */
function scanContent(
    content: string,
    matcher: { regex: RegExp; plain: string | null },
    matchWholeWord: boolean,
    isWholeWordBoundary: (text: string, start: number, end: number) => boolean,
    maxResults: number,
    maxResultsPerFile: number,
    shouldAbort?: () => boolean
): { matches: SearchMatch[]; reachedGlobalLimit: boolean } {
    const matches: SearchMatch[] = [];
    const lineStarts = collectLineStarts(content);
    let total = 0;
    let perFile = 0;
    let m: RegExpExecArray | null;

    // matcher.regex is now always defined since we create it in buildMatcher
    const searchRegex = matcher.regex;

    searchRegex.lastIndex = 0;
    let lastIndexGuard = -1;

    // eslint-disable-next-line no-cond-assign
    while ((m = searchRegex.exec(content)) !== null) {
        if (shouldAbort?.()) {
            return { matches, reachedGlobalLimit: true };
        }

        const startIdx = m.index;
        const text = m[0] ?? '';
        const matchLen = text.length;

        if (matchLen === 0) {
            if (searchRegex.lastIndex === lastIndexGuard) {
                break;
            }

            searchRegex.lastIndex = startIdx + 1;
            lastIndexGuard = searchRegex.lastIndex;
        }
        else {
            lastIndexGuard = searchRegex.lastIndex;
        }

        const lineNum = binarySearchLine(lineStarts, startIdx);
        const lineStart = lineStarts[lineNum - 1];
        const nextLineStart = lineNum < lineStarts.length ? lineStarts[lineNum] : content.length + 1;

        if (lineStart !== undefined && nextLineStart !== undefined) {
            const lineText = content.slice(lineStart, nextLineStart - 1).replace(/\r$/, '');
            const character = startIdx - lineStart + 1;

            if (matchWholeWord && !isWholeWordBoundary(lineText, character - 1, character - 1 + matchLen)) {
                if (++total >= maxResults) {
                    return { matches, reachedGlobalLimit: true };
                }
                if (++perFile >= maxResultsPerFile) {
                    break;
                }

                continue;
            }

            matches.push({ line: lineNum, character, length: matchLen, lineText, byteOffset: startIdx });
            if (++total >= maxResults) {
                return { matches, reachedGlobalLimit: true };
            }
            if (++perFile >= maxResultsPerFile) {
                break;
            }
        }
    }

    return { matches, reachedGlobalLimit: false };
}

/**
 * Escapes special regex characters in a string to make it safe for use in RegExp constructor.
 * This allows plain text searches to work correctly without regex interpretation.
 * 
 * @param string - The string to escape
 * @returns The escaped string safe for regex construction
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Main search function that searches for text patterns across the entire workspace.
 * Recursively walks through directories, applies filters, and searches file contents.
 * 
 * @param host - The file system host interface for file operations
 * @param query - The search query string or regex pattern
 * @param options - Search configuration options including filters, limits, and matching behavior
 * @param callbacks - Callback functions for handling results, completion, and errors
 * @param shouldAbort - Optional function to check if the search should be aborted early
 * @returns Promise that resolves to an array of search results
 */
export async function searchInWorkspace(
    host: FSHost,
    query: string,
    options: SearchInWorkspaceOptions | undefined,
    callbacks?: { onResult?: (result: SearchInWorkspaceResult) => void; onDone?: () => void; onError?: (error: string) => void },
    shouldAbort?: () => boolean
): Promise<SearchInWorkspaceResult[]> {
    const results: SearchInWorkspaceResult[] = [];
    const root = options?.root ?? '/';
    const maxFileSizeBytes = parseSizeToBytes(options?.maxFileSize, 20 * 1024 * 1024);

    const maxResults = (typeof options?.maxResults === 'number' && options.maxResults > 0)
        ? options.maxResults
        : Number.POSITIVE_INFINITY;

    const maxResultsPerFile = (typeof options?.maxResultsPerFile === 'number' && options.maxResultsPerFile > 0)
        ? options.maxResultsPerFile
        : Number.POSITIVE_INFINITY;

    const include = options?.include ?? ['**'];
    const exclude = options?.exclude ?? DEFAULT_EXCLUDES;
    const includeIgnored = options?.includeIgnored ?? false;
    const useRegExp = options?.useRegExp ?? false;
    const matchCase = options?.matchCase ?? false;
    const matchWholeWord = options?.matchWholeWord ?? false;
    const multiline = options?.multiline ?? false;
    const dotAll = options?.dotAll ?? false;

    const ignoreSet = await loadIgnoreSet(host, includeIgnored);
    let matcher: { regex: RegExp; plain: string | null };

    try {
        matcher = buildMatcher(query, { useRegExp, matchCase, multiline, dotAll });
    }
    catch (err) {
        callbacks?.onDone?.();

        throw new Error(`Invalid regex: ${ (err as Error)?.message ?? String(err) }`);
    }

    const isWholeWordBoundary = createWordBoundaryChecker();
    let totalMatches = 0;

    /**
     * Recursively walks through directories to find and search files.
     * Applies filters, checks file sizes, and performs text search on matching files.
     * 
     * @param dirPath - The directory path to walk
     * @returns Promise that resolves to true if search should stop, false otherwise
     */
    const walk = async(dirPath: string): Promise<boolean> => {
        if (shouldAbort?.()) {
            return true;
        }

        const items = await host.readDir(dirPath);

        for (const item of items) {
            if (shouldAbort?.()) {
                return true;
            }

            const fullPath = `${ dirPath === '/' ? '' : dirPath }/${ item.name }`;

            if (!shouldIncludePath(fullPath, { include, exclude }, ignoreSet)) {
                continue;
            }

            const stat = await host.stat(fullPath);

            if (stat.isDirectory) {
                const stop = await walk(fullPath);

                if (stop) {
                    return true;
                }

                continue;
            }
            if (stat.size > maxFileSizeBytes) {
                continue;
            }
            if (isBinaryFileExtension(fullPath)) {
                continue;
            }

            const fileBuffer = await host.readFile(fullPath);
            const text = new TextDecoder().decode(fileBuffer);

            const result = scanContent(text, matcher, matchWholeWord, isWholeWordBoundary, maxResults - totalMatches, maxResultsPerFile, shouldAbort);

            if (result.matches.length > 0) {
                callbacks?.onResult?.({ root, fileUri: fullPath, matches: result.matches });
                results.push({ root, fileUri: fullPath, matches: result.matches });
            }

            totalMatches += result.matches.length;
            if (result.reachedGlobalLimit || totalMatches >= maxResults) {
                return true;
            }
        }

        return false;
    };

    try {
        await walk('/');
    }
    catch (err) {
        callbacks?.onError?.((err as Error)?.message ?? String(err));
    }
    finally {
        callbacks?.onDone?.();
    }

    return results;
}

