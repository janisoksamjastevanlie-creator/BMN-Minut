import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {getPathForView} from './utils/viewRoutes';
import './index.css';

if (window.location.pathname === '/') {
  window.history.replaceState(window.history.state, '', `${getPathForView('login')}${window.location.search}${window.location.hash}`);
}

createRoot(document.getElementById('root')!).render(<App />);
