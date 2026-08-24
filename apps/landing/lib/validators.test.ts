import { describe, expect, it } from 'vitest';
import { downloadLeadSchema, founderApplicationSchema } from './validators';

const base = {
  centerName: 'Centre Test',
  city: 'Casablanca',
  studentsRange: '50-150' as const,
  email: 'dir@example.com',
  consent: true,
};

describe('founderApplicationSchema phone', () => {
  const validPhones = [
    '0612345678',
    '+212612345678',
    '06 12 34 56 78',
    '+212 6 12 34 56 78',
    '0666 123 456',
    '05 55 12 34 56',
  ];

  for (const phone of validPhones) {
    it(`accepts ${JSON.stringify(phone)}`, () => {
      expect(founderApplicationSchema.safeParse({ ...base, phone }).success).toBe(true);
    });
  }

  const invalidPhones = [
    '0---------',
    '0        ',
    '0',
    '06',
    '06123456789',
    '+2126',
    '0123 456 7890',
    'abcdefghij',
    '',
  ];

  for (const phone of invalidPhones) {
    it(`rejects ${JSON.stringify(phone)}`, () => {
      expect(founderApplicationSchema.safeParse({ ...base, phone }).success).toBe(false);
    });
  }
});

describe('downloadLeadSchema', () => {
  const base = {
    name: 'Yassine Alaoui',
    email: 'yassine@example.com',
    consent: true as const,
  };

  it('accepts a valid name + email + consent', () => {
    expect(downloadLeadSchema.safeParse(base).success).toBe(true);
  });

  const invalidEmails = ['', 'not-an-email', 'a@', 'a b@c.com', '@example.com'];
  for (const email of invalidEmails) {
    it(`rejects invalid email ${JSON.stringify(email)}`, () => {
      expect(downloadLeadSchema.safeParse({ ...base, email }).success).toBe(false);
    });
  }

  it('rejects a name shorter than 2 characters', () => {
    expect(downloadLeadSchema.safeParse({ ...base, name: 'A' }).success).toBe(false);
  });

  it('rejects missing consent', () => {
    expect(downloadLeadSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });
});
