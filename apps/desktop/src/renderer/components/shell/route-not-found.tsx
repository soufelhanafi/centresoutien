import { Navigate } from '@tanstack/react-router';
import { DEFAULT_ROUTE } from '../../app/nav-items';

/** Router's `defaultNotFoundComponent`: an unknown hash lands here and is sent home. */
export function RouteNotFound() {
  return <Navigate to={DEFAULT_ROUTE} replace />;
}
