import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionForm } from '../../../src/renderer/components/planning/session-form';
import { SessionConflictAlert } from '../../../src/renderer/components/planning/session-conflict-alert';
import { EMPTY_SESSION_INPUT } from '../../../src/renderer/lib/planning/session-form-schema';
import type { SessionFormOptions } from '../../../src/renderer/lib/planning/session-options';
import i18n from '../../../src/renderer/i18n/config';

const OPTIONS: SessionFormOptions = {
  rooms: [{ id: 'rom_1', name: 'Salle A' }],
  teachers: [{ id: 'tch_1', name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' }, subjectIds: ['math'] }],
  groups: [
    { id: 'grp_1', subjectId: 'math', subjectName: { fr: 'Maths', ar: 'رياضيات' }, level: 'Bac', kind: 'regular' },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe('SessionForm — French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('blocks submit and shows a required error per missing field', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <SessionForm formId="t" defaultValues={EMPTY_SESSION_INPUT} options={OPTIONS} onSubmit={onSubmit} />,
    );

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    // Day defaults to Monday (valid); start, end, and room are the three empties.
    return screen.findAllByText('Ce champ est requis').then((errors) => {
      expect(errors).toHaveLength(3);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('renders the French field labels', () => {
    render(
      <SessionForm formId="t" defaultValues={EMPTY_SESSION_INPUT} options={OPTIONS} onSubmit={vi.fn()} />,
    );
    for (const label of ['Jour', 'Début', 'Fin', 'Salle', 'Enseignant', 'Groupe']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('SessionForm — stale persisted teacher/group pair on load (AC3)', () => {
  const INCOMPATIBLE_OPTIONS: SessionFormOptions = {
    rooms: [{ id: 'rom_1', name: 'Salle A' }],
    teachers: [{ id: 'tch_math', name: { fr: 'Prof Maths', ar: 'أستاذ الرياضيات' }, subjectIds: ['math'] }],
    groups: [
      { id: 'grp_art', subjectId: 'art', subjectName: { fr: 'Arts', ar: 'فنون' }, level: 'Bac', kind: 'regular' },
    ],
  };
  const STALE_DEFAULTS = {
    ...EMPTY_SESSION_INPUT,
    roomId: 'rom_1',
    teacherId: 'tch_math',
    groupId: 'grp_art',
  };
  const HINT = "Enseignant retiré : il n'enseigne pas la matière du groupe choisi.";

  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('resets the teacher to unassigned and announces the hint once via role="status"', async () => {
    // Wrapped in StrictMode: the real app mounts under it (main.tsx), and the hint
    // must survive its mount → unmount → remount rather than being lost with a
    // one-shot effect's state.
    render(
      <StrictMode>
        <SessionForm
          formId="t"
          defaultValues={STALE_DEFAULTS}
          options={INCOMPATIBLE_OPTIONS}
          onSubmit={vi.fn()}
        />
      </StrictMode>,
    );

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(HINT);
    expect(screen.getAllByText(HINT)).toHaveLength(1);
    // The now-incompatible teacher fell back to the "Sans enseignant" option and its
    // name is gone from the form entirely.
    expect(screen.getAllByText('Sans enseignant').length).toBeGreaterThan(0);
    expect(screen.queryByText('Prof Maths')).not.toBeInTheDocument();
  });

  it('still clears the teacher when the pair only reads incompatible after options load', async () => {
    // Options arrive async (TanStack Query): at mount the teacher/group lists are
    // empty, so the pair reads as "not yet known" and nothing is cleared. When the
    // real lists resolve as incompatible the reconcile must still fire — the
    // returned hint flag and the applied clear stay the same load-time decision.
    const LOADING_OPTIONS: SessionFormOptions = {
      rooms: INCOMPATIBLE_OPTIONS.rooms,
      teachers: [],
      groups: [],
    };
    const { rerender } = render(
      <StrictMode>
        <SessionForm formId="t" defaultValues={STALE_DEFAULTS} options={LOADING_OPTIONS} onSubmit={vi.fn()} />
      </StrictMode>,
    );
    expect(screen.queryByRole('status')).toBeNull();

    rerender(
      <StrictMode>
        <SessionForm formId="t" defaultValues={STALE_DEFAULTS} options={INCOMPATIBLE_OPTIONS} onSubmit={vi.fn()} />
      </StrictMode>,
    );

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(HINT);
    expect(screen.queryByText('Prof Maths')).not.toBeInTheDocument();
  });
});

describe('SessionForm — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders the Arabic field labels', () => {
    render(
      <SessionForm formId="t" defaultValues={EMPTY_SESSION_INPUT} options={OPTIONS} onSubmit={vi.fn()} />,
    );
    for (const label of ['اليوم', 'البداية', 'النهاية', 'القاعة', 'الأستاذ', 'المجموعة']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('SessionConflictAlert', () => {
  it('lists one localized line per error code in French', async () => {
    await i18n.changeLanguage('fr');
    render(
      <SessionConflictAlert
        conflicts={[
          { severity: 'error', code: 'room-conflict' },
          { severity: 'error', code: 'malformed-session-time' },
        ]}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Conflit de planning');
    expect(screen.getByText('La salle est déjà occupée sur ce créneau')).toBeInTheDocument();
    expect(
      screen.getByText("L'heure de fin doit être après l'heure de début"),
    ).toBeInTheDocument();
  });

  it('localizes the lines in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<SessionConflictAlert conflicts={[{ severity: 'error', code: 'teacher-conflict' }]} />);
    expect(screen.getByText('لدى الأستاذ حصة بالفعل في هذا التوقيت')).toBeInTheDocument();
  });

  it('renders the forceable teacher-availability warning with its reason line', async () => {
    await i18n.changeLanguage('fr');
    render(
      <SessionConflictAlert
        conflicts={[{ severity: 'warning', kind: 'teacher-availability', reason: 'out-of-window' }]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Placement à confirmer');
    expect(
      screen.getByText("Ce créneau est en dehors des disponibilités déclarées de l'enseignant."),
    ).toBeInTheDocument();
  });

  it('falls back to the generic line when the availability reason is unknown', async () => {
    await i18n.changeLanguage('fr');
    render(
      <SessionConflictAlert
        conflicts={[{ severity: 'warning', kind: 'teacher-availability', reason: null }]}
      />,
    );
    expect(
      screen.getByText("L'enseignant n'est pas disponible sur ce créneau."),
    ).toBeInTheDocument();
  });

  it('renders nothing without any conflict', () => {
    const { container } = render(<SessionConflictAlert conflicts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
