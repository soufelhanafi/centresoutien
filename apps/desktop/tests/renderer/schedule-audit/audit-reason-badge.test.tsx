import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditReasonBadge } from '../../../src/renderer/components/schedule-audit/audit-reason-badge';
import i18n from '../../../src/renderer/i18n/config';

describe('AuditReasonBadge — outside-teacher-availability (SOU-283)', () => {
  it('labels the reason in French', async () => {
    await i18n.changeLanguage('fr');
    render(<AuditReasonBadge reason="outside-teacher-availability" />);
    expect(screen.getByText("Hors disponibilités de l'enseignant")).toBeInTheDocument();
  });

  it('labels the reason in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<AuditReasonBadge reason="outside-teacher-availability" />);
    expect(screen.getByText('خارج أوقات توفر الأستاذ')).toBeInTheDocument();
  });
});

describe('AuditReasonBadge — existing reasons still render', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it.each([
    ['outside-center-hours', 'Hors horaires'],
    ['on-holiday', 'Jour férié'],
  ] as const)('labels %s', (reason, label) => {
    render(<AuditReasonBadge reason={reason} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
