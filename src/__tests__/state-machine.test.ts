import {
  isValidTransition,
  isJobPausable,
  isJobResumable,
  isJobCancellable,
  isJobRetriable,
  normalizeStatus,
} from "../services/state-machine";

describe("Phase 5 Job State Machine Tests", () => {
  test("Valid forward state transitions pass", () => {
    expect(isValidTransition("QUEUED", "PARSING")).toBe(true);
    expect(isValidTransition("PARSING", "MIGRATING")).toBe(true);
    expect(isValidTransition("MIGRATING", "VALIDATING")).toBe(true);
    expect(isValidTransition("VALIDATING", "PACKAGING")).toBe(true);
    expect(isValidTransition("PACKAGING", "COMPLETED")).toBe(true);
  });

  test("Invalid state transitions are rejected", () => {
    expect(isValidTransition("COMPLETED", "MIGRATING")).toBe(false);
    expect(isValidTransition("FAILED", "COMPLETED")).toBe(false);
    expect(isValidTransition("CANCELLED", "COMPLETED")).toBe(false);
  });

  test("Transitions to FAILED or CANCELLED from active states pass", () => {
    expect(isValidTransition("PARSING", "FAILED")).toBe(true);
    expect(isValidTransition("MIGRATING", "CANCELLED")).toBe(true);
    expect(isValidTransition("PAUSED", "CANCELLED")).toBe(true);
  });

  test("Pause and Resume predicates function correctly", () => {
    expect(isJobPausable("MIGRATING")).toBe(true);
    expect(isJobPausable("COMPLETED")).toBe(false);

    expect(isJobResumable("PAUSED")).toBe(true);
    expect(isJobResumable("MIGRATING")).toBe(false);

    expect(isJobCancellable("MIGRATING")).toBe(true);
    expect(isJobCancellable("COMPLETED")).toBe(false);

    expect(isJobRetriable("FAILED")).toBe(true);
    expect(isJobRetriable("CANCELLED")).toBe(true);
    expect(isJobRetriable("MIGRATING")).toBe(false);
  });

  test("Legacy status normalization maps correctly", () => {
    expect(normalizeStatus("pending")).toBe("QUEUED");
    expect(normalizeStatus("processing")).toBe("MIGRATING");
    expect(normalizeStatus("completed")).toBe("COMPLETED");
    expect(normalizeStatus("failed")).toBe("FAILED");
  });
});
