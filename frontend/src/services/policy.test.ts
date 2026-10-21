import { describe, expect, it } from "vitest";
import { AlertSeverity } from "../types";
import {
  MAX_TAB_SWITCHES,
  pointsOf,
  SAMPLE_MS,
  severityOf,
  SIGNALS,
  SIGNAL_LABELS,
  signalOf,
  THRESHOLDS,
} from "./policy";

describe("proctoring policy", () => {
  it("uses the documented scoring thresholds and tab-switch limit", () => {
    expect(THRESHOLDS).toEqual({ review: 20, reject: 50 });
    expect(MAX_TAB_SWITCHES).toBe(3);
    expect(SAMPLE_MS).toBe(500);
  });

  it("keeps signal severity, score, and display labels aligned", () => {
    for (const signal of SIGNALS) {
      expect(severityOf(signal.type)).toBe(signal.severity);
      expect(pointsOf(signal.type)).toBeGreaterThan(0);
      expect(SIGNAL_LABELS[signal.type]).toBe(signal.label);
    }
    expect(severityOf("multiple_faces")).toBe(AlertSeverity.CRITICAL);
    expect(pointsOf("multiple_faces")).toBe(15);
  });

  it("rejects unknown signal types", () => {
    expect(() => signalOf("not_a_signal" as never)).toThrow(
      "Unknown proctoring signal: not_a_signal",
    );
  });
});
