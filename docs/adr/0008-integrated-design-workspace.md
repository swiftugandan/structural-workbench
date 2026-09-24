# ADR 0008 — Integrated design workspace roadmap binding

## Status

Accepted for planning (2026-09-24). Implementation still gated by per-slice evidence.

## Context

After M07 parent acceptance, a design conversation produced a steel product specification, shell mockups, and RC/slab/footing briefs (`docs/design/M0*-WORKFLOW/`). An initial roadmap collapsed that work into M07-E/F/G with overlapping ownership (five screens in F and again in G; readiness and serviceability misplaced). Mockups also show Eurocode labels and chrome that are not the executable contract.

## Decision

1. **Design packs are layout/interaction references**, not code-edition or menu-chrome contracts. Pinned codes remain `SPECIFICATION.md` / `SOURCES.md` (AISC 360-22 LRFD S2 today; ACI 318-19 proposed for M08 unless amended).
2. **Map steel pack §31 phases to exclusive slices:**
   - **M07-E** → Phases 1–3 (+ §32 first production slice): identity, settings/provenance/readiness, model-native demand
   - **M07-F** → Phases 4–5: selected-member inspector + calculation drawer only (mockups 01–02)
   - **M07-G** → Phases 7 + 9: whole-model, catalogue UI, section study (mockups 03–05)
   - **M07-S** → Phase 8: serviceability (deferred)
   - **M07-LTB** → Phase 6: evidence-backed strength expansion (deferred)
   - **M09** → Phase 10: second-order / stability workflows
3. **No double-booking.** A capability has one owning slice. Later slices consume earlier outputs.
4. **SHELL slices (M08/M10/M11-SHELL)** deliver approved-shell UI only after their engineering parents accept. They must not invent code profiles shown in mockups.
5. **Acceptance IDs** `DW-*` are registered in slice agent-tasks and `roadmap.json`; verifiers must require them before claiming those slices. Parent M07 numerical acceptance is not reopened by E/F/G.
6. **Schema/protocol changes** for catalogue refs, `DesignValue`, bracing, and design-result identity ship with M07-E tests — behaviour-preserving relative to analysis MVP; design persistence is additive.

## Consequences

- Agents implement M07-E next, then thin M07-F, then M07-G — not “all five screens” in one slice.
- Serviceability and LTB cannot be implied PASS by F/G.
- RC/slab/footing remain blocked on their resource/engineering gates regardless of available mockups.
- Conflicts between mockup chrome and the live app are resolved in favour of the live shell + SPEC, with mockups guiding panel content only.
