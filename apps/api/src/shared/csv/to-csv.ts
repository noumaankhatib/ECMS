/**
 * Serializes rows to CSV — RFC 4180 quoting, nothing more. No dependency is
 * added for this (docs/phase-11-plan.md §7): a value is quoted whenever it
 * contains a comma, a quote, or a newline, and an embedded quote is doubled.
 */
export function toCsv(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [columns, ...rows].map((row) => row.map(quote).join(','));
  return lines.join('\r\n') + '\r\n';
}

function quote(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
