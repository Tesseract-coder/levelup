import { QueryClient } from '@tanstack/react-query';

/**
 * All data is local (IndexedDB), so queries never go stale on their own; every
 * write calls `refresh()`. `networkMode: 'always'` keeps queries running offline.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, gcTime: 5 * 60_000, networkMode: 'always', refetchOnWindowFocus: false, retry: false },
    mutations: { networkMode: 'always' },
  },
});

export function refresh() {
  return queryClient.invalidateQueries();
}
