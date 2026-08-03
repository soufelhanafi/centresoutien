const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

/** Current calendar month in `YYYY-MM` format — the attendance tab's default. */
export function getAttributedMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** The `count` most recent months in `YYYY-MM`, newest first. */
export function getRecentMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }
  return months;
}

/** Human-readable month label for a `YYYY-MM` string (e.g. "Aoû 2026"). */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-') as [string, string];
  return `${MONTH_NAMES[Number(m) - 1]} ${year}`;
}
