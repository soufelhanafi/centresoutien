import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@centresoutien/ui';

export type EntityComboboxLabels = {
  /** Trigger button text, e.g. "Lier un responsable". */
  trigger: string;
  /** Search field placeholder. */
  search: string;
  /** Shown when the query matches nothing. */
  empty: string;
};

/**
 * A "pick one person from a searchable list" popover — the add-existing half of
 * Student ↔ Parent linking (SOU-42), reused from both sides (parents on the
 * student tab, students on the parent sheet). Purely presentational: it owns no
 * data and no mutation, only the open state and selection callback, so the two
 * link surfaces share one interaction without sharing their entity type.
 */
export function EntityCombobox<T>({
  items,
  getKey,
  getPrimary,
  getSecondary,
  onSelect,
  labels,
  disabled = false,
}: {
  items: readonly T[];
  getKey: (item: T) => string;
  getPrimary: (item: T) => string;
  getSecondary?: (item: T) => string | null;
  onSelect: (item: T) => void;
  labels: EntityComboboxLabels;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {labels.trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={labels.search} />
          <CommandList>
            <CommandEmpty>{labels.empty}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                const secondary = getSecondary?.(item) ?? null;
                return (
                  <CommandItem
                    key={getKey(item)}
                    value={`${getPrimary(item)} ${secondary ?? ''} ${getKey(item)}`}
                    onSelect={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">{getPrimary(item)}</span>
                      {secondary && (
                        <span className="truncate text-xs text-muted-foreground">{secondary}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
