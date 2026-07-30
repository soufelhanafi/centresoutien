import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from '../components/shell/app-shell';
import { ModulePlaceholder } from '../pages/module-placeholder';
import { SettingsPage } from '../pages/settings-page';
import {
  DEFAULT_ROUTE,
  dashboardModule,
  studentsModule,
  teachersModule,
  parentsModule,
  groupsModule,
  planningModule,
  invoicingModule,
  paymentsModule,
  payrollModule,
  syncModule,
  settingsModule,
} from './nav-items';

// AppShell hosts the <Outlet/>; every module route renders inside it.
const rootRoute = createRootRoute({ component: AppShell });

// One route per module, each with a literal `path` so TanStack keeps the whole
// route tree — and every <Link to> and redirect — fully type-checked.
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: dashboardModule.path,
  component: () => <ModulePlaceholder module={dashboardModule} />,
});
const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: studentsModule.path,
  component: () => <ModulePlaceholder module={studentsModule} />,
});
const teachersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: teachersModule.path,
  component: () => <ModulePlaceholder module={teachersModule} />,
});
const parentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: parentsModule.path,
  component: () => <ModulePlaceholder module={parentsModule} />,
});
const groupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: groupsModule.path,
  component: () => <ModulePlaceholder module={groupsModule} />,
});
const planningRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: planningModule.path,
  component: () => <ModulePlaceholder module={planningModule} />,
});
const invoicingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: invoicingModule.path,
  component: () => <ModulePlaceholder module={invoicingModule} />,
});
const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: paymentsModule.path,
  component: () => <ModulePlaceholder module={paymentsModule} />,
});
const payrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: payrollModule.path,
  component: () => <ModulePlaceholder module={payrollModule} />,
});
const syncRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: syncModule.path,
  component: () => <ModulePlaceholder module={syncModule} />,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: settingsModule.path,
  component: () => <SettingsPage />,
});

// Landing on "/" sends the user to the default module.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: DEFAULT_ROUTE });
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  studentsRoute,
  teachersRoute,
  parentsRoute,
  groupsRoute,
  planningRoute,
  invoicingRoute,
  paymentsRoute,
  payrollRoute,
  syncRoute,
  settingsRoute,
]);

// Hash history: the packaged renderer loads from `file://`, where path-based
// browser history breaks. Hash routing works in both dev and production.
export const router = createRouter({ routeTree, history: createHashHistory() });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
