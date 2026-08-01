import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionForm } from '../../../src/renderer/components/planning/session-form';
import { SessionConflictAlert } from '../../../src/renderer/components/planning/session-conflict-alert';
import { EMPTY_SESSION_INPUT } from '../../../src/renderer/lib/planning/session-form-schema';
import type { SessionFormOptions } from '../../../src/renderer/lib/planning/session-options';
import i18n from '../../../src/renderer/i18n/config';

const OPTIONS: SessionFormOptions = {
  rooms: [{ id: 'rom_1', name: 'Salle A' }],
  teachers: [{ id: 'tch_1', name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' } }],
  groups: [{ id: 'grp_1', subjectName: { fr: 'Maths', ar: 'رياضيات' }, level: 'Bac', kind: 'regular' }],
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
    render(<SessionConflictAlert codes={['room-conflict', 'malformed-session-time']} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Conflit de planning');
    expect(screen.getByText('La salle est déjà occupée sur ce créneau')).toBeInTheDocument();
    expect(
      screen.getByText("L'heure de fin doit être après l'heure de début"),
    ).toBeInTheDocument();
  });

  it('localizes the lines in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<SessionConflictAlert codes={['teacher-conflict']} />);
    expect(screen.getByText('لدى الأستاذ حصة بالفعل في هذا التوقيت')).toBeInTheDocument();
  });

  it('renders nothing without any conflict', () => {
    const { container } = render(<SessionConflictAlert codes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
