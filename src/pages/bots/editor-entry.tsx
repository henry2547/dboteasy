import { createRoot } from 'react-dom/client';
import BotApp from './bot-app';
import ErrorBoundary from '@/components/error-boundary/error-boundary';
createRoot(document.getElementById('root')!).render(<ErrorBoundary label='Observational builder'><BotApp/></ErrorBoundary>);
