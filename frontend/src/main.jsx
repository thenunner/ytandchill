import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from './contexts/NotificationContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';
import './styles/themes.css';
import './styles/videojs-overrides.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000, // 5 seconds for more responsive queue updates
      gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <BrowserRouter>
            <PreferencesProvider>
              <App />
            </PreferencesProvider>
          </BrowserRouter>
        </NotificationProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
