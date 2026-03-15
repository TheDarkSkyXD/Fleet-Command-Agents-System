import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppLayout } from './components/AppLayout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#f8fafc',
          },
        }}
      />
    </QueryClientProvider>
  );
}
