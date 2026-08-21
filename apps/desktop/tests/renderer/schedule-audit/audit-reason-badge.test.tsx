import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditReasonBadge } from '../../../src/renderer/components/schedule-audit/audit-reason-badge';
import i18n from '../../../src/renderer/i18n/config';

describe('AuditReasonBadge — French labels (SOU-296 full taxonomy)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it.each([
    ['outside-center-hours', 'Hors horaires'],
    ['on-holiday', 'Jour férié'],
    ['outside-teacher-availability', "Hors disponibilités de l'enseignant"],
    ['teacher-double-booked', 'Enseignant déjà occupé'],
    ['room-double-booked', 'Salle déjà occupée'],
    ['room-archived', 'Salle archivée'],
    ['room-over-capacity', 'Salle en surcapacité'],
  ] as const)('labels %s', (reason, label) => {
    render(<AuditReasonBadge reason={reason} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('AuditReasonBadge — Arabic labels (SOU-296 full taxonomy)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it.each([
    ['outside-center-hours', 'خارج ساعات العمل'],
    ['on-holiday', 'يوم عطلة'],
    ['outside-teacher-availability', 'خارج أوقات توفر الأستاذ'],
    ['teacher-double-booked', 'الأستاذ محجوز مسبقًا'],
    ['room-double-booked', 'القاعة محجوزة مسبقًا'],
    ['room-archived', 'القاعة مؤرشفة'],
    ['room-over-capacity', 'القاعة فوق طاقتها'],
  ] as const)('labels %s', (reason, label) => {
    render(<AuditReasonBadge reason={reason} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
