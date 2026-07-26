import { render } from 'solid-js/web';

import { App } from './App';
import './styles.css';

const rootEl = document.getElementById('root');

if (!rootEl) {
    throw new Error('Root element not found');
}

render(() => <App />, rootEl);
