import { useId } from 'react';
import { Checkbox, Label, ScrollArea, Switch } from '@centresoutien/ui';

export type ScopeOption = { readonly id: string; readonly label: string };

/**
 * A scope selector for one entity kind (groups or teachers): an "all" master
 * toggle, and — when it is off — a checkbox list of the concrete options to
 * narrow to. Controlled and purely presentational; the caller owns the two RHF
 * fields (the boolean and the id list) and maps them to the `'all' | Id[]` union
 * at submit. Mirrors the domain's `SessionGeneratorScope` two-part shape.
 */
export function GeneratorScopePicker({
  allValue,
  onAllChange,
  selectedIds,
  onSelectedChange,
  options,
  allLabel,
  emptyLabel,
}: {
  allValue: boolean;
  onAllChange: (next: boolean) => void;
  selectedIds: readonly string[];
  onSelectedChange: (next: string[]) => void;
  options: readonly ScopeOption[];
  allLabel: string;
  emptyLabel: string;
}) {
  const switchId = useId();
  const selected = new Set(selectedIds);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange([...next]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch id={switchId} checked={allValue} onCheckedChange={onAllChange} />
        <Label htmlFor={switchId} className="cursor-pointer">
          {allLabel}
        </Label>
      </div>

      {!allValue &&
        (options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ScrollArea className="max-h-40 rounded-md border border-input" contentClassName="p-3">
            <ul className="space-y-2">
              {options.map((option) => {
                const checkboxId = `${switchId}-${option.id}`;
                return (
                  <li key={option.id} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={selected.has(option.id)}
                      onCheckedChange={() => toggle(option.id)}
                    />
                    <Label htmlFor={checkboxId} className="cursor-pointer font-normal">
                      {option.label}
                    </Label>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        ))}
    </div>
  );
}
