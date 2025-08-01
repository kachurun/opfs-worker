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

        const root = await fs.init('/demo');

        log('✅ File system initialized successfully', ui);
        console.log('Root handler:', root);

        // Basic file operations
        log('\n📁 Testing basic file operations...', ui);

        // Write a file
        const testData = 'Hello, OPFS World! 🌍\nThis is a test file.';

        await fs.writeFile('/a/demo.txt', testData);
        log(`✅ Created '/a/demo.txt' with data: "${ testData }"`, ui);

        // Read the file back
        const readContent = await fs.readFile('/a/demo.txt', 'utf-8');

        log(`✅ Read content: "${ readContent }"`, ui);

        // Append to file
        await fs.appendFile('/a/demo.txt', '\n📝 This line was appended!');
        const appendedContent = await fs.readFile('/a/demo.txt', 'utf-8');

        log(`✅ After append: "${ appendedContent }"`, ui);

        // File stats
        const stats = await fs.stat('/a/demo.txt');

        log(`📊 File stats: size=${ stats.size }, isFile=${ stats.isFile }, modified=${ stats.mtime }`, ui);

        // // Binary file operations
        // log('\n🔢 Testing binary operations...', ui);
        // const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

        // await fs.writeFile('/binary.dat', binaryData);
        // const readBinary = await fs.readFile('/binary.dat', { encoding: 'binary' }) as Uint8Array;

        // log(`✅ Binary file: wrote ${ binaryData.length } bytes, read ${ readBinary.length } bytes`, ui);

        // // Directory operations
        // log('\n📂 Testing directory operations...', ui);

        // // Create directories
        // await fs.mkdir('/test-dir/sub-dir', { recursive: true });
        // log('✅ Created nested directories: /test-dir/sub-dir', ui);

        // // Create files in directories
        // await fs.writeFile('/test-dir/file1.txt', 'File 1 content');
        // await fs.writeFile('/test-dir/file2.txt', 'File 2 content');
        // await fs.writeFile('/test-dir/sub-dir/nested.txt', 'Nested file content');
        // log('✅ Created files in directories', ui);

        // // List directory contents
        // const rootContents = await fs.readdir('/');

        // log(`📋 Root directory contents: ${ rootContents.join(', ') }`, ui);

        // const testDirContents = await fs.readdir('/test-dir');

        // log(`📋 /test-dir contents: ${ testDirContents.join(', ') }`, ui);

        // // File existence checks
        // log('\n🔍 Testing file existence...', ui);
        // log(`✅ /demo.txt exists: ${ await fs.exists('/demo.txt') }`, ui);
        // log(`❌ /nonexistent.txt exists: ${ await fs.exists('/nonexistent.txt') }`, ui);

        // // Rename operations
        // log('\n✏️ Testing rename operations...', ui);
        // await fs.rename('/demo.txt', '/renamed-demo.txt');
        // log('✅ Renamed /demo.txt to /renamed-demo.txt', ui);
        // log(`❌ Original file exists: ${ await fs.exists('/demo.txt') }`, ui);
        // log(`✅ Renamed file exists: ${ await fs.exists('/renamed-demo.txt') }`, ui);

        // // Error handling demonstration
        // log('\n⚠️ Testing error handling...', ui);
        // try {
        //     await fs.readFile('/definitely-does-not-exist.txt');
        // }
        // catch (error) {
        //     if (error instanceof FileNotFoundError) {
        //         log(`✅ Caught expected FileNotFoundError: ${ error.message }`, ui);
        //         log(`   Error code: ${ error.code }, Path: ${ error.path }`, ui);
        //     }
        // }

        // try {
        //     await fs.writeFile('../evil-path', 'malicious content');
        // }
        // catch (error) {
        //     if (error instanceof PathError) {
        //         log(`✅ Caught expected PathError: ${ error.message }`, ui);
        //     }
        // }

        // // File upload simulation
        // log('\n📤 Testing file upload simulation...', ui);
        // const simulatedFiles = [
        //     new File(['Content of file 1'], 'upload1.txt'),
        //     new File(['Content of file 2'], 'upload2.txt'),
        //     new File(['Binary content'], 'upload3.bin'),
        // ];

        // let uploadProgress = 0;

        // await fs.uploadFiles(simulatedFiles, '/uploads', (completed, total, currentFile) => {
        //     uploadProgress = (completed / total) * 100;
        //     log(`📤 Upload progress: ${ uploadProgress.toFixed(0) }% (${ currentFile })`, ui);
        // });

        // log('✅ File upload simulation completed', ui);

        // // Cleanup demonstration
        // log('\n🧹 Testing cleanup operations...', ui);
        // await fs.unlink('/binary.dat');
        // log('✅ Deleted /binary.dat', ui);

        // await fs.rmdir('/test-dir', { recursive: true });
        // log('✅ Recursively deleted /test-dir', ui);

        // // Final summary
        // log('\n🎉 All tests completed successfully!', ui);
        // setStatus('🎉 Demo completed successfully! All features working.', false, ui);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        setStatus(`❌ Demo failed: ${ errorMessage }`, true, ui);
        log(`❌ Demo failed with error: ${ errorMessage }`, ui);
        console.error('Demo error:', error);
    }
}

window.onload = runDemo;
