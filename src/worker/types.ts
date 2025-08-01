export interface FileStat {
    size: number;
    mtime: Date;
    ctime: Date;
    isFile: () => boolean;
    isDirectory: () => boolean;
}
