import { expect as baseExpect } from "@playwright/test";

/**
 * Assertion budget for journeys on the full UK residential reference model
 * (447 nodes, 642 members). Measured 2026-09-28 on an idle machine: a design
 * preview run took 4.5–7.7 s from click to result and undo-and-save
 * 4.5–7.8 s, both above Playwright's 5 s default. The time is a cold
 * analysis Worker/WASM start on the first run (0.8–1.9 s), full viewport,
 * navigation and results re-rendering (≈1.5–2 s per run, tracked as
 * PERF-FULL-MODEL-RENDER), and trace DOM snapshots of the expanded explorer
 * (≈1 s each). The kernel itself evaluates in tens of milliseconds. Under
 * batch load everything slows about 4×. 60 s matches the analysis wait and
 * exceeds the 30 s hard solve timeout, so a hang still fails. Small-model
 * specs keep the default budget.
 */
export const FULL_MODEL_TIMEOUT_MS = 60000;
/** Whole-test budget for a full-model journey (several such waits). */
export const FULL_MODEL_TEST_TIMEOUT_MS = 120000;

export const expect = baseExpect.configure({ timeout: FULL_MODEL_TIMEOUT_MS });
