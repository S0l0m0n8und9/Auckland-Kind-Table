import test from "node:test";
import assert from "node:assert/strict";
import { formatGuideDate } from "../lib/format-date.ts";

test("date-only diary dates retain their entered calendar day", () => {
  assert.equal(formatGuideDate("2026-10-09"), "9 Oct 2026");
});

test("research timestamps are displayed in Auckland time", () => {
  assert.equal(formatGuideDate("2026-10-09T12:30:00.000Z"), "10 Oct 2026");
});
