import * as React from 'react';
import type * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { cn } from '@ui/lib/utils';
import { Label } from '@ui/components/ui/label';

export const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);

  if (!('name' in fieldContext)) {
    throw new Error('useFormField should be used within <FormField>');
  }
  if (!('id' in itemContext)) {
    throw new Error('useFormField should be used within <FormItem>');
  }

  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

export const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const id = React.useId();

    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn('grid gap-2', className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);
FormItem.displayName = 'FormItem';

export const FormLabel = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      data-error={!!error}
      className={cn('data-[error=true]:text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = 'FormLabel';

export const FormControl = React.forwardRef<
  React.ComponentRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>((props, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

export const FormDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    const { formDescriptionId } = useFormField();

    return (
      <p ref={ref} id={formDescriptionId} className={cn('text-sm text-muted-foreground', className)} {...props} />
    );
  },
);
FormDescription.displayName = 'FormDescription';

export type FormMessageProps = React.HTMLAttributes<HTMLParagraphElement>;

/**
 * Deliberate deviation from vanilla shadcn: renders caller-supplied `children`
 * in preference to the raw React Hook Form message so the consuming app can
 * pass a translated `t()` node while `packages/ui` stays i18n-agnostic. Zod
 * schemas in this project emit stable error codes, translated at display time.
 */
export function FormMessage({ className, children, ...props }: FormMessageProps) {
  const { error, formMessageId } = useFormField();
  // Prefer caller-supplied translated content; fall back to RHF's raw message.
  const body = children ?? (error ? String(error.message) : null);
  if (!body) return null;
  return (
    <p id={formMessageId} className={cn('text-sm text-destructive', className)} {...props}>
      {body}
    </p>
  );
}
