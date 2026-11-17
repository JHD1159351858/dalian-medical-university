import ReactDOM from 'react-dom/client';
import TownHome from './home/TownHome';
import { StudentAuthProvider } from './auth/StudentAuthProvider';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<StudentAuthProvider><TownHome /></StudentAuthProvider>);
