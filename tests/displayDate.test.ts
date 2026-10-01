import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime } from "../src/shared/displayDate";
import { formatBackupDate } from "../src/features/settings/backupImportFlow";
import { formatInlineDate } from "../src/features/editor/customExtensions";

describe("shared user-facing date format", () => {
  it("formats calendar dates without interpreting them as UTC instants", () => {
    assert.equal(formatDisplayDate("2026-09-22"), "22.09.2026");
    assert.equal(formatDisplayDate("2026-01-05"), "05.01.2026");
    assert.equal(formatDisplayDate("2026-12-01"), "01.12.2026");
    assert.equal(formatDisplayDate("2026-02-30"), "");
  });

  it("uses local calendar time for timestamped UI dates", () => {
    const local = new Date(2026, 8, 22, 15, 14);
    assert.equal(formatDisplayDateTime(local), "22.09.2026, 15:14");
    assert.equal(formatDisplayTime(local), "15:14");
    assert.equal(formatBackupDate(local.toISOString()), "22.09.2026, 15:14");
    assert.equal(formatInlineDate("2026-09-22"), "22.09.2026");
    assert.equal(formatDisplayDate(new Date(2026, 8, 22, 0, 30).toISOString()), "22.09.2026");
  });
});
