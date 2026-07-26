import { FolderUp, Trash2, Upload, X } from 'lucide-solid';
import { Show, type Component } from 'solid-js';

import type { UploadModal } from './types';

export const UploadDialog: Component<{
    state: UploadModal;
    onClose: () => void;
    onPickFiles: () => void;
    onPickFolder: () => void;
}> = (props) => {
    const m = () => props.state;
    const progress = () => m() as Extract<UploadModal, { phase: 'uploading' | 'error' }>;
    const pick = () => m() as Extract<UploadModal, { phase: 'pick' }>;
    const errorMsg = () => {
        const current = m();

        return current.phase === 'error' ? current.error : undefined;
    };

    return (
        <dialog class="modal modal-open">
            <div class="modal-box relative max-w-sm">
                <Show when={ m().phase !== 'uploading' }>
                    <button
                        type="button"
                        class="btn btn-ghost btn-square btn-xs absolute right-3 top-3"
                        title="Close"
                        aria-label="Close"
                        onClick={ () => props.onClose() }
                    >
                        <X size={ 14 } />
                    </button>
                </Show>
                <Show
                    when={ m().phase === 'pick' }
                    fallback={ (
                        <>
                            <h3 class="pr-8 text-sm font-semibold">
                                {m().phase === 'error' ? 'Upload failed' : 'Uploading'}
                            </h3>
                            <p class="mono mt-1 truncate text-xs opacity-50" title={ progress().directory }>
                                to {progress().directory}
                            </p>
                            <div class="mt-3 flex items-center justify-between gap-2 text-xs opacity-70">
                                <span class="mono min-w-0 truncate" title={ progress().path }>
                                    {progress().path || '…'}
                                </span>
                                <span class="shrink-0 tabular-nums">
                                    {progress().index + 1}
                                    /
                                    {progress().count}
                                </span>
                            </div>
                            <progress
                                class={ `progress mt-2 w-full ${ m().phase === 'error' ? 'progress-error' : 'progress-primary' }` }
                                value={ progress().percent }
                                max={ 100 }
                            />
                            <div class="mt-1 text-right text-[11px] opacity-50">
                                {progress().percent}
                                %
                            </div>
                            <Show when={ errorMsg() }>
                                {err => <p class="mt-2 text-xs text-error">{err()}</p>}
                            </Show>
                        </>
                    ) }
                >
                    <h3 class="pr-8 text-sm font-semibold">Upload</h3>
                    <p class="mono mt-1 truncate text-xs opacity-60" title={ pick().directory }>
                        to {pick().directory}
                    </p>
                    <div class="mt-4 flex gap-2">
                        <button
                            type="button"
                            class="btn btn-primary btn-sm flex-1 gap-2"
                            onClick={ () => props.onPickFiles() }
                        >
                            <Upload size={ 14 } />
                            Files
                        </button>
                        <button
                            type="button"
                            class="btn btn-primary btn-sm flex-1 gap-2"
                            onClick={ () => props.onPickFolder() }
                        >
                            <FolderUp size={ 14 } />
                            Folder
                        </button>
                    </div>
                </Show>
            </div>
            <Show when={ m().phase !== 'uploading' }>
                <form method="dialog" class="modal-backdrop">
                    <button type="submit" onClick={ () => props.onClose() }>close</button>
                </form>
            </Show>
        </dialog>
    );
};

export const DeleteDialog: Component<{
    target: { path: string; kind: 'file' | 'directory' };
    onCancel: () => void;
    onConfirm: (path: string) => void;
}> = (props) => {
    return (
        <dialog class="modal modal-open">
            <div class="modal-box max-w-sm">
                <div class="flex items-start gap-3">
                    <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-error/15 text-error">
                        <Trash2 size={ 17 } />
                    </div>
                    <div class="min-w-0">
                        <h3 class="text-sm font-semibold">
                            Delete {props.target.kind}?
                        </h3>
                        <p class="mono mt-1 truncate text-xs opacity-60" title={ props.target.path }>
                            {props.target.path}
                        </p>
                        <Show when={ props.target.kind === 'directory' }>
                            <p class="mt-2 text-xs opacity-60">
                                Everything inside this folder will also be deleted.
                            </p>
                        </Show>
                    </div>
                </div>
                <div class="modal-action">
                    <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        onClick={ () => props.onCancel() }
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        class="btn btn-error btn-sm"
                        onClick={ () => props.onConfirm(props.target.path) }
                    >
                        Confirm
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="submit" onClick={ () => props.onCancel() }>close</button>
            </form>
        </dialog>
    );
};

export const CreateDialog: Component<{
    target: { kind: 'file' | 'directory'; directory: string; name: string };
    inputRef: (el: HTMLInputElement) => void;
    onNameChange: (name: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}> = (props) => {
    return (
        <dialog class="modal modal-open">
            <div class="modal-box max-w-sm">
                <h3 class="text-sm font-semibold">
                    {props.target.kind === 'file' ? 'New file' : 'New folder'}
                </h3>
                <p class="mono mt-1 truncate text-xs opacity-60" title={ props.target.directory }>
                    in {props.target.directory}
                </p>
                <input
                    ref={ props.inputRef }
                    class="input input-sm mt-3 w-full"
                    value={ props.target.name }
                    onInput={ e => props.onNameChange(e.currentTarget.value) }
                    onKeyDown={ (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            props.onConfirm();
                        }

                        if (e.key === 'Escape') {
                            e.preventDefault();
                            props.onCancel();
                        }
                    } }
                />
                <div class="modal-action">
                    <button type="button" class="btn btn-ghost btn-sm" onClick={ () => props.onCancel() }>
                        Cancel
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" onClick={ () => props.onConfirm() }>
                        Create
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="submit" onClick={ () => props.onCancel() }>close</button>
            </form>
        </dialog>
    );
};

export const RenameDialog: Component<{
    target: { path: string; kind: 'file' | 'directory'; name: string };
    inputRef: (el: HTMLInputElement) => void;
    onNameChange: (name: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}> = (props) => {
    return (
        <dialog class="modal modal-open">
            <div class="modal-box max-w-sm">
                <h3 class="text-sm font-semibold">Rename</h3>
                <p class="mt-1 truncate text-xs opacity-60">{props.target.path}</p>
                <input
                    ref={ props.inputRef }
                    class="input input-sm mt-3 w-full"
                    value={ props.target.name }
                    onInput={ e => props.onNameChange(e.currentTarget.value) }
                    onKeyDown={ (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            props.onConfirm();
                        }

                        if (e.key === 'Escape') {
                            e.preventDefault();
                            props.onCancel();
                        }
                    } }
                />
                <div class="modal-action">
                    <button type="button" class="btn btn-ghost btn-sm" onClick={ () => props.onCancel() }>
                        Cancel
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" onClick={ () => props.onConfirm() }>
                        Rename
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="submit" onClick={ () => props.onCancel() }>close</button>
            </form>
        </dialog>
    );
};
