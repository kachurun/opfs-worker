import React, { useEffect, useState } from 'react';

import { useFileSystem } from './FileSystemContext';

interface FileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileNode[];
    content?: string;
}

const FileTreeItem: React.FC<{ node: FileNode; level: number; onSelect: (node: FileNode) => void; selectedPath?: string }> = ({
    node,
    level,
    onSelect,
    selectedPath,
}) => {
    const [expanded, setExpanded] = useState(false);
    const isSelected = selectedPath === node.path;
    const indent = level * 16;

    const handleClick = () => {
        if (node.isDirectory) {
            setExpanded(!expanded);
        }
        else {
            onSelect(node);
        }
    };

    return (
        <div>
            <div
                className={ `file-tree-item ${ isSelected ? 'selected' : '' }` }
                style={ { paddingLeft: `${ 20 + indent }px` } }
                onClick={ handleClick }
            >
                <span className="file-icon">
                    {node.isDirectory ? (expanded ? '📂' : '📁') : '📄'}
                </span>
                <span className="file-name">{node.name}</span>
            </div>
            {node.isDirectory && expanded && node.children && (
                <div>
                    {node.children.map((child, index) => (
                        <FileTreeItem
                            key={ index }
                            node={ child }
                            level={ level + 1 }
                            onSelect={ onSelect }
                            selectedPath={ selectedPath }
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const FileTree: React.FC<{ onFileSelect: (node: FileNode) => void; selectedPath?: string; fileTree: FileNode[]; onRefresh: () => void }> = ({
    onFileSelect,
    selectedPath,
    fileTree,
    onRefresh,
}) => {
    return (
        <div className="file-tree">
            <div className="file-tree-header">
                Files (
                {fileTree.length}
                )
                <button
                    onClick={ onRefresh }
                    style={ {
                        float: 'right',
                        background: 'none',
                        border: 'none',
                        color: '#007bff',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                    } }
                >
                    🔄
                </button>
            </div>
            <div className="file-tree-content">
                {fileTree.length === 0
                    ? (
                        <div style={ { padding: '1rem', color: '#6c757d', textAlign: 'center' } }>
                            No files found
                            <br />
                            <small>Run the demo below to create files</small>
                        </div>
                    )
                    : (
                        fileTree.map((node, index) => (
                            <FileTreeItem
                                key={ index }
                                node={ node }
                                level={ 0 }
                                onSelect={ onFileSelect }
                                selectedPath={ selectedPath }
                            />
                        ))
                    )}
            </div>
        </div>
    );
};

const FileViewer: React.FC<{ selectedFile?: FileNode }> = ({ selectedFile }) => {
    if (!selectedFile) {
        return (
            <div className="file-viewer">
                <div className="file-viewer-header">No file selected</div>
                <div className="file-viewer-content">
                    <p>Select a file from the tree to view its content.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="file-viewer">
            <div className="file-viewer-header">{selectedFile.path}</div>
            <div className="file-viewer-content">
                <pre className="file-content">{selectedFile.content || 'No content available'}</pre>
            </div>
        </div>
    );
};

// Helper function to convert file system entries to tree structure
const buildFileTree = async(fs: any, path: string = '/'): Promise<FileNode[]> => {
    try {
        console.log('🔍 Building file tree for path:', path);
        const entries = await fs.readdir(path, { withFileTypes: true });

        console.log('🔍 Found entries:', entries);

        const tree: FileNode[] = [];

        for (const entry of entries) {
            const fullPath = path === '/' ? `/${ entry.name }` : `${ path }/${ entry.name }`;

            console.log('🔍 Processing entry:', entry, 'fullPath:', fullPath);

            if (entry.isDirectory) {
                const children = await buildFileTree(fs, fullPath);

                tree.push({
                    name: entry.name,
                    path: fullPath,
                    isDirectory: true,
                    children,
                });
            }
            else {
                try {
                    const content = await fs.readFile(fullPath, 'utf-8');

                    tree.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: false,
                        content: content as string,
                    });
                }
                catch (err) {
                    console.log('⚠️ Could not read file:', fullPath, err);
                    // If we can't read the file, still show it but without content
                    tree.push({
                        name: entry.name,
                        path: fullPath,
                        isDirectory: false,
                        content: 'Unable to read file content',
                    });
                }
            }
        }

        const sortedTree = tree.sort((a, b) => {
            // Directories first, then files
            if (a.isDirectory && !b.isDirectory) {
                return -1;
            }
            if (!a.isDirectory && b.isDirectory) {
                return 1;
            }

            // Ensure both names are strings before comparing
            const nameA = String(a.name || '');
            const nameB = String(b.name || '');

            return nameA.localeCompare(nameB);
        });

        console.log('🔍 Built tree for path:', path, 'with', sortedTree.length, 'items');

        return sortedTree;
    }
    catch (err) {
        console.error('❌ Error building file tree for path:', path, err);

        return [];
    }
};

export const MainContent: React.FC = () => {
    const { fs, isInitialized, error, triggerFileTreeReload } = useFileSystem();
    const [selectedFile, setSelectedFile] = useState<FileNode | undefined>();
    const [fileTree, setFileTree] = useState<FileNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadFileTree = async() => {
        if (fs && isInitialized) {
            console.log('🔄 Loading file tree...');
            setIsLoading(true);
            try {
                const tree = await buildFileTree(fs);

                console.log('✅ File tree loaded with', tree.length, 'items');
                setFileTree(tree);
            }
            catch (err) {
                console.error('❌ Failed to load file tree:', err);
            }
            finally {
                setIsLoading(false);
            }
        }
    };

    useEffect(() => {
        void loadFileTree();
    }, [fs, isInitialized]);

    // Listen for reload triggers from LogViewer
    useEffect(() => {
        if (isInitialized) {
            void loadFileTree();
        }
    }, [triggerFileTreeReload]);

    const handleFileSelect = (node: FileNode) => {
        if (!node.isDirectory) {
            setSelectedFile(node);
        }
    };

    if (error) {
        return (
            <div className="main-content">
                <div className="error-message">
                    Error initializing file system:
                    {' '}
                    {error}
                </div>
            </div>
        );
    }

    if (!isInitialized || isLoading) {
        return (
            <div className="main-content">
                <div className="loading-message">
                    {!isInitialized ? 'Initializing file system...' : 'Loading files...'}
                </div>
            </div>
        );
    }

    return (
        <div className="main-content">
            <div className="panels-container">
                <FileTree onFileSelect={ handleFileSelect } selectedPath={ selectedFile?.path } fileTree={ fileTree } onRefresh={ loadFileTree } />
                <FileViewer selectedFile={ selectedFile } />
            </div>
        </div>
    );
};
