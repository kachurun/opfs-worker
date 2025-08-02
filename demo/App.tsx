import React from 'react';
import { createRoot } from 'react-dom/client';

import { FileSystemProvider } from './FileSystemContext';
import { LogViewer } from './LogViewer';
import { MainContent } from './MainContent';
import './styles.css';

const App: React.FC = () => {
    return (
        <FileSystemProvider>
            <div className="app-container">
                {/* Main/Top Area */}
                <MainContent />

                {/* Bottom Log Area - Full Width */}
                <div className="log-viewer-container">
                    <LogViewer />
                </div>
            </div>
        </FileSystemProvider>
    );
};

// Initialize the app when the DOM is ready
const initializeApp = () => {
    const container = document.getElementById('root');

    if (!container) {
        throw new Error('Root element not found');
    }

    const root = createRoot(container);

    root.render(<App />);
};

// Auto-initialize when this module is loaded
initializeApp();
