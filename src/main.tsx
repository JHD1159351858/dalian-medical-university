import ReactDOM from 'react-dom/client';
import { lazy, Suspense } from 'react';
import TownHome from './home/TownHome';
import { StudentAuthProvider } from './auth/StudentAuthProvider';
import './styles.css';

const TrainingPage = lazy(() => import('./App'));

ReactDOM.createRoot(document.getElementById('root')!).render(<StudentAuthProvider>{window.location.pathname === '/training' ? <Suspense fallback={<div className="training-loading" role="status">正在准备实训场景…</div>}><TrainingPage autoStart /></Suspense> : <TownHome />}</StudentAuthProvider>);
