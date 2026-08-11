import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { DirectionProvider, Toaster, TooltipProvider } from '@centresoutien/ui';
import { useAppUpdate } from './hooks/use-app-update';
import { useHtmlDirection } from './hooks/use-html-direction';
import { usePlanHydration } from './hooks/use-plan-hydration';
import { useThemeEffect } from './hooks/use-theme';
import { FirstRunGate } from './components/wizard/first-run-gate';
import { AuthGate } from './components/auth/auth-gate';
import { LicenseGate } from './components/license/license-gate';
import { router } from './app/router';
import { queryClient } from './lib/query-client';

/**
 * App root: providers → first-run/license/auth gates → the routed app shell. The shell
 * (sidebar + header + content outlet) is the real chrome every feature screen
 * mounts into; routing lives in `app/router`. `Toaster` is mounted once here so
 * any screen (e.g. the center-profile save in Settings) can raise a toast.
 */
export function App() {
  const direction = useHtmlDirection();
  usePlanHydration();
  useThemeEffect();
  useAppUpdate();

  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir={direction}>
        <TooltipProvider>
          <FirstRunGate>
            <LicenseGate>
              <AuthGate>
                <RouterProvider router={router} />
              </AuthGate>
            </LicenseGate>
          </FirstRunGate>
          <Toaster />
        </TooltipProvider>
      </DirectionProvider>
    </QueryClientProvider>
  );
}
