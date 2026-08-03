import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { CommandDialog, CommandInput, CommandList } from '@centresoutien/ui';
import { useCommandPaletteStore } from '../../stores/command-palette-store';
import { usePeopleSearch } from '../../hooks/search/use-people-search';
import type { PersonSearchResult } from '../../lib/search/search-view';
import { PersonSearchResults, type PersonSearchStatus } from './person-search-results';

const DEBOUNCE_MS = 150;

/**
 * Global command palette (SOU-43): Ctrl/Cmd+K opens a search across students,
 * teachers, and parents, and selecting a hit jumps to its detail screen. Owns
 * the global shortcut and the dialog; open state is shared with the header
 * trigger via {@link useCommandPaletteStore}. Filtering happens in the domain,
 * so cmdk's own matcher is disabled (`shouldFilter={false}`).
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = useCommandPaletteStore((state) => state.open);
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const toggle = useCommandPaletteStore((state) => state.toggle);

  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const { data, isLoading, isError } = usePeopleSearch(query);
  const results = data ?? [];
  const trimmed = query.trim();

  const status: PersonSearchStatus =
    trimmed.length === 0 ? 'idle' : isLoading ? 'loading' : isError ? 'error' : results.length === 0 ? 'empty' : 'results';

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setInput('');
        setQuery('');
      }
    },
    [setOpen],
  );

  const handleSelect = useCallback(
    (result: PersonSearchResult) => {
      handleOpenChange(false);
      switch (result.kind) {
        case 'student':
          navigate({ to: '/students/$studentId', params: { studentId: result.entity.id } });
          return;
        case 'teacher':
          navigate({ to: '/teachers/$teacherId', params: { teacherId: result.entity.id } });
          return;
        case 'parent':
          navigate({ to: '/parents', search: { openParentId: result.entity.id } });
          return;
      }
    },
    [handleOpenChange, navigate],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
      title={t('search.title')}
      description={t('search.description')}
      closeLabel={t('search.close')}
    >
      <CommandInput value={input} onValueChange={setInput} placeholder={t('search.placeholder')} />
      <CommandList>
        <PersonSearchResults status={status} query={trimmed} results={results} onSelect={handleSelect} />
      </CommandList>
    </CommandDialog>
  );
}
