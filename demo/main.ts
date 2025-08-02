import { encodeString } from '../src/worker/encoder';
import { createWorker } from '../src/worker/inline-worker';


async function createDemoUI() {
    const container = document.createElement('div');

    container.style.cssText = `
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 800px;
    margin: 2rem auto;
    padding: 2rem;
    background: #f8f9fa;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  `;

    const title = document.createElement('h1');

    title.textContent = 'OPFS Worker Demo';
    title.style.cssText = 'color: #2c3e50; margin-bottom: 2rem;';

    const statusDiv = document.createElement('div');

    statusDiv.style.cssText = `
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    font-weight: 500;
  `;

    const outputDiv = document.createElement('pre');

    outputDiv.style.cssText = `
    background: #2c3e50;
    color: #ecf0f1;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
  `;

    container.appendChild(title);
    container.appendChild(statusDiv);
    container.appendChild(outputDiv);
    document.body.appendChild(container);

    return { statusDiv, outputDiv };
}

function log(message: string, ui: { outputDiv: HTMLPreElement }) {
    console.log(message);
    ui.outputDiv.textContent += `${ new Date().toISOString() }: ${ message }\n`;
    ui.outputDiv.scrollTop = ui.outputDiv.scrollHeight;
}

function setStatus(message: string, isError: boolean, ui: { statusDiv: HTMLDivElement }) {
    ui.statusDiv.textContent = message;
    ui.statusDiv.style.background = isError ? '#e74c3c' : '#27ae60';
    ui.statusDiv.style.color = 'white';
}

async function runDemo() {
    const ui = await createDemoUI();

    try {
        // Initialize file system
        log('🚀 Initializing OPFS file system...', ui);
        const fs = await createWorker();

        log('✅ OPFS file system worker created', ui);

        await fs.mount('/demo');

        log('✅ File system initialized successfully', ui);

        log('🧹 Cleaning up previous demo data...', ui);
        await fs.clear('/');
        log('✅ Cleanup completed', ui);

        // Test sync operation
        log('\n🔄 Testing sync operation...', ui);

        // Prepare some external data to sync
        const externalEntries: [string, string | Uint8Array | Blob][] = [
            ['/sync/config.json', JSON.stringify({ version: '1.0', synced: true })],
            ['/sync/binary.dat', new Uint8Array([10, 20, 30, 40, 50])],
            ['/sync/blob.txt', new Blob(['This is blob content'], { type: 'text/plain' })],
            ['sync/relative-path.txt', 'This path will be normalized'], // Test path normalization
        ];

        // Sync without cleaning
        await fs.sync(externalEntries);
        log('✅ Synced external data without cleaning', ui);

        // Verify synced files exist
        const syncedConfig = await fs.readFile('/sync/config.json');

        log(`✅ Synced config content: ${ syncedConfig }`, ui);

        const syncedBinary = await fs.readFile('/sync/binary.dat', 'binary');

        log(`✅ Synced binary data: [${ Array.from(syncedBinary).join(', ') }]`, ui);

        const syncedBlob = await fs.readFile('/sync/blob.txt');

        log(`✅ Synced blob content: "${ syncedBlob }"`, ui);

        const normalizedPath = await fs.readFile('/sync/relative-path.txt');

        log(`✅ Normalized path content: "${ normalizedPath }"`, ui);


        // Basic file operations
        log('\n📁 Testing basic file operations...', ui);

        // Write a file
        const testData = 'Hello, OPFS World! 🌍\nThis is a test file.';

        await fs.writeFile('/text/demo.txt', testData);
        log(`✅ Created '/text/demo.txt' with data: "${ testData }"`, ui);

        // Read the file back
        const readContent = await fs.readFile('/text/demo.txt');

        log(`✅ Read content: "${ readContent }"`, ui);

        // Append to file
        await fs.appendFile('/text/demo.txt', '\n📝 This line was appended!');
        const appendedContent = await fs.readFile('/text/demo.txt', 'utf-8');

        log(`✅ After append: "${ appendedContent }"`, ui);

        // File stats
        const stats = await fs.stat('/text/demo.txt');

        log(`📊 File stats: size=${ stats.size }, isFile=${ stats.isFile }, modified=${ stats.mtime }`, ui);

        // // Binary file operations
        log('\n🔢 Testing binary operations...', ui);
        const binaryData = encodeString('Hello', 'binary'); // "Hello"

        await fs.writeFile('/binary/demo.dat', binaryData);
        log(`✅ Binary file: wrote ${ binaryData.length } bytes: [${ String(binaryData) }]`, ui);

        const readBinary = await fs.readFile('/binary/demo.dat', 'binary');

        log(`✅ Binary file: read ${ readBinary.length } bytes: [${ String(readBinary) }]`, ui);

        // Directory operations
        log('\n📂 Testing directory operations...', ui);

        // Create directories
        await fs.mkdir('/dir/sub-dir', { recursive: true });
        await fs.mkdir('/dir2', { recursive: false });
        log('✅ Created nested directories: /dir/sub-dir', ui);

        // Create files in directories
        await fs.writeFile('/dir/file1.txt', 'File 1 content');
        await fs.writeFile('/dir/file2.txt', 'File 2 content');
        await fs.writeFile('/dir/sub-dir/nested.txt', 'Nested file content');
        log('✅ Created files in directories', ui);

        // List directory contents
        const rootContents = await fs.readdir('/', { withFileTypes: false });

        log(`📋 Root directory contents: ${ rootContents.join(', ') }`, ui);

        const testDirContents = await fs.readdir('/dir', { withFileTypes: false });

        log(`📋 /dir contents: ${ testDirContents.join(', ') }`, ui);

        // File existence checks
        log('\n🔍 Testing file existence...', ui);
        log(`✅ /text/demo.txt exists: ${ await fs.exists('/text/demo.txt') }`, ui);
        log(`✅ /dir/sub-dir exists: ${ await fs.exists('/dir/sub-dir/') }`, ui);
        log(`❌ /nonexistent.txt exists: ${ await fs.exists('/nonexistent.txt') }`, ui);
        log(`❌ /dir/nonexistent/ exists: ${ await fs.exists('/dir/nonexistent/') }`, ui);

        // Copy operations
        log('\n📋 Testing copy operations...', ui);
        await fs.copy('/text/demo.txt', '/text/copied-demo.txt');
        log('✅ Copied /text/demo.txt to /text/copied-demo.txt', ui);
        log(`✅ Original file exists: ${ await fs.exists('/text/demo.txt') }`, ui);
        log(`✅ Copied file exists: ${ await fs.exists('/text/copied-demo.txt') }`, ui);

        // Copy directory
        await fs.copy('/dir', '/dir-copy', { recursive: true });
        log('✅ Copied directory /dir to /dir-copy recursively', ui);
        const copiedDirContents = await fs.readdir('/dir-copy', { withFileTypes: false });

        log(`📋 /dir-copy contents: ${ copiedDirContents.join(', ') }`, ui);

        // Rename operations
        log('\n✏️ Testing rename operations...', ui);
        await fs.rename('/text/demo.txt', '/text/renamed-demo.txt');
        log('✅ Renamed /text/demo.txt to /text/renamed-demo.txt', ui);
        log(`❌ Original file exists: ${ await fs.exists('/text/demo.txt') }`, ui);
        log(`✅ Renamed file exists: ${ await fs.exists('/text/renamed-demo.txt') }`, ui);

        // Index operation - list all files with stats
        log('\n📊 Testing file system indexing...', ui);
        const index = await fs.index();

        log(`✅ Indexed file system - found ${ index.size } entries`, ui);

        // Display index contents
        for (const [path, stat] of index) {
            const type = stat.isFile ? 'file' : 'directory';
            const size = stat.isFile ? ` (${ stat.size } bytes)` : '';

            log(`  📄 ${ path }: ${ type }${ size }`, ui);
        }

        // Show some specific lookups
        const renamedFileStats = index.get('/text/renamed-demo.txt');

        if (renamedFileStats) {
            log(`📋 Renamed file stats: ${ renamedFileStats.size } bytes, modified: ${ renamedFileStats.mtime }`, ui);
        }

        const binaryFileStats = index.get('/binary/demo.dat');

        if (binaryFileStats) {
            log(`📋 Binary file stats: ${ binaryFileStats.size } bytes, modified: ${ binaryFileStats.mtime }`, ui);
        }

        // Test file hashing
        log('\n🔐 Testing file hashing...', ui);
        const hashStats = await fs.stat('/text/renamed-demo.txt', {
            includeHash: true,
        });

        log('📊 File with hash:', ui);
        log('  📁 Path: /text/renamed-demo.txt', ui);
        log(`  📏 Size: ${ hashStats.size } bytes`, ui);
        if (hashStats.hash) {
            log(`  🔒 SHA-1: ${ hashStats.hash }`, ui);
        }

        // Test indexing with hashes (for smaller files only to avoid performance issues)
        log('\n🔍 Testing index with hashes (small files only)...', ui);
        const indexWithHashes = await fs.index({ includeHash: true });
        let hashedFileCount = 0;

        for (const [path, stat] of indexWithHashes) {
            if (stat.isFile && stat.hash) {
                hashedFileCount++;
                log(`  🔐 ${ path }: ${ stat.size } bytes, SHA-1: ${ stat.hash.substring(0, 16) }...`, ui);
            }
        }

        log(`✅ Successfully hashed ${ hashedFileCount } files`, ui);

        // Test sync with clean before to demonstrate clean functionality
        log('\n🔄 Testing sync with clean before...', ui);

        const beforeCleanIndex = await fs.index();

        log(`📊 Files before clean sync: ${ beforeCleanIndex.size }`, ui);

        const cleanSyncEntries: [string, string | Uint8Array | Blob][] = [
            ['/fresh/start.txt', 'Fresh start after clean'],
            ['/fresh/data.json', JSON.stringify({ fresh: true, cleanedAndSynced: new Date().toISOString() })],
        ];

        await fs.sync(cleanSyncEntries, { cleanBefore: true });
        log('✅ Synced with clean before option', ui);

        const afterCleanIndex = await fs.index();

        log(`📊 Files after clean sync: ${ afterCleanIndex.size }`, ui);

        // Verify only the fresh files exist
        const freshContent = await fs.readFile('/fresh/start.txt');

        log(`✅ Fresh content: "${ freshContent }"`, ui);

        const freshJson = await fs.readFile('/fresh/data.json');

        log(`✅ Fresh JSON: ${ freshJson }`, ui);


        // Cleanup demonstration
        log('\n🧹 Testing cleanup operations...', ui);

        // Try to remove a file that might not exist after clean sync
        const fileExistsBeforeDelete = await fs.exists('/fresh/start.txt');

        if (fileExistsBeforeDelete) {
            await fs.remove('/fresh/start.txt');
            log('✅ Deleted /fresh/start.txt', ui);

            const exists = await fs.exists('/fresh/start.txt');

            log(`❌ /fresh/start.txt exists: ${ exists }`, ui);
        }

        // Remove a directory if it exists
        const dirExistsBeforeDelete = await fs.exists('/fresh');

        if (dirExistsBeforeDelete) {
            await fs.remove('/fresh', { recursive: true });
            log('✅ Recursively deleted /fresh', ui);

            const existsDir = await fs.exists('/fresh');

            log(`❌ /fresh exists: ${ existsDir }`, ui);
        }

        // Final summary
        log('\n🎉 All tests completed successfully!', ui);
        setStatus('🎉 Demo completed successfully! All features working.', false, ui);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        setStatus(`❌ Demo failed: ${ errorMessage }`, true, ui);
        log(`❌ Demo failed with error: ${ errorMessage }`, ui);
        console.error('Demo error:', error);
    }
}

window.onload = runDemo;
