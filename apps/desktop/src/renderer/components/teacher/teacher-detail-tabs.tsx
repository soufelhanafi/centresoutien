import { useTranslation } from 'react-i18next';
import { Boxes } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { useFeature } from '../../hooks/use-feature';
import { TeacherInfoTab } from './teacher-info-tab';
import { TeacherSubjectsTab } from './teacher-subjects-tab';
import { TeacherStudentsTab } from './teacher-students-tab';
import { TeacherAvailabilityTab } from './teacher-availability-tab';
import { ComingSoonTab } from './coming-soon-tab';
import { TeacherPayrollRuleTab } from '../teacher-payroll-rule/teacher-payroll-rule-tab';

/**
 * The teacher detail surface. Info, Subjects (via `subject.list`, SOU-124),
 * Rule (via `teacherPayrollRule.*`, SOU-72), and Availability (SOU-259, behind
 * `planning.teacher-availability` — cosmetic hiding, the domain gate is real)
 * are live. Groups is a shell until its domain is wired to the renderer (SOU-48).
 */
export function TeacherDetailTabs({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const availabilityEnabled = useFeature('planning.teacher-availability');
  const iconClass = 'h-5 w-5';

  return (
    <Tabs defaultValue="info" className="mt-4">
      <TabsList className="flex-wrap">
        <TabsTrigger value="info">{t('teachers.detail.tabs.info')}</TabsTrigger>
        <TabsTrigger value="subjects">{t('teachers.detail.tabs.subjects')}</TabsTrigger>
        <TabsTrigger value="students">{t('teachers.detail.tabs.students')}</TabsTrigger>
        <TabsTrigger value="groups">{t('teachers.detail.tabs.groups')}</TabsTrigger>
        <TabsTrigger value="payroll">{t('teachers.detail.tabs.payroll')}</TabsTrigger>
        {availabilityEnabled ? (
          <TabsTrigger value="availability">{t('teachers.detail.tabs.availability')}</TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContent value="info">
        <TeacherInfoTab teacher={teacher} />
      </TabsContent>
      <TabsContent value="subjects">
        <TeacherSubjectsTab teacher={teacher} />
      </TabsContent>
      <TabsContent value="students">
        <TeacherStudentsTab teacher={teacher} />
      </TabsContent>
      <TabsContent value="groups">
        <ComingSoonTab
          icon={<Boxes className={iconClass} aria-hidden="true" />}
          title={t('teachers.comingSoon.groups.title')}
          body={t('teachers.comingSoon.groups.body')}
        />
      </TabsContent>
      <TabsContent value="payroll">
        <TeacherPayrollRuleTab teacher={teacher} />
      </TabsContent>
      {availabilityEnabled ? (
        <TabsContent value="availability">
          <TeacherAvailabilityTab teacher={teacher} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
