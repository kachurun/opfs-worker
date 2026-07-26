import { For, Show, createEffect, type Component } from 'solid-js';

import type { LogEntry, LogKind } from '../lib/log';

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

export const EventLog: Component<EventLogProps> = (props) => {
    let endEl: HTMLDivElement | undefined;

    createEffect(() => {
        void props.entries.length;
        endEl?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });

    return (
        <section class="flex h-full min-h-0 flex-col border-t border-base-300 bg-base-100">
            <div class="flex h-9 shrink-0 items-center gap-2 border-b border-base-300 px-3">
                <h2 class="text-xs font-medium opacity-70">Event log</h2>
                <button type="button" class="btn btn-ghost btn-xs ml-auto" title="Clear log" onClick={ () => props.onClear() }>
                    Clear
                </button>
            </div>
            <div class="mono min-h-0 flex-1 overflow-auto px-3 py-1.5 text-[11px] leading-5">
                <Show when={ props.entries.length === 0 }>
                    <div class="opacity-50">No events yet — upload a file or edit something.</div>
                </Show>
                <For each={ props.entries }>
                    {entry => (
                        <div class="flex items-center gap-2 border-b border-base-200/40 py-0.5">
                            <span class="shrink-0 opacity-40">{entry.time}</span>
                            <span class={ `badge ${ kindClass[entry.kind] } shrink-0` }>{entry.kind}</span>
                            <span class="min-w-0 break-all">
                                {entry.message}
                                <Show when={ entry.detail }>
                                    {detail => <span class="opacity-50"> — {detail()}</span>}
                                </Show>
                            </span>
                        </div>
                    )}
                </For>
                <div ref={ endEl } />
            </div>
        </section>
    );
};
