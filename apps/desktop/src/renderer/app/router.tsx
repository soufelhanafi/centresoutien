import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from '../components/shell/app-shell';
import { ModulePlaceholder } from '../pages/module-placeholder';
import { DashboardPage } from '../pages/dashboard/dashboard-page';
import { SettingsPage } from '../pages/settings-page';
import { StudentsPage } from '../pages/students/students-page';
import { StudentDetailPage } from '../pages/students/student-detail-page';
import { TeachersPage } from '../pages/teachers/teachers-page';
import { TeacherDetailPage } from '../pages/teachers/teacher-detail-page';
import { ParentsPage } from '../pages/parents/parents-page';
import { SubjectsPage } from '../pages/subjects/subjects-page';
import { FormulasPage } from '../pages/formulas/formulas-page';
import { GroupsPage } from '../pages/groups/groups-page';
import { GroupDetailPage } from '../pages/groups/group-detail-page';
import { RoomsPage } from '../pages/rooms/rooms-page';
import { PlannerPage } from '../pages/planning/planner-page';
import {
  DEFAULT_ROUTE,
  dashboardModule,
  studentsModule,
  teachersModule,
  parentsModule,
  subjectsModule,
  formulasModule,
  groupsModule,
  roomsModule,
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
  component: DashboardPage,
});
const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: studentsModule.path,
  component: StudentsPage,
});
const studentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/students/$studentId',
  component: StudentDetailPage,
});
const teachersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: teachersModule.path,
  component: TeachersPage,
});
const teacherDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teachers/$teacherId',
  component: TeacherDetailPage,
});
const parentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: parentsModule.path,
  component: ParentsPage,
});
const subjectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: subjectsModule.path,
  component: SubjectsPage,
});
const formulasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: formulasModule.path,
  component: FormulasPage,
});
const groupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: groupsModule.path,
  component: GroupsPage,
});
const groupDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/groups/$groupId',
  component: GroupDetailPage,
});
const roomsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: roomsModule.path,
  component: RoomsPage,
});
const planningRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: planningModule.path,
  component: PlannerPage,
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
  studentDetailRoute,
  teachersRoute,
  teacherDetailRoute,
  parentsRoute,
  subjectsRoute,
  formulasRoute,
  groupsRoute,
  groupDetailRoute,
  roomsRoute,
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
