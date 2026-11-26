import assert from "node:assert/strict";
import { it } from "node:test";

import { parseNameList } from "./index";

it("reads one name per line, skipping blanks, comments and a BOM", () => {
  const { names, rejected } = parseNameList("﻿# banned words\nBrand-X\r\n\n  support  \nbrand-x\nadmin\nno\nbad name\nok_name\n");
  assert.deepEqual(names, ["brand-x", "support", "ok_name"]);
  assert.deepEqual(rejected.map((r) => [r.line, r.reason]), [[5, "DUPLICATE"], [6, "BUILT_IN"], [7, "INVALID"], [8, "INVALID"]]);
});
