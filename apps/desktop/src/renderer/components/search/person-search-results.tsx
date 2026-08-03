import { useTranslation } from 'react-i18next';
import { GraduationCap, Users, UserRound, type LucideIcon } from 'lucide-react';
import { CommandGroup, CommandItem } from '@centresoutien/ui';
import type { PersonKind, PersonSearchResult } from '../../lib/search/search-view';

export type PersonSearchStatus = 'idle' | 'loading' | 'error' | 'empty' | 'results';

type PersonSearchResultsProps = {
  status: PersonSearchStatus;
  query: string;
  results: readonly PersonSearchResult[];
  onSelect: (result: PersonSearchResult) => void;
};

const KIND_ICONS: Record<PersonKind, LucideIcon> = {
  student: GraduationCap,
  teacher: Users,
  parent: UserRound,
};

const KIND_ORDER: readonly PersonKind[] = ['student', 'teacher', 'parent'];

function displayName(result: PersonSearchResult, locale: string): string {
  if (result.kind === 'parent') return result.entity.name;
  return locale === 'ar' ? result.entity.name.ar : result.entity.name.fr;
}

function detailLine(result: PersonSearchResult): string {
  switch (result.kind) {
    case 'student':
      return result.entity.level;
    case 'teacher':
      return result.entity.phone;
    case 'parent':
      return result.entity.phone;
  }
}

/** Renders the palette body: the current state, or the hits grouped by kind. */
export function PersonSearchResults({ status, query, results, onSelect }: PersonSearchResultsProps) {
  const { t, i18n } = useTranslation();

  if (status !== 'results') {
    const message =
      status === 'idle'
        ? t('search.hint')
        : status === 'loading'
          ? t('search.loading')
          : status === 'error'
            ? t('search.error')
            : t('search.empty', { query });
    return (
      <div className="py-6 text-center text-sm text-muted-foreground" role="status">
        {message}
      </div>
    );
  }

  return (
    <>
      {KIND_ORDER.map((kind) => {
        const group = results.filter((result) => result.kind === kind);
        if (group.length === 0) return null;
        const Icon = KIND_ICONS[kind];
        return (
          <CommandGroup key={kind} heading={t(`search.groups.${kind}`)}>
            {group.map((result) => (
              <CommandItem
                key={`${result.kind}:${result.entity.id}`}
                value={`${result.kind}:${result.entity.id}`}
                onSelect={() => onSelect(result)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{displayName(result, i18n.language)}</span>
                <span
                  className="ms-auto shrink-0 text-xs text-muted-foreground"
                  dir={result.kind === 'student' ? undefined : 'ltr'}
                >
                  {detailLine(result)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}
