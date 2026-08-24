import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { useFeature } from '../../hooks/use-feature';
import { TeacherInfoTab } from './teacher-info-tab';
import { TeacherSubjectsTab } from './teacher-subjects-tab';
import { TeacherStudentsTab } from './teacher-students-tab';
import { TeacherGroupsTab } from './teacher-groups-tab';
import { TeacherAvailabilityTab } from './teacher-availability-tab';
import { TeacherPayrollRuleTab } from '../teacher-payroll-rule/teacher-payroll-rule-tab';

/**
 * The teacher detail surface. Info, Subjects (via `subject.list`, SOU-124),
 * Students (SOU-299), Groups (SOU-317, the active groups this teacher leads),
 * Rule (via `teacherPayrollRule.*`, SOU-72), and Availability (SOU-259, behind
 * `planning.teacher-availability` — cosmetic hiding, the domain gate is real)
 * are all live.
 */
export function TeacherDetailTabs({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const availabilityEnabled = useFeature('planning.teacher-availability');

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
        {/* Key by id so switching to another teacher resets the roster filters
            (the route reuses this component across `teacherId` changes). */}
        <TeacherStudentsTab key={teacher.id} teacher={teacher} />
      </TabsContent>
      <TabsContent value="groups">
        {/* Key by id so switching to another teacher resets the filters
            (the route reuses this component across `teacherId` changes). */}
        <TeacherGroupsTab key={teacher.id} teacher={teacher} />
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
