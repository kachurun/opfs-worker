import React, { useEffect, useRef, useState } from 'react';

import { useFileSystem } from './FileSystemContext';
import { encodeString } from '../src/utils/encoder';

interface LogEntry {
    timestamp: string;
    message: string;
}

interface LogViewerUI {
    statusDiv: string;
    outputDiv: LogEntry[];
}

export const LogViewer: React.FC = () => {
    const { fs, isInitialized, triggerFileTreeReload } = useFileSystem();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [status, setStatus] = useState<{ message: string; isError: boolean }>({
        message: 'Waiting for file system...',
        isError: false,
    });
    const outputRef = useRef<HTMLPreElement>(null);

    const log = (message: string) => {
        const timestamp = new Date().toISOString();

        console.log(message);
        setLogs(prev => [...prev, { timestamp, message }]);
    };

    const setStatusMessage = (message: string, isError: boolean) => {
        setStatus({ message, isError });
    };

    // Auto-scroll to bottom when new logs are added
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        const runDemo = async() => {
            if (!fs || !isInitialized) {
                return;
            }

            try {
                setStatusMessage('Running demo operations...', false);
                log('🚀 Starting OPFS demo operations...');

                log('🧹 Cleaning up previous demo data...');
                await fs.clear('/');
                log('✅ Cleanup completed');

                // Test sync operation
                log('\n🔄 Testing sync operation...');

                // Prepare some external data to sync
                const externalEntries: [string, string | Uint8Array | Blob][] = [
                    ['/sync/config.json', JSON.stringify({ version: '1.0', synced: true })],
                    ['/sync/binary.dat', new Uint8Array([10, 20, 30, 40, 50])],
                    ['/sync/blob.txt', new Blob(['This is blob content'], { type: 'text/plain' })],
                    ['sync/relative-path.txt', 'This path will be normalized'], // Test path normalization
                ];

                // Sync without cleaning
                await fs.sync(externalEntries);
                log('✅ Synced external data without cleaning');

                // Verify synced files exist
                const syncedConfig = await fs.readFile('/sync/config.json');

                log(`✅ Synced config content: ${ syncedConfig }`);

                const syncedBinary = await fs.readFile('/sync/binary.dat', 'binary');

                log(`✅ Synced binary data: [${ Array.from(syncedBinary).join(', ') }]`);

                const syncedBlob = await fs.readFile('/sync/blob.txt');

                log(`✅ Synced blob content: "${ syncedBlob }"`);

                const normalizedPath = await fs.readFile('/sync/relative-path.txt');

                log(`✅ Normalized path content: "${ normalizedPath }"`);

                // Basic file operations
                log('\n📁 Testing basic file operations...');

                // Write a file
                const testData = 'Hello, OPFS World! 🌍\nThis is a test file.';

                await fs.writeFile('/text/demo.txt', testData);
                log(`✅ Created '/text/demo.txt' with data: "${ testData }"`);

                // Read the file back
                const readContent = await fs.readFile('/text/demo.txt');

                log(`✅ Read content: "${ readContent }"`);

                // Append to file
                await fs.appendFile('/text/demo.txt', '\n📝 This line was appended!');
                const appendedContent = await fs.readFile('/text/demo.txt', 'utf-8');

                log(`✅ After append: "${ appendedContent }"`);

                // File stats
                const stats = await fs.stat('/text/demo.txt');

                log(`📊 File stats: size=${ stats.size }, isFile=${ stats.isFile }, modified=${ stats.mtime }`);

                // Binary file operations
                log('\n🔢 Testing binary operations...');
                const binaryData = encodeString('Hello', 'binary'); // "Hello"

                await fs.writeFile('/binary/demo.dat', binaryData);
                log(`✅ Binary file: wrote ${ binaryData.length } bytes: [${ String(binaryData) }]`);

                const readBinary = await fs.readFile('/binary/demo.dat', 'binary');

                log(`✅ Binary file: read ${ readBinary.length } bytes: [${ String(readBinary) }]`);

                // Directory operations
                log('\n📂 Testing directory operations...');

                // Create directories
                await fs.mkdir('/dir/sub-dir', { recursive: true });
                await fs.mkdir('/dir2', { recursive: false });
                log('✅ Created nested directories: /dir/sub-dir');

                // Create files in directories
                await fs.writeFile('/dir/file1.txt', 'File 1 content');
                await fs.writeFile('/dir/file2.txt', 'File 2 content');
                await fs.writeFile('/dir/sub-dir/nested.txt', 'Nested file content');
                log('✅ Created files in directories');

                // List directory contents
                const rootContents = await fs.readdir('/', { withFileTypes: false });

                log(`📋 Root directory contents: ${ rootContents.join(', ') }`);

                const testDirContents = await fs.readdir('/dir', { withFileTypes: false });

                log(`📋 /dir contents: ${ testDirContents.join(', ') }`);

                // File existence checks
                log('\n🔍 Testing file existence...');
                log(`✅ /text/demo.txt exists: ${ await fs.exists('/text/demo.txt') }`);
                log(`✅ /dir/sub-dir exists: ${ await fs.exists('/dir/sub-dir/') }`);
                log(`❌ /nonexistent.txt exists: ${ await fs.exists('/nonexistent.txt') }`);
                log(`❌ /dir/nonexistent/ exists: ${ await fs.exists('/dir/nonexistent/') }`);

                // Copy operations
                log('\n📋 Testing copy operations...');
                await fs.copy('/text/demo.txt', '/text/copied-demo.txt');
                log('✅ Copied /text/demo.txt to /text/copied-demo.txt');
                log(`✅ Original file exists: ${ await fs.exists('/text/demo.txt') }`);
                log(`✅ Copied file exists: ${ await fs.exists('/text/copied-demo.txt') }`);

                // Copy directory
                await fs.copy('/dir', '/dir-copy', { recursive: true });
                log('✅ Copied directory /dir to /dir-copy recursively');
                const copiedDirContents = await fs.readdir('/dir-copy', { withFileTypes: false });

                log(`📋 /dir-copy contents: ${ copiedDirContents.join(', ') }`);

                // Rename operations
                log('\n✏️ Testing rename operations...');
                await fs.rename('/text/demo.txt', '/text/renamed-demo.txt');
                log('✅ Renamed /text/demo.txt to /text/renamed-demo.txt');
                log(`❌ Original file exists: ${ await fs.exists('/text/demo.txt') }`);
                log(`✅ Renamed file exists: ${ await fs.exists('/text/renamed-demo.txt') }`);

                // Index operation - list all files with stats
                log('\n📊 Testing file system indexing...');

                // First, index without hashes to see all files quickly
                log('📋 Basic index (without hashes):');
                const index = await fs.index();

                log(`✅ Found ${ index.size } entries`);

                // Display basic index contents
                for (const [path, stat] of index) {
                    const type = stat.isFile ? 'file' : 'directory';
                    const size = stat.isFile ? ` (${ stat.size } bytes)` : '';

                    log(`  📄 ${ path }: ${ type }${ size }`);
                }

                // Now test indexing with hashes
                log('\n🔐 Index with file hashes:');
                const indexWithHashes = await fs.index({ includeHash: true });
                let hashedFileCount = 0;

                for (const [path, stat] of indexWithHashes) {
                    if (stat.isFile) {
                        hashedFileCount++;
                        if (stat.hash) {
                            log(`  🔐 ${ path }: ${ stat.size } bytes, SHA-1: ${ stat.hash.substring(0, 16) }...`);
                        }
                        else {
                            log(`  📄 ${ path }: ${ stat.size } bytes (hash failed)`);
                        }
                    }
                    else {
                        log(`  📁 ${ path }: directory`);
                    }
                }

                log(`✅ Successfully processed ${ hashedFileCount } files with hash calculation`);

                // Show some specific lookups
                const syncConfigStats = index.get('/sync/config.json');

                if (syncConfigStats) {
                    log(`📋 Synced config stats: ${ syncConfigStats.size } bytes, modified: ${ syncConfigStats.mtime }`);
                }

                const syncBinaryStats = index.get('/sync/binary.dat');

                if (syncBinaryStats) {
                    log(`📋 Synced binary stats: ${ syncBinaryStats.size } bytes, modified: ${ syncBinaryStats.mtime }`);
                }

                // Cleanup demonstration
                log('\n🧹 Testing cleanup operations...');

                // Remove a synced file
                await fs.remove('/sync/config.json');
                log('✅ Deleted /sync/config.json');

                const exists = await fs.exists('/sync/config.json');

                log(`❌ /sync/config.json exists: ${ exists }`);

                // Remove a directory and its contents
                await fs.remove('/sync', { recursive: true });
                log('✅ Recursively deleted /sync directory');

                const existsDir = await fs.exists('/sync');

                log(`❌ /sync exists: ${ existsDir }`);

                // Final summary
                log('\n🎉 All tests completed successfully!');
                setStatusMessage('🎉 Demo completed successfully! All features working.', false);

                // Trigger file tree reload in MainContent
                triggerFileTreeReload();
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                setStatusMessage(`❌ Demo failed: ${ errorMessage }`, true);
                log(`❌ Demo failed with error: ${ errorMessage }`);
                console.error('Demo error:', error);
            }
        };

        void runDemo();
    }, [fs, isInitialized]);

    return (
        <div className="log-viewer">
            <pre ref={ outputRef } className="log-output">
                {logs.map((logEntry, index) => (
                    <div key={ index } className="log-entry">
                        {logEntry.timestamp}
                        :
                        {logEntry.message}
                    </div>
                ))}
            </pre>

            <div className={ `status-message ${ status.isError ? 'error' : 'success' }` }>
                {status.message}
            </div>
        </div>
    );
};
