import { Show, type Component } from 'solid-js';

import { EventLog } from './components/EventLog';
import { FileBrowser } from './components/FileBrowser';
import { Header } from './components/Header';
import { Inspector } from './components/Inspector';
import { ModePanel } from './components/ModePanel';
import { createDemoStore } from './store';

export const App: Component = () => {
    const store = createDemoStore();
    const prefersDark = () => store.theme() === 'dark';

    return (
        <div class="flex h-full min-h-0 flex-col">
            <Header store={ store } />

            <ModePanel store={ store } />

            <div class="demo-layout grid min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
                <div class="min-h-0 overflow-hidden border-b border-base-300 md:border-b-0 md:border-r">
                    <Show when={ store.fs() }>
                        {fs => (
                            <FileBrowser
                                fs={ fs() }
                                tree={ store.tree() }
                                selectedPath={ store.selectedPath() }
                                selectedKind={ store.selectedKind() }
                                onSelect={ store.selectPath }
                                onRefresh={ () => void store.refreshTree() }
                                onLog={ store.pushLog }
                                quota={ store.quota() }
                                registerActions={ store.registerBrowserActions }
                            />
                        )}
                    </Show>
                </div>
                <div class="min-h-0 overflow-hidden md:col-start-2 md:row-start-1">
                    <Show when={ store.fs() }>
                        {fs => (
                            <Inspector
                                fs={ fs() }
                                path={ store.selectedPath() }
                                kind={ store.selectedKind() }
                                refreshToken={ store.refreshToken() }
                                onLog={ store.pushLog }
                                onRefresh={ () => void store.refreshTree() }
                                onSelect={ store.selectPath }
                                dark={ prefersDark() }
                                onNewFile={ () => store.browserActions()?.newFile() }
                                onNewFolder={ () => store.browserActions()?.newFolder() }
                                onUpload={ () => store.browserActions()?.upload() }
                                onDownload={ (path, kind) => store.browserActions()?.download(path, kind) }
                            />
                        )}
                    </Show>
                </div>
                <div class="min-h-0 overflow-hidden md:col-span-2 md:row-start-2">
                    <EventLog
                        entries={ store.entries() }
                        onClear={ store.clearLog }
                    />
                </div>
            </div>
        </div>
    );
};
