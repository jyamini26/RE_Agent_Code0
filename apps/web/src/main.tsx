import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { Shell } from './components/Shell.js';
import { Ledger } from './routes/Ledger.js';
import { Listings } from './routes/Listings.js';
import { Pipeline } from './routes/Pipeline.js';
import { Review } from './routes/Review.js';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is cheap to refetch and correctness matters more than chattiness
      // on a queue the user is actively working through.
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Review /> },
      { path: 'pipeline', element: <Pipeline /> },
      { path: 'listings', element: <Listings /> },
      { path: 'ledger', element: <Ledger /> },
    ],
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
