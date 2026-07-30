import { useTranslation } from 'react-i18next';
import { CalendarDays, GraduationCap, ReceiptText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { StudentInfoTab } from './student-info-tab';
import { GuardianLinks } from './guardian-links';
import { ComingSoonTab } from './coming-soon-tab';

/** The five-tab student detail surface. Info + Guardians are live; the rest are shells. */
export function StudentDetailTabs({ student }: { student: StudentView }) {
  const { t } = useTranslation();
  const iconClass = 'h-5 w-5';

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
        <ComingSoonTab
          icon={<GraduationCap className={iconClass} aria-hidden="true" />}
          title={t('students.comingSoon.enrollment.title')}
          body={t('students.comingSoon.enrollment.body')}
        />
      </TabsContent>
      <TabsContent value="invoices">
        <ComingSoonTab
          icon={<ReceiptText className={iconClass} aria-hidden="true" />}
          title={t('students.comingSoon.invoices.title')}
          body={t('students.comingSoon.invoices.body')}
        />
      </TabsContent>
      <TabsContent value="attendance">
        <ComingSoonTab
          icon={<CalendarDays className={iconClass} aria-hidden="true" />}
          title={t('students.comingSoon.attendance.title')}
          body={t('students.comingSoon.attendance.body')}
        />
      </TabsContent>
    </Tabs>
  );
}
