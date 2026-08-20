import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TeacherAvailabilityRecheckRow } from '../../../src/renderer/components/teacher/teacher-availability-recheck-row';
import { TeacherAvailabilityRecheckOccurrenceRow } from '../../../src/renderer/components/teacher/teacher-availability-recheck-occurrence-row';
import { TeacherAvailabilityRecheckDialog } from '../../../src/renderer/components/teacher/teacher-availability-recheck-dialog';
import type {
  OutOfWindowOccurrenceView,
  OutOfWindowSessionView,
} from '../../../src/renderer/lib/teacher-availability/availability-recheck-gateway';
import i18n from '../../../src/renderer/i18n/config';

const SESSION: OutOfWindowSessionView = {
  sessionId: 'wrs_1',
  subjectName: { fr: 'Maths — Bac', ar: 'رياضيات — باك' },
  teacherName: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
  dayOfWeek: 1,
  start: '18:00',
  end: '19:30',
};

const OCCURRENCE: OutOfWindowOccurrenceView = {
  sessionId: 'ses_1',
  subjectName: { fr: 'Physique — Bac', ar: 'فيزياء — باك' },
  teacherName: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
  date: '2026-09-14',
  start: '15:00',
  end: '16:30',
};

describe('TeacherAvailabilityRecheckRow', () => {
  it('shows the subject, weekday, and time window in French', async () => {
    await i18n.changeLanguage('fr');
    render(
      <ul>
        <TeacherAvailabilityRecheckRow session={SESSION} />
      </ul>,
    );
    expect(screen.getByText('Maths — Bac')).toBeInTheDocument();
    expect(screen.getByText(/Lundi/)).toBeInTheDocument();
  });

  it('falls back to the unknown-subject label when the name is null', async () => {
    await i18n.changeLanguage('fr');
    render(
      <ul>
        <TeacherAvailabilityRecheckRow session={{ ...SESSION, subjectName: null }} />
      </ul>,
    );
    expect(screen.getByText('Matière inconnue')).toBeInTheDocument();
  });
});

describe('TeacherAvailabilityRecheckOccurrenceRow', () => {
  it('shows the subject, local date, and time window', async () => {
    await i18n.changeLanguage('fr');
    render(
      <ul>
        <TeacherAvailabilityRecheckOccurrenceRow occurrence={OCCURRENCE} />
      </ul>,
    );
    expect(screen.getByText('Physique — Bac')).toBeInTheDocument();
    expect(screen.getByText(/14 sept/)).toBeInTheDocument();
  });

  it('falls back to the unknown-subject label when the name is null', async () => {
    await i18n.changeLanguage('fr');
    render(
      <ul>
        <TeacherAvailabilityRecheckOccurrenceRow occurrence={{ ...OCCURRENCE, subjectName: null }} />
      </ul>,
    );
    expect(screen.getByText('Matière inconnue')).toBeInTheDocument();
  });
});

describe('TeacherAvailabilityRecheckDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('renders nothing when there is nothing to report', () => {
    const { container } = render(
      <TeacherAvailabilityRecheckDialog open sessions={[]} occurrences={[]} onOpenChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the stranded sessions when open', () => {
    render(
      <TeacherAvailabilityRecheckDialog
        open
        sessions={[SESSION]}
        occurrences={[]}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText('Séances désormais hors disponibilités')).toBeInTheDocument();
    expect(screen.getByText('Maths — Bac')).toBeInTheDocument();
    expect(screen.getByText("J'ai compris")).toBeInTheDocument();
  });

  it('lists exception-covered occurrences when open', () => {
    render(
      <TeacherAvailabilityRecheckDialog
        open
        sessions={[]}
        occurrences={[OCCURRENCE]}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText('Séances désormais hors disponibilités')).toBeInTheDocument();
    expect(screen.getByText('Physique — Bac')).toBeInTheDocument();
  });
});
