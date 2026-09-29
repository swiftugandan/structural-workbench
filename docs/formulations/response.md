# Harmonic and response-spectrum analysis, response-v1 (M15)

Linear dynamic response of the assembled frame built on dynamics-v1
(`modal.md`): the same stability-v1 mesh (`subdivisions` equal elements per
analytical member, point-load expansion), the same stiffness K, the same
declared-mass matrix M (consistent or lumped), the same free DOFs (supports,
planar XZ constraints, hinge DOFs for end releases). SI f64, global Z up.

## Harmonic (steady-state) response

**Excitation.** One real load case or combination gives the amplitude
vector F: nodal loads plus consistent member-load vectors, exactly as in
linear static analysis. The load is F cos(Ωt) at every node (in phase).
Prescribed support displacements are static and carry no dynamic amplitude.

**Damping.** Rayleigh, C = a₀ M + a₁ K, with a₁ > 0. It is entered either
directly (a₀ ≥ 0, a₁ > 0) or as a ratio ζ ∈ (0, 1) at two frequencies
f₁ < f₂: a₀ = 2ζ ω₁ω₂ / (ω₁ + ω₂), a₁ = 2ζ / (ω₁ + ω₂). A mode at ω then has
ζ(ω) = a₀ / (2ω) + a₁ ω / 2, which is reported for every computed mode.

**Solve.** At each requested frequency Ω = 2πf the complex amplitude U
(u(t) = Re(U e^{iΩt})) solves

  Z U = F,  Z = (1 + iΩa₁) K − (Ω² − iΩa₀) M,

directly, not by modal truncation. Z is complex symmetric. Its imaginary
part Ω(a₀M + a₁K) is positive definite on the free DOFs (K is, for a stable
model, and a₁ > 0), so xᴴZx ≠ 0 for x ≠ 0 and every leading principal
submatrix is nonsingular. The unpivoted LDLᵀ factorisation (no conjugation)
therefore exists at every frequency, including resonance. The kernel uses a
sparse up-looking LDLᵀ in complex arithmetic after a reverse Cuthill–McKee
ordering of the free DOFs. The symbolic analysis is done once; one numeric
factorisation is done per frequency. The scaled residual ‖ZU − F‖∞ / ‖F‖∞
must not exceed 1e-8 (`RESIDUAL_FAILURE`).

**Results per frequency.** Complex displacement amplitudes at every original
node (6 components; amplitude |U| and phase arg U, the lag of the response
behind the force being −arg U) and complex support reactions. The reactions
are R = (Z U − F) at the restrained DOFs, computed with the same K, M and C.
Member actions are not reported in response-v1.

**Limits.** 1–200 frequencies, each > 0 and finite, and at most 200 000
node-frequency pairs.

## Response-spectrum analysis

**Spectrum.** A project response spectrum (schema 1.6.0) is a table of
points (T, Sa), with T in s strictly increasing from T = 0 and Sa ≥ 0 in
m/s² (pseudo-acceleration). It also records the damping ratio ζ it
represents and a free-text reference. Sa(T) is linear in T between points.
A mode whose period exceeds the last point is `SPECTRUM_RANGE`: the kernel
never extrapolates. The spectrum is the user's input; the application
supplies no code spectrum.

**Excitation.** One global direction (X, Y or Z) and a scale factor s > 0.

**Modes.** K φ = ω² M φ as in dynamics-v1 (subspace iteration with a Sturm
check), M-normalised, with participation factors Γₙ = φₙᵀ M r for the
direction's influence vector r.

**Modal response.** For mode n the peak modal coordinate is
qₙ = Γₙ s Sa(Tₙ) / ωₙ². The peak response vector is xₙ = φₙ qₙ. Every
response quantity is linear in x:

- nodal displacements;
- element end actions k_e (R x_e) in member local axes (hinge DOFs included
  as in `assemble`);
- support reactions (element end actions assembled at restrained DOFs);
- the total base reaction, which for mode n equals Mₑff,ₙ s Sa(Tₙ) in the
  excitation direction.

**Combination.** For each response quantity r with modal values rₙ:

- SRSS: r = √(Σ rₙ²);
- CQC: r = √(Σᵢ Σⱼ ρᵢⱼ rᵢ rⱼ), with Der Kiureghian's (1981) coefficient for
  equal damping ζ:
  ρᵢⱼ = 8ζ² (1 + β) β^{3/2} / ((1 − β²)² + 4ζ² β (1 + β)²), β = ωⱼ/ωᵢ.

Combined values are non-negative peak magnitudes. Signs, simultaneity and
equilibrium between combined quantities are lost; this is reported.

**Results.**

- Per mode: T, ω, Sa, Γ, effective-mass ratio and modal base shear.
- Combined:
  - node displacement magnitudes (6 per original node);
  - support reaction magnitudes;
  - base reaction magnitudes (X, Y, Z);
  - member section-action magnitudes at every mesh node along each member
    (both sides of interior mesh nodes, from the adjacent elements' end
    actions).
- The cumulative effective-mass ratio in the excitation direction. The
  `PARTICIPATION_TARGET_NOT_MET` warning appears as in dynamics-v1. No
  missing-mass correction is applied (disclosed).

**Limits.** 1–50 modes and a spectrum of 2–200 points. There is one
direction per analysis; directional combination (SRSS, 100/30) is not part
of response-v1.

## Validation (response-v1 oracle)

`fixtures/dynamics/response-oracle.json`, from
`tools/oracles/response_oracle.py`. It is pure Python, with OpenSeesPy 3.4.0
for matrices and modes.

| ID | Case | Reference | Gate |
| --- | --- | --- | --- |
| H-SDOF | Massless cantilever, tip mass, transverse tip load | U = F / (k(1 + iΩa₁) − mΩ² + iΩa₀m), k = 3EI/L³, at 7 frequencies incl. resonance | complex U ≤ 1e-9 relative |
| H-STATIC | Any model, Ω → 0 | linear static solution of the same case | ≤ 1e-8 relative at f = 1e-9 Hz (at 1e-6 Hz the damping phase Ω(a₁ + a₀m/k) is itself 3.7e-8 for the cantilever) |
| H-FRAME-OS | Spatial frame (dynamics-v1 D-FRAME-OS, lumped, 4 subdivisions), lateral load case, Rayleigh ζ = 0.05 at f₁, f₃ | direct complex solve with OpenSees K and M (GimmeMCK) at 5 frequencies | nodal complex U ≤ 1e-6 of max ‖U‖ |
| H-REAL2N | Same frame | the equivalent real 2n × 2n block system (oracle self-check) | agrees with the complex solve to 1e-9 |
| R-SDOF | Cantilever with tip mass | u = s Sa(T)/ω², base shear m s Sa, base moment m s Sa L | ≤ 1e-9 |
| R-SHEAR2 | Two-storey shear frame (D-SHEAR2) | closed-form modes; SRSS and CQC of floor displacements and base shear by hand algebra | ≤ 1e-5 (the frame is near-rigid, as in D-SHEAR2) |
| R-FRAME-OS | Spatial frame, X and Y, SRSS and CQC | OpenSees modes; per-mode member end forces (setNodeDisp + localForce), reactions and displacements; combination in Python | ≤ 1e-6 of each quantity's largest value |
