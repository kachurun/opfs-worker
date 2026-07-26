export function basename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
}

export function dirname(path: string): string {
    const i = path.lastIndexOf('/');

    return i <= 0 ? '' : path.slice(0, i);
}

export function joinParent(parent: string, name: string): string {
    return `${ parent }/${ name }`.replace(/\/{2,}/g, '/') || `/${ name }`;
}
