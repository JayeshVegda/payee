<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';
  import '../styles.css';

  let { children } = $props();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }
    }
  });
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
  <Toaster position="bottom-right" richColors closeButton />
</QueryClientProvider>
