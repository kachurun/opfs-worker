import { isBinaryFileExtension } from './utils/encoder';
import { parseIgnoreFile, shouldIncludePath } from './utils/glob';
import { parseSizeToBytes } from './utils/helpers';

import type { SearchInWorkspaceOptions, SearchInWorkspaceResult, SearchMatch } from './types';

interface FSHost {
    readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
    readFile: (path: string) => Promise<Uint8Array>;
    exists: (path: string) => Promise<boolean>;
    stat: (path: string) => Promise<{ isDirectory: boolean; size: number }>;
}

const DEFAULT_EXCLUDES = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'];

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

function buildMatcher(query: string, opts: { useRegExp: boolean; matchCase: boolean; multiline: boolean; dotAll: boolean }) {
    if (opts.useRegExp) {
        const flags = `${ opts.matchCase ? '' : 'i' }${ opts.multiline ? 'm' : '' }${ opts.dotAll ? 's' : '' }g`;

        return { regex: new RegExp(query, flags), plain: null as string | null };
    }

    return { regex: null as RegExp | null, plain: opts.matchCase ? query : query.toLowerCase() };
}

function createWordBoundaryChecker(): (text: string, start: number, end: number) => boolean {
    return (text: string, start: number, end: number): boolean => {
        const left: string = start - 1 >= 0 ? text[start - 1] ?? '' : '';
        const right: string = end < text.length ? text[end] ?? '' : '';
        const reWord = /[\p{L}\p{N}_$]/u;

        return !reWord.test(left) && !reWord.test(right);
    };
}

function collectLineStarts(content: string): number[] {
    const lineStarts: number[] = [0];

    for (let i = 0; i < content.length; i++) {
        if (content[i] === '\n') {
            lineStarts.push(i + 1);
        }
    }

    return lineStarts;
}

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

function scanRegex(
    content: string,
    regex: RegExp,
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

    regex.lastIndex = 0;
    let lastIndexGuard = -1;

    // eslint-disable-next-line no-cond-assign
    while ((m = regex.exec(content)) !== null) {
        if (shouldAbort?.()) {
            return { matches, reachedGlobalLimit: true };
        }

        const startIdx = m.index;
        const text = m[0] ?? '';
        const matchLen = text.length;

        if (matchLen === 0) {
            if (regex.lastIndex === lastIndexGuard) {
                break;
            }

            regex.lastIndex = startIdx + 1;
            lastIndexGuard = regex.lastIndex;
        }
        else {
            lastIndexGuard = regex.lastIndex;
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

function scanPlain(
    text: string,
    plain: string,
    matchCase: boolean,
    matchWholeWord: boolean,
    isWholeWordBoundary: (text: string, start: number, end: number) => boolean,
    maxResults: number,
    maxResultsPerFile: number,
    shouldAbort?: () => boolean
): { matches: SearchMatch[]; reachedGlobalLimit: boolean } {
    const matches: SearchMatch[] = [];
    const content = matchCase ? text : text.toLowerCase();
    const lines = content.split(/\n/);
    const originalLines = text.split(/\n/);
    let total = 0;
    let perFile = 0;
    let runningOffset = 0;

    for (let i = 0; i < lines.length; i++) {
        if (shouldAbort?.()) {
            return { matches, reachedGlobalLimit: true };
        }

        const line = lines[i];
        const originalLine = originalLines[i];

        if (line === undefined || originalLine === undefined) {
            continue;
        }

        let idx = 0;

        while (true) {
            idx = line.indexOf(plain, idx);
            if (idx === -1) {
                break;
            }

            const start = idx;
            const end = idx + plain.length;

            if (matchWholeWord && !isWholeWordBoundary(originalLine, start, end)) {
                idx = start + 1;

                continue;
            }

            matches.push({ line: i + 1, character: start + 1, length: plain.length, lineText: originalLine.replace(/\r$/, ''), byteOffset: runningOffset + start });
            if (++total >= maxResults) {
                return { matches, reachedGlobalLimit: true };
            }
            if (++perFile >= maxResultsPerFile) {
                break;
            }

            idx = start + 1;
        }

        runningOffset += originalLine.length + 1;
        if (perFile >= maxResultsPerFile) {
            break;
        }
    }

    return { matches, reachedGlobalLimit: false };
}

export async function searchInWorkspace(
    host: FSHost,
    query: string,
    options: SearchInWorkspaceOptions | undefined,
    callbacks: { onResult: (result: SearchInWorkspaceResult) => void; onDone: () => void; onError?: (error: string) => void },
    shouldAbort?: () => boolean
): Promise<void> {
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
    let matcher: { regex: RegExp | null; plain: string | null };

    try {
        matcher = buildMatcher(query, { useRegExp, matchCase, multiline, dotAll });
    }
    catch (err) {
        callbacks.onError?.(`Invalid regex: ${ (err as Error)?.message ?? String(err) }`);
        callbacks.onDone();

        return;
    }

    const isWholeWordBoundary = createWordBoundaryChecker();
    let totalMatches = 0;

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

            let result: { matches: SearchMatch[]; reachedGlobalLimit: boolean };

            if (matcher.regex) {
                result = scanRegex(text, matcher.regex, matchWholeWord, isWholeWordBoundary, maxResults - totalMatches, maxResultsPerFile, shouldAbort);
            }
            else {
                result = scanPlain(text, matcher.plain!, matchCase, matchWholeWord, isWholeWordBoundary, maxResults - totalMatches, maxResultsPerFile, shouldAbort);
            }

            if (result.matches.length > 0) {
                callbacks.onResult({ root, fileUri: fullPath, matches: result.matches });
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
        callbacks.onError?.((err as Error)?.message ?? String(err));
    }
    finally {
        callbacks.onDone();
    }
}

