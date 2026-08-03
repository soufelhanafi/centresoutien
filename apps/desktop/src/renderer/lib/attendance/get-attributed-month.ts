/** Current calendar month in `YYYY-MM` format — the attendance tab's default. */
export function getAttributedMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
