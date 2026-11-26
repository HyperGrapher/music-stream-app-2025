import assert from "node:assert/strict";
import { it } from "node:test";

import { csvCell, insightsToCsv, toCsv } from "./csv";

it("quotes cells and defuses spreadsheet formulas", () => {
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell(null), "");
  assert.equal(toCsv([["a", "b"], [1, "x\ny"]]), 'a,b\r\n1,"x\ny"\r\n');
});

it("writes the insights view", () => {
  const csv = insightsToCsv({
    range: "7",
    totals: { plays: 3 },
    series: [{ start: new Date("2026-01-02T00:00:00Z"), plays: 3 }],
    weekly: false,
    topTracks: [{ title: "=evil", plays: 3, likes: 1, completionRate: 0.5 }],
    breakdowns: null,
  });
  assert.match(csv, /^Section,Name,Value,Extra\r\nTotals,plays,3,range 7\r\nPlays per day,2026-01-02,3,\r\nTop tracks,'=evil,3,"1 likes, 50% completed"\r\n$/);
});
