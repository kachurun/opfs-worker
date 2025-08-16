import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { createWorker } from '../src';

import type { RemoteOPFSWorker } from '../src';

interface FileSystemContextType {
    fs: RemoteOPFSWorker | null;
    isInitialized: boolean;
    error: string | null;
    triggerFileTreeReload: () => void;
}

const FileSystemContext = createContext<FileSystemContextType>({
    fs: null,
    isInitialized: false,
    error: null,
    triggerFileTreeReload: () => {},
});

export const useFileSystem = () => useContext(FileSystemContext);

export const FileSystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const fsRef = useRef<RemoteOPFSWorker | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    const triggerFileTreeReload = () => {
        setReloadTrigger(prev => prev + 1);
    };

    useEffect(() => {
        const initializeFileSystem = async() => {
            try {
                const fileSystem = createWorker({ root: '/opfs-worker-demo' });

                fsRef.current = fileSystem;
                setIsInitialized(true);
            }
            catch (err) {
                console.error('File system initialization error:', err);
                setError(err instanceof Error ? err.message : 'Failed to initialize file system');
            }
        };

        void initializeFileSystem();
    }, []);

    return (
        <FileSystemContext.Provider value={ { fs: fsRef.current, isInitialized, error, triggerFileTreeReload } }>
            {children}
        </FileSystemContext.Provider>
    );
};
