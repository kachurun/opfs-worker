export interface Crumb {
    name: string;
    path: string;
    kind: 'file' | 'directory';
}

export function toCrumbs(path: string, isDirectory: boolean): Crumb[] {
    const segments = path.split('/').filter(Boolean);

    return segments.map((name, i) => ({
        name,
        path: `/${ segments.slice(0, i + 1).join('/') }`,
        kind: i === segments.length - 1 && !isDirectory ? 'file' : 'directory',
    }));
}
