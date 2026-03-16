import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppLayout } from './components/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 5000,
    },
  },
});

export function App() {
  return (
    <ErrorBoundary sectionName="Fleet Command">
      <QueryClientProvider client={queryClient}>
        <AppLayout />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1a1a1a',
              border: '1px solid #2e2e2e',
              color: '#fafafa',
            },
          }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
