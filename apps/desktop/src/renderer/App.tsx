import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { DirectionProvider } from '@centresoutien/ui';
import { useHtmlDirection } from './hooks/use-html-direction';
import { usePlanHydration } from './hooks/use-plan-hydration';
import { FirstRunGate } from './components/wizard/first-run-gate';
import { AuthGate } from './components/auth/auth-gate';
import { router } from './app/router';
import { queryClient } from './lib/query-client';

/**
 * App root: providers → first-run/auth gates → the routed app shell. The shell
 * (sidebar + header + content outlet) is the real chrome every feature screen
 * mounts into; routing lives in `app/router`.
 */
export function App() {
  const direction = useHtmlDirection();
  usePlanHydration();

  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir={direction}>
        <FirstRunGate>
          <AuthGate>
            <RouterProvider router={router} />
          </AuthGate>
        </FirstRunGate>
      </DirectionProvider>
    </QueryClientProvider>
  );
}
