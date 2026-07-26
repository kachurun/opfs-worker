import type { WatchEvent } from '../../src';

export type LogKind = 'op' | 'watch' | 'error' | 'info';

export interface LogEntry {
    id: number;
    kind: LogKind;
    time: string;
    message: string;
    detail?: string;
}

export function formatWatchDetail(event: WatchEvent): string {
    const parts = [
        event.type,
        event.path,
        event.isDirectory ? 'dir' : 'file',
        event.hash ? `hash=${ event.hash }` : null,
    ].filter(Boolean);

    return parts.join(' · ');
}
