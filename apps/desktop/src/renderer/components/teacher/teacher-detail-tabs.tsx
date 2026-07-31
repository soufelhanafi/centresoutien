import { useTranslation } from 'react-i18next';
import { BookOpen, Boxes, HandCoins } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { TeacherInfoTab } from './teacher-info-tab';
import { ComingSoonTab } from './coming-soon-tab';

/**
 * The four-tab teacher detail surface. Info is live; Subjects, Groups, and Payroll
 * are shells until their domains are wired to the renderer (Subjects needs
 * `subject.list`; Groups is SOU-48; Payroll is the Pro+ payroll module).
 */
export function TeacherDetailTabs({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const iconClass = 'h-5 w-5';

  return (
    <Tabs defaultValue="info" className="mt-4">
      <TabsList className="flex-wrap">
        <TabsTrigger value="info">{t('teachers.detail.tabs.info')}</TabsTrigger>
        <TabsTrigger value="subjects">{t('teachers.detail.tabs.subjects')}</TabsTrigger>
        <TabsTrigger value="groups">{t('teachers.detail.tabs.groups')}</TabsTrigger>
        <TabsTrigger value="payroll">{t('teachers.detail.tabs.payroll')}</TabsTrigger>
      </TabsList>

      <TabsContent value="info">
        <TeacherInfoTab teacher={teacher} />
      </TabsContent>
      <TabsContent value="subjects">
        <ComingSoonTab
          icon={<BookOpen className={iconClass} aria-hidden="true" />}
          title={t('teachers.comingSoon.subjects.title')}
          body={t('teachers.comingSoon.subjects.body')}
        />
      </TabsContent>
      <TabsContent value="groups">
        <ComingSoonTab
          icon={<Boxes className={iconClass} aria-hidden="true" />}
          title={t('teachers.comingSoon.groups.title')}
          body={t('teachers.comingSoon.groups.body')}
        />
      </TabsContent>
      <TabsContent value="payroll">
        <ComingSoonTab
          icon={<HandCoins className={iconClass} aria-hidden="true" />}
          title={t('teachers.comingSoon.payroll.title')}
          body={t('teachers.comingSoon.payroll.body')}
        />
      </TabsContent>
    </Tabs>
  );
}
