# Validation and acceptance definitions

This document is normative for the implementation agents. It defines evidence required to accept the future application. No solver has been implemented or tested by creating this handoff. The package's own self-check only validates schemas, fixtures, dependency links and included analytical calculations.

## 1 Evidence hierarchy and independence

Use three independent forms of evidence: analytical closed-form solutions with documented assumptions; a separate trusted solver implementation with equivalent settings; and, for claimed PROKON numerical parity, versioned outputs from a legally available PROKON installation. Agreement with another program alone is not proof of correctness. Never use the candidate solver to generate its own expected values.

OpenSees elasticBeamColumn is a suitable independent frame oracle, provided E, G, A, Iy, Iz, J, axes, loads, releases, transformations and restraint treatment are matched. Its use here is a validation recommendation, not an endorsement of unrestricted equivalence. The oracle runs in CI/native tooling and is not a browser runtime dependency. [OpenSees elastic beam-column element](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/elasticBeamColumn.html)

Expected-value changes require an original derivation or independently produced reference, a reason and a diff. Agent authorship separation helps review but does not itself establish numerical independence; agents copying the same incorrect formula remain correlated. Frozen examples must not import production assembly, conversion or design-rule code.

## 2 Numerical comparison policy

For a scalar expected value b and actual a, pass if |a−b| ≤ atol + rtol·|b|. Use separate dimensions and declare comparison sign convention. Do not use percentage error alone near zero. Unless a fixture states a tighter value:

| Quantity | Absolute tolerance in SI | Relative tolerance |
| --- | --- | --- |
| Translation | 1e-9 m | 1e-6 analytical; 1e-4 independent frame oracle |
| Rotation | 1e-10 rad | 1e-6 analytical; 1e-4 independent frame oracle |
| Force | 1e-3 N | 1e-6 analytical; 1e-4 independent frame oracle |
| Moment | 1e-3 N m | 1e-6 analytical; 1e-4 independent frame oracle |
| Stress | 1 Pa | 1e-6 analytical |
| Area | 1e-12 m² | 1e-9 analytical geometry |
| Second moment or torsion constant | 1e-16 m⁴ | 1e-9 analytical geometry |
| Dimensionless utilisation | 1e-6 | 1e-4 against unrounded worked examples |
| Native versus WASM results | same dimensional atol above | 1e-9 |

Rounded published examples may need interval comparisons based on the stated rounding. Record the precision interval before running the candidate; do not enlarge it after a failure. Branch status and pass/fail/unsupported must match exactly even if utilisation values are near each other. Test both sides of each decision threshold with deliberately nonambiguous values.

At a point load or concentrated couple, compare left and right limits separately. Never compare an averaged value at a discontinuity. Eigenmodes need mode pairing by modal assurance criterion and frequency, with invariant sign/normalisation; repeated modes compare subspaces.

### 2.1 Residual and equilibrium

Compute the reduced-system residual in equilibrated coordinates: η = ||Ks y−Fs||∞ / (||Ks||∞ ||y||∞ + ||Fs||∞). Define η=0 if numerator and denominator are both zero. Require η ≤ 1e-10 on the analytical corpus and ≤ 1e-8 on the full supported linear corpus. A residual alone does not bound forward error in an ill-conditioned problem; factor diagnostics and reference comparisons remain mandatory.

For global force equilibrium, require ||ΣF_external + ΣR||∞ ≤ 1e-3 N + 1e-8·Σ||F_external||₁. For global moment equilibrium about the recorded origin, require ||ΣM_external + Σ(r×F_external) + ΣM_reaction + Σ(r_support×R_force)||∞ ≤ 1e-3 N m + 1e-8·(Σ||M_external||₁ + Σ||r×F_external||₁). Include distributed loads, concentrated moments, self-weight and prescribed-motion reactions. Separate generated planar-constraint reactions in the report but include them in total equilibrium.

For nonzero prescribed motion, the external-work test must include support reaction work. For a simple zero-prescription, conservative linear case, 0.5 uᵀ K u equals 0.5 uᵀ F after load integration. Test element energy against analytical strain energy. Positive energy and small residual do not by themselves prove correct loading or boundary conditions.

## 3 Included analytical seeds

The machine-readable fixtures/benchmarks.json carries inputs, expected scalars, formulas and entity selectors. The referenced fixtures/models/*.json conform to the included project schema. All sections are synthetic and isotropic; these are frame-formulation tests, not standard catalogue members or code examples. Cases use no shear deformation or warping restraint. Most benchmarks intentionally use generous non-slender dimensions only as numerical parameters; physical suitability is outside their test purpose.

| ID | Purpose | Independent expected magnitude |
| --- | --- | --- |
| B01 | Axial fixed-free member, L=2 m, E=200 GPa, A=0.01 m², P=100 kN | Δ=0.0001 m; axial reaction=100 kN |
| B02 | Cantilever, L=3 m, E=200 GPa, Iy=1e-5 m⁴, downward tip P=10 kN | Tip Δ=0.045 m; θ=0.0225 rad; reaction moment=30 kN m |
| B03 | Pure torsion, L=2 m, G=80 GPa, J=2e-5 m⁴, T=1 kN m | Twist=0.00125 rad |
| B04 | Other bending axis, L=3 m, Iz=2e-5 m⁴, tip Py=−10 kN | uy=−0.0225 m; rz=−0.01125 rad |
| B05 | Simply supported, L=6 m, central P=20 kN, I=8e-5 m⁴ | Midspan Δ=0.005625 m; peak moment=30 kN m |
| B06 | Rotated B02, member global +Z, force global +X | ux=+0.045 m; ry=+0.0225 rad |
| B07 | Simply supported UDL, L=6 m, w=10 kN/m, I=8e-5 m⁴ | Midspan Δ=0.010546875 m; peak moment=45 kN m |
| B08 | Fixed-fixed UDL with same L,w,I | Midspan Δ=0.002109375 m; end moment magnitude=30 kN m |
| B09 | Axial imposed extension, L=2 m, EA=2e9 N, Δ=0.001 m | Tensile force=1 MN; equal opposite reactions |
| B10 | Self-weight cantilever, L=3 m, A=0.01 m², ρ=7850 kg/m³ | w=769.822025 N/m; compare qL⁴/(8EI), qL and qL²/2 |
| B11 | Linear combination 1.2×10 kN + 1.5×5 kN at cantilever tip | Equivalent P=19.5 kN; tip Δ=0.08775 m |
| B12 | Elastic section screen, A=.01, Iy=1e-5, Iz=2e-5, cy=.1, cz=.2 | N=100 kN, My=2 kN m, Mz=3 kN m gives corner range −45 to +65 MPa |

B12 is a pure design-function fixture, not a full project. B05/B07 supports constrain unused out-of-plane DOFs and permit the intended end bending rotation; they do not rely on automatic stabilisation. B08 must recover the loaded interior displacement; a nodal-only interpolator returning zero throughout fails.

Additional required analytical tests before M06: two-span continuous beam using slope-deflection or an independently derived dense reference; pin-ended released member under UDL; beam with a partial-span load; interior point couple; support settlement of a beam; gravity along an arbitrary axis; multiple supports at one node rejected or explicitly merged; unrestrained torsion with an applied torque fails. These are required implementation tasks, not silently claimed to be included numeric references.

## 4 Property and metamorphic tests

Generate deterministic seeds, save every failing model and minimise it. Before M06, run at least 200 valid small connected frame cases per nightly run and a fixed 50-case subset per PR. A valid random case must pass rank/conditioning checks; do not interpret unstable random models as failed numerical comparisons.

Required properties: stiffness symmetry; zero strain energy under rigid-body motion at the free-element level; global rotation invariance; translation invariance; node/member ID and storage-order invariance; endpoint reversal invariance after correct axis/load conversion; load scaling; stiffness scaling; linear superposition; Maxwell reciprocity under identical constraints; force/moment equilibrium; unit-display round-trip; element subdivision convergence; load-case reordering invariance. ModelHash identity is required for unit-display and storage-array reorder changes, but not for renaming entity IDs.

Command properties: execute+undo restores the engineering hash; undo+redo restores the new hash; failed commands do not advance revision; a revision-conflicted command does not mutate state; every result references a known immutable snapshot; applying an old response cannot overwrite a newer selection/model/result.

## 5 Independent oracle corpus

Before M01 acceptance, create an OpenSees portal fixture with two columns, one beam, 4×3 m geometry, fixed bases, a lateral roof nodal force and asymmetric section inertias. Before M03, add a skewed spatial frame, an asymmetric 3D portal, released beams, prescribed support motion and distributed loading. At least 20 accepted oracle cases are required by M06, with 5 including both member loading and local-axis transformations.

Each case stores input model, converter version, original external-solver input, solver name/version, raw output, mapping/sign conventions, expected values, tolerance and provenance. Oracle tooling must fail if its runtime is unavailable; a missing oracle is not a passing test. Pin its environment after the M00 spike. If external-tool licensing or installation blocks a lane, produce a blocked resource record and do not claim the related numerical gate is complete.

For later PROKON comparisons record exact product/module/version, units, element formulation, release and restraint conventions, meshing, code edition and annex, analysis options, combination rules and screenshots/reports where permitted. Differences caused by assumptions need a reconciled fixture, not a looser tolerance. Do not redistribute proprietary example files unless their licence permits it.

## 6 Browser journeys

Use stable accessible names and IDs; exercise actual pointer/keyboard/forms. Browser tests must not inject solved answers or call the result setter. A test may load a project fixture through the real import path; dedicated creation tests must exercise the authoring tools.

Required journeys: first cantilever; create a portal with keyboard/table controls; draw/snap/connect; add member loads and combinations; inspect exact extrema and governing case; save/reload; offline reopen; undo after deletion; restore after analysis-Worker crash; cancel and rerun; recover from GPU device destruction; no-adapter state; cross-tab conflict; quota exceeded; report export; changing units without result invalidation; changing E with invalidation; unknown schema refusal; unsupported design domain; large project progress/cancellation.

Test routes are exposed by ordinary application UI. Developer-only deterministic seeds or capability mocks may exist, but release journeys include at least one genuine WebGPU adapter, real WASM instantiation and actual IndexedDB writes. Playwright supports managed local test servers; pin configuration and readiness checks. [Playwright web server documentation](https://playwright.dev/docs/test-webserver)

## 7 Platform and graphics matrix

Baseline Tier A is a pinned desktop Chromium build on a real Windows or Linux GPU runner. Add a second Tier A lane on macOS when available. Desktop Firefox and Safari are Tier B until their actual release/browser/adapter combinations pass the same corpus; never infer support from marketing or an old compatibility table. Save OS, browser, driver where available, adapter features/limits, screen resolution and devicePixelRatio in evidence.

Run headless/software-GPU correctness tests on each PR. They cannot satisfy hardware performance gates. Run the real-GPU matrix at milestone release and nightly when available. Required rendering cases: transparent selection overlay, depth occlusion, long/short members, zero camera distance handling, devicePixelRatio 1/2, resize, near/far clipping, far-origin geometry, selection ID mapping and camera changes during asynchronous pick. Numerical output must remain unchanged by camera or GPU settings.

Screenshot policy: fixed camera, deterministic geometry, no blinking cursors, animations frozen. Use region-specific comparison and save before/after/diff. Text rasterisation allowances cannot mask missing members, wrong diagrams or hidden failure banners. A screenshot pass does not replace projected-coordinate and ID-selection assertions.

## 8 Performance and capacity gates

These are proposed targets. M00 captures the actual runner identity; agents may not select a new faster runner to conceal a regression. Reference class: 4 physical CPU cores, 16 GiB RAM, modern integrated GPU and 1440×900 viewport. Record actual model, OS, power state and browser; compare on that pinned machine. Performance evidence uses release builds, one warm-up plus five measured runs, no developer tools and no test throttling.

| Scenario | Gate |
| --- | --- |
| Cached application startup with example | Interactive controls and viewport ≤ 2 s |
| Cold local-network load with 10 Mbps / 50 ms latency emulation | Interactive ≤ 5 s; compressed core app+WASM ≤ 8 MiB |
| 1,000-member edit | Command acknowledgement p95 ≤ 100 ms, excluding full analysis |
| 10,000-member orbit, 60 s sample | p95 frame time ≤ 33 ms; no long freeze over 250 ms |
| Hover pick | p95 ≤ 100 ms at 10,000 members |
| 5,000-node/10,000-member/up-to-30,000-active-DOF stable representative frame | Assembly+factorisation+one RHS ≤ 5 s; measured on pinned runner |
| Same stiffness, 50 RHS | Total ≤ 15 s; report batching and factor reuse |
| Analysis cancellation | Visible cancelled state ≤ 250 ms; editing restored ≤ 1 s |
| Project export or import at supported entity count | ≤ 3 s with progress; no lost input |
| Memory | WASM allocated memory ≤ 512 MiB; tab memory ≤ 1 GiB where measurable |

The representative scale fixture is a reproducible 3D multibay frame generator with fixed bases and deterministically connected members, not 5,000 disconnected cantilevers. Record generator seed, counts, active DOFs, matrix nnz and factor nnz. Include an adversarial high-fill graph to prove the memory guard refuses safely. Throughput for 100 cases/500 combinations is measured in bounded batches and streaming output; avoid allocating every graph sample of every combination simultaneously.

## 9 Robustness and security corpus

Invalid project cases: duplicate IDs; dangling references; missing material; zero/negative section quantities; unsupported nu; NaN/Infinity string or numeric overflow; repeated case terms; parallel localY; zero-length member; unsupported release; negative density; out-of-range point station; coordinate bounds; enormous counts and recursive metadata; unknown schema; malformed UTF-8; oversized file. Schema acceptance does not replace semantic checks.

Attack cases: HTML/script in labels and report titles; CSV formula payloads; prototype-key payloads in generic JS maps; resource exhaustion from duplicate topology; future zip path traversal and expansion bombs. Test with CSP headers enabled, no external network availability and blocked storage. Require no unsolicited network request during ordinary modelling/analysis/export after initial asset loading.

Reliability cases: terminate Worker during solve; close tab during a pending save; throw IndexedDB quota error; deny persistence; expire lease; corrupt latest snapshot; deploy a new asset build while an old tab is open; lose GPU adapter. Restore only verified snapshots and tell the user what was recovered. After 100 repeated edit/solve/clear cycles, retained memory after cleanup must not grow by more than 10% beyond the warmed baseline, excluding browser-managed cache noise that is separately measured.

## 10 Code and advanced-analysis gates

Every code rule needs an exact-source clause mapping, a dimensional check, at least one unrounded independently derived example, both sides of every branch, an unsupported-domain case and complete reporting. For each material module, require at least three passing and three failing full workflows and at least one boundary case per mandatory check family. Coverage counts are a floor, not evidence that the code's domain is exhausted.

Shells require documented element derivation, rigid modes, membrane/bending patch tests, distorted mesh, locking sensitivity, convergence and independent reference problems. Target errors must be specified per benchmark before implementation; do not impose one blanket tolerance across singular stresses. Nonlinear modules need force/displacement residuals, increment/iteration controls, load-path tests and explicit nonconvergence. Dynamic modules need mass definition, modal pairing, orthogonality, participation and independent frequency/spectrum examples.

Advanced milestone implementation is blocked until its formulation dossier and numerical benchmark bundle exist. Agents can create original analytical references and lawful independent oracle runs; they cannot invent values for an unavailable named benchmark or mark future design-domain acceptance complete from a generic matrix.

## 11 Gate automation and evidence manifest

The implementation repository must provide these commands, with nonzero exit on failure:

```
npm run build
cargo test --workspace --locked
npm run test:wasm
npm run test:contracts
npm run test:numerical
npm run test:oracle
npm run test:e2e
npm run test:a11y
npm run test:security
npm run test:performance
npm run verify:milestone -- M00
npm run verify:release
```

These command names are requirements for the future repository, not commands supplied by this specification package. The included package checker is python3 tools/check_package.py.

Each evidence manifest records milestone, task ID, git SHA, source tree dirty flag, toolchain and lockfile hashes, dist hashes, model/fixture hashes, command argv, exit code, start/end UTC, runner identity, status and artifact paths. Accepted states are PASS, FAIL, BLOCKED and NOT_APPLICABLE with a policy reason. Required missing evidence, a skip or BLOCKED produces a failed overall gate.

Verification order: schema/semantic checks → native element tests → WASM comparison → analytical corpus → independent oracle → browser workflow → graphics/robustness/accessibility → performance on required runner → release-manifest consistency. Parallelise independent tests where resources allow. Only repeat a costly test when its inputs changed or a failure remains unexplained.
