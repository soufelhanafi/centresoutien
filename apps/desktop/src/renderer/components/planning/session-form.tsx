import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@centresoutien/ui';
import {
  sessionFormSchema,
  type SessionFormInput,
  type SessionFormValues,
} from '../../lib/planning/session-form-schema';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import { SessionScheduleFields } from './session-schedule-fields';
import { SessionAssignmentFields } from './session-assignment-fields';

type SessionFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: SessionFormInput;
  options: SessionFormOptions;
  onSubmit: (values: SessionFormValues) => void | Promise<void>;
};

/**
 * The weekly-session create/edit fields, validated by {@link sessionFormSchema}.
 * Presentation only — the caller owns the mutation and the inline conflict alert.
 * The schedule (day + time) and assignment (room/teacher/group) fields are split
 * into colocated children to stay under the size ceiling.
 */
export function SessionForm({ formId, defaultValues, options, onSubmit }: SessionFormProps) {
  const form = useForm<SessionFormInput, unknown, SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues,
  });
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <SessionScheduleFields control={form.control} />
        <SessionAssignmentFields control={form.control} options={options} />
      </form>
    </Form>
  );
}
