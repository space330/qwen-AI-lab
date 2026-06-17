import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/utils/fileParser.js";

test("parses a simple table", () => {
  const parsed = parseCsv("a,b,c\n1,2,3");
  assert.deepEqual(parsed.headers, ["a", "b", "c"]);
  assert.deepEqual(parsed.rows, [["1", "2", "3"]]);
});

test("returns empty result for empty / non-string input", () => {
  assert.deepEqual(parseCsv(""), { headers: [], rows: [], summary: [] });
  assert.deepEqual(parseCsv("   \n  "), { headers: [], rows: [], summary: [] });
  assert.deepEqual(parseCsv(null), { headers: [], rows: [], summary: [] });
});

test("handles quoted fields with embedded commas", () => {
  const parsed = parseCsv('name,note\n"Doe, John",hi');
  assert.deepEqual(parsed.rows, [["Doe, John", "hi"]]);
});

test("handles escaped quotes ('')", () => {
  const parsed = parseCsv('q\n"she said ""hi"""');
  assert.deepEqual(parsed.rows, [['she said "hi"']]);
});

test("handles embedded newlines in quoted cells (multi-line cells)", () => {
  const parsed = parseCsv('id,text\n1,"line one\nline two"\n2,ok');
  assert.deepEqual(parsed.headers, ["id", "text"]);
  assert.deepEqual(parsed.rows, [
    ["1", "line one\nline two"],
    ["2", "ok"],
  ]);
});

test("keeps a literal quote that does not open a field", () => {
  const parsed = parseCsv("size\n3\" pipe");
  assert.deepEqual(parsed.rows, [['3" pipe']]);
});

test("handles CRLF without leaking \\r into values", () => {
  const parsed = parseCsv("a,b\r\nhello,world\r\n");
  assert.deepEqual(parsed.headers, ["a", "b"]);
  assert.deepEqual(parsed.rows, [["hello", "world"]]);
});

test("handles lone-CR line endings", () => {
  const parsed = parseCsv("a,b\rx,y");
  assert.deepEqual(parsed.rows, [["x", "y"]]);
});

test("strips a leading UTF-8 BOM from the first header", () => {
  const parsed = parseCsv("﻿id,name\n1,Sam");
  assert.deepEqual(parsed.headers, ["id", "name"]);
});

test("skips blank lines but keeps empty cells", () => {
  const parsed = parseCsv("a,b\n1,2\n\n3,\n");
  assert.deepEqual(parsed.rows, [
    ["1", "2"],
    ["3", ""],
  ]);
});

test("trims unquoted cells but preserves quoted whitespace", () => {
  const parsed = parseCsv('a,b\n  hi  ,"  keep  "');
  assert.deepEqual(parsed.rows, [["hi", "  keep  "]]);
});

test("supports a custom delimiter", () => {
  const parsed = parseCsv("a;b;c\n1;2;3", { delimiter: ";" });
  assert.deepEqual(parsed.headers, ["a", "b", "c"]);
  assert.deepEqual(parsed.rows, [["1", "2", "3"]]);
});

test("summary reports stats, empties, and numeric counts", () => {
  const parsed = parseCsv("x,label\n1,a\n2,b\n3,\n4,d");
  const x = parsed.summary.find((s) => s.header === "x");
  const label = parsed.summary.find((s) => s.header === "label");

  assert.deepEqual(x, {
    header: "x",
    count: 4,
    emptyCount: 0,
    numericCount: 4,
    min: 1,
    max: 4,
    avg: 2.5,
  });
  assert.equal(label.numericCount, 0);
  assert.equal(label.emptyCount, 1);
  assert.equal(label.min, null);
});

test("produces identical output across repeated runs (determinism)", () => {
  const input = 'a,b\n1,"x,y"\n2,z\n';
  const first = JSON.stringify(parseCsv(input));
  for (let i = 0; i < 5; i += 1) {
    assert.equal(JSON.stringify(parseCsv(input)), first);
  }
});
