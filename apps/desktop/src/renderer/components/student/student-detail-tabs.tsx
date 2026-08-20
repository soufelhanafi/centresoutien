import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { StudentInfoTab } from './student-info-tab';
import { GuardianLinks } from './guardian-links';
import { SubscriptionTab } from './subscription-tab';
import { StudentAttendanceTab } from './student-attendance-tab';
import { StudentInvoicesTab } from './student-invoices-tab';

/** The five-tab student detail surface: info, guardians, subscriptions, invoices, attendance. */
export function StudentDetailTabs({ student }: { student: StudentView }) {
  const { t } = useTranslation();

  return (
    <Tabs defaultValue="info" className="mt-4">
      <TabsList className="flex-wrap">
        <TabsTrigger value="info">{t('students.detail.tabs.info')}</TabsTrigger>
        <TabsTrigger value="guardians">{t('students.detail.tabs.guardians')}</TabsTrigger>
        <TabsTrigger value="enrollment">{t('students.detail.tabs.enrollment')}</TabsTrigger>
        <TabsTrigger value="invoices">{t('students.detail.tabs.invoices')}</TabsTrigger>
        <TabsTrigger value="attendance">{t('students.detail.tabs.attendance')}</TabsTrigger>
      </TabsList>

      <TabsContent value="info">
        <StudentInfoTab student={student} />
      </TabsContent>
      <TabsContent value="guardians">
        <GuardianLinks student={student} />
      </TabsContent>
      <TabsContent value="enrollment">
        <SubscriptionTab student={student} />
      </TabsContent>
      <TabsContent value="invoices">
        <StudentInvoicesTab student={student} />
      </TabsContent>
      <TabsContent value="attendance">
        <StudentAttendanceTab student={student} />
      </TabsContent>
    </Tabs>
  );
}
