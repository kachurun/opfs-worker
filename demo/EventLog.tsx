import type { WatchEvent } from '../src';

export type LogKind = 'op' | 'watch' | 'error' | 'info';

export interface LogEntry {
    id: number;
    kind: LogKind;
    time: string;
    message: string;
    detail?: string;
}

interface EventLogProps {
    entries: LogEntry[];
    onClear: () => void;
}

const kindClass: Record<LogKind, string> = {
    op: 'badge-info',
    watch: 'badge-success',
    error: 'badge-error',
    info: 'badge-ghost',
};

export function EventLog({ entries, onClear }: EventLogProps) {
    const endRef = (node: HTMLDivElement | null) => {
        if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    };

    return (
        <section className="flex h-full min-h-0 flex-col border-t border-base-300 bg-base-100">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-base-300 px-3">
                <h2 className="text-xs font-medium opacity-70">Event log</h2>
                <button type="button" className="btn btn-ghost btn-xs ml-auto" title="Clear log" onClick={onClear}>
                    Clear
                </button>
            </div>
            <div className="mono min-h-0 flex-1 overflow-auto px-3 py-1.5 text-[11px] leading-5">
                {entries.length === 0 && (
                    <div className="opacity-50">No events yet — upload a file or edit something.</div>
                )}
                {entries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 border-b border-base-200/40 py-0.5">
                        <span className="shrink-0 opacity-40">{entry.time}</span>
                        <span className={`badge ${ kindClass[entry.kind] } shrink-0`}>{entry.kind}</span>
                        <span className="min-w-0 break-all">
                            {entry.message}
                            {entry.detail ? (
                                <span className="opacity-50"> — {entry.detail}</span>
                            ) : null}
                        </span>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </section>
    );
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
