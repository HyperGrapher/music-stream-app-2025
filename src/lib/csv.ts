/** Minimal CSV writer (RFC 4180 quoting). Cells that start like a spreadsheet formula are prefixed with `'` so opening the file cannot run one. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

interface InsightsLike {
  range: string;
  totals: Record<string, number>;
  series: { start: Date | string; plays: number }[];
  weekly: boolean;
  topTracks: { title: string; plays: number; likes: number; completionRate: number | null }[];
  breakdowns: null | { countries: { country: string; plays: number }[]; sources: { source: string; plays: number }[]; listeners: { name: string; username: string; plays: number }[] };
}

/** IN-7: the current Insights view as one CSV: totals, plays over time, top tracks and (Pro) the breakdowns. */
export function insightsToCsv(d: InsightsLike): string {
  const day = (v: Date | string) => new Date(v).toISOString().slice(0, 10);
  const rows: (string | number | null)[][] = [["Section", "Name", "Value", "Extra"]];
  for (const [name, value] of Object.entries(d.totals)) rows.push(["Totals", name, value, `range ${d.range}`]);
  for (const s of d.series) rows.push([d.weekly ? "Plays per week" : "Plays per day", day(s.start), s.plays, null]);
  for (const t of d.topTracks) rows.push(["Top tracks", t.title, t.plays, `${t.likes} likes${t.completionRate === null ? "" : `, ${Math.round(t.completionRate * 100)}% completed`}`]);
  if (d.breakdowns) {
    for (const c of d.breakdowns.countries) rows.push(["Countries", c.country, c.plays, null]);
    for (const s of d.breakdowns.sources) rows.push(["Sources", s.source, s.plays, null]);
    for (const l of d.breakdowns.listeners) rows.push(["Top listeners", l.name, l.plays, `@${l.username}`]);
  }
  return toCsv(rows);
}
