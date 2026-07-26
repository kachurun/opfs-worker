import { ChevronsUpDown, Moon, RotateCcw, Sun } from 'lucide-solid';
import { FaBrandsGithub } from 'solid-icons/fa';
import { For, Show, type Component } from 'solid-js';

import { type DemoMode } from '../lib/fs';
import { MODES } from '../lib/modes';

import type { DemoStore } from '../store';

export const Header: Component<{ store: DemoStore }> = (props) => {
    return (
        <header class="flex h-10 shrink-0 items-center gap-3 border-b border-base-300 bg-base-100 px-3">
            <div class="flex shrink-0 items-center gap-2">
                <span class="text-sm font-semibold">OPFS Explorer</span>
                <a
                    class="btn btn-ghost btn-square btn-xs opacity-60 hover:opacity-100"
                    href="https://github.com/kachurun/opfs-worker"
                    target="_blank"
                    rel="noreferrer"
                    title="GitHub"
                    aria-label="GitHub repository"
                >
                    <FaBrandsGithub size={ 14 } />
                </a>
            </div>

            <div class="ml-auto flex shrink-0 items-center gap-2">
                <Show when={ !props.store.ready() && !props.store.error() }>
                    <span class="loading loading-spinner loading-xs" />
                </Show>
                <Show when={ props.store.error() }>
                    {err => <span class="text-[11px] text-error" title={ err() }>init failed</span>}
                </Show>
                <label class="relative inline-flex items-center">
                    <select
                        class="select select-xs w-auto appearance-none pr-6"
                        value={ props.store.mode() }
                        onChange={ e => props.store.setMode(e.currentTarget.value as DemoMode) }
                    >
                        <For each={ MODES }>
                            {m => <option value={ m.id }>{m.label}</option>}
                        </For>
                    </select>
                    <ChevronsUpDown size={ 12 } class="pointer-events-none absolute right-1.5 opacity-50" />
                </label>
                <button
                    type="button"
                    class="btn btn-ghost btn-square btn-xs"
                    title={ props.store.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme' }
                    aria-label={ props.store.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme' }
                    onClick={ () => props.store.toggleTheme() }
                >
                    <Show when={ props.store.theme() === 'dark' } fallback={ <Moon size={ 14 } /> }>
                        <Sun size={ 14 } />
                    </Show>
                </button>
                <button
                    type="button"
                    class="btn btn-ghost btn-square btn-xs"
                    title="Reset storage and reseed"
                    aria-label="Reset storage and reseed"
                    onClick={ () => void props.store.clearAll() }
                >
                    <RotateCcw size={ 14 } />
                </button>
            </div>
        </header>
    );
};
