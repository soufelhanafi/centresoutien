// RTL guard (SOU-21): the desktop app renders right-to-left in Arabic, so
// directional Tailwind utilities silently break the AR layout while leaving FR
// intact. Enforce logical properties instead (ps-/pe-/ms-/me-/text-start/
// text-end/border-s/border-e/rounded-s/rounded-e, gap-). See the rtl-check skill.
const message =
  'Use logical Tailwind properties (ps-/pe-/ms-/me-/text-start/text-end/border-s/border-e/rounded-s/rounded-e, gap-) instead of directional ones — this app renders RTL (Arabic).';

/** @type {import('eslint').Linter.Config[]} */
export const rtlLogicalProperties = [
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/(^|\\s)(p[lr]|m[lr])-[0-9]/]', message },
        { selector: 'Literal[value=/(^|\\s)text-(left|right)(\\s|$)/]', message },
        { selector: 'Literal[value=/(^|\\s)(border-[lr]|rounded-[lr]|space-x)-/]', message },
      ],
    },
  },
];
