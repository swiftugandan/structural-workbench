> **Layout brief only.** Code pin for M08 is SPEC/`SOURCES.md` (proposed ACI 318-19), not any Eurocode labels that appear in mockups. Schedule: [M08-SHELL](../../agent-tasks/M08-SHELL.md) after M08 engineering. ADR 0008.

I’d keep the **same application shell we just approved for steel**, but concrete would feel less like “pick a catalogue section” and more like **“design reinforcement inside a fixed concrete member.”**

This aligns with the repo’s M08 intent: rectangular RC beam first, with flexure, shear, min/max reinforcement, anchorage applicability, spacing/cover, serviceability, a legible reinforcement view, and a bar schedule. The repository specifically says not to jump straight to a full RC column interaction solver.

## 1. Selected member — Concrete Design

Same shell:

```text
┌ Model Explorer ┬──────────── WebGPU viewport ───────────┬ Selection Inspector ┐
│                │                                        │ B24                  │
│ Members        │          selected RC beam              │ Properties           │
│   B24          │                                        │ Member results       │
│                │                                        │ Concrete design ←    │
└────────────────┴────────────────────────────────────────┴──────────────────────┘
┌────────────────────────── Results drawer ─────────────────────────────────────┐
│ Analysis | Member results | Concrete design | Reinforcement | Calculation ... │
└───────────────────────────────────────────────────────────────────────────────┘
```

The inspector would change substantially from steel.

### Section and materials

```text
1. Section and materials

Section
Rectangular
b = 300 mm
h = 600 mm

Concrete
C30/37
fck = 30 MPa

Reinforcement
B500B
fyk = 500 MPa

Nominal cover
35 mm      [Project default ▼]
```

Instead of `W18×50 / ASTM A992`, the primary identity becomes:

```text
300 × 600 mm
C30/37
B500B
```

assuming whatever concrete code profile is eventually pinned.

## 2. Reinforcement becomes the key design input/output

This is the largest UX difference from steel.

The right inspector could contain:

```text
2. Reinforcement preferences

Longitudinal bars
Preferred diameters       16, 20, 25 mm
Minimum bars per face     2

Links
Preferred diameters       8, 10 mm
Spacing increment         25 mm

Arrangement
☑ Symmetric where practical
☑ Keep bars continuous where possible
☑ Prefer fewer larger bars
```

But these are **constraints/preferences**, not the final reinforcement.

The design engine generates discrete arrangements and checks that they physically fit.

For example:

```text
Required As = 1,380 mm²

Proposed
4H22 = 1,520 mm²

✓ strength
✓ minimum reinforcement
✓ maximum reinforcement
✓ cover
✓ clear spacing
```

Not merely:

```text
As = 1,380 mm²
PASS
```

because the repository correctly requires an actual discrete bar arrangement that fits.

---

# 3. Viewport should show reinforcement

For concrete, the viewport integration becomes much richer.

When Concrete Design is active, selecting B24 could switch from:

```text
solid beam
```

to:

```text
transparent concrete envelope
+
reinforcement cage
```

Something like:

```text
               top bars
       ●   ●   ●   ●
     ┌───────────────┐
     │ ┌───────────┐ │ ← link
     │ │           │ │
     │ │           │ │
     │ └───────────┘ │
     │   ●   ●   ●   │
     └───────────────┘
              bottom bars
```

The main 3D viewport should be capable of showing:

- top longitudinal bars,
- bottom longitudinal bars,
- stirrups/links,
- support reinforcement zones,
- span reinforcement zones,
- curtailment/anchorage zones later.

You should be able to toggle:

```text
[ Concrete ]
[ Reinforcement ]
[ Both ]
```

---

# 4. Bottom drawer — Concrete design result

The same bottom drawer used for Steel Design becomes:

```text
Concrete design — B24

OVERALL
PASS

Governing
Flexure at support B
Utilisation 0.89
LC07
x/L = 0.00
```

Then a check matrix:

| Check | Location | Status | Utilisation |
|---|---|---|---:|
| Flexure — bottom | Span | PASS | 0.76 |
| Flexure — top | Left support | PASS | 0.89 |
| Flexure — top | Right support | PASS | 0.82 |
| Shear | Left support | PASS | 0.71 |
| Minimum reinforcement | Member | PASS | — |
| Maximum reinforcement | Member | PASS | — |
| Bar spacing | Section | PASS | — |
| Cover | Section | PASS | — |
| Anchorage | Left end | UNSUPPORTED | — |
| Deflection | SLS03 | PASS | 0.68 |

And, exactly like steel:

> one unsupported mandatory check means the overall design cannot be PASS.

---

# 5. Reinforcement layout screen

I would make this a separate bottom-drawer tab:

```text
Analysis
Member results
Concrete design
Reinforcement   ←
Calculation details
Schedule
```

The user sees both longitudinal and section views.

### Longitudinal view

```text
LEFT SUPPORT                  SPAN                  RIGHT SUPPORT

┌────────────────────────────────────────────────────────────┐
│ ━━━━━━━━━━━━━━━ 4H20 TOP ━━━━━━━━━━━━━━━━                  │
│                                                            │
│       ━━━━━━━━━━━━━━━━━ 4H22 BOTTOM ━━━━━━━━━━━━━━━        │
└────────────────────────────────────────────────────────────┘

Links:
H10 @ 100          H10 @ 200               H10 @ 100
|<──── 1.2 m ────>|<──── 4.0 m ─────────>|<── 1.2 m ──>|
```

This is far more informative than only displaying `As`.

### Cross-section

```text
       300
┌──────────────────┐
│  ●          ●    │   2H16 top
│ ┌──────────────┐ │
│ │              │ │
│ │              │ │     h = 600
│ │              │ │
│ └──────────────┘ │
│ ●   ●   ●   ●    │   4H22 bottom
└──────────────────┘

cover = 35 mm
H10 links
```

This view should detect things such as:

```text
✕ 5H25 does not fit required clear spacing
```

rather than letting the calculation pass numerically.

---

# 6. Concrete-specific governing locations

Steel often lends itself to a single governing utilisation somewhere along the member.

RC beams need more explicit **design regions**.

For example:

```text
B24

A             B                  C
|-------------|------------------|
Left support       Span          Right support

Top steel
4H20          2H16 nominal        4H20

Bottom steel
2H16          4H22                2H16

Shear links
H10@100       H10@200             H10@100
```

So design results should naturally group around:

- left support,
- span,
- right support,

while still preserving exact stations underneath.

That will make the UI much more usable than showing 40 independent stations.

---

# 7. Calculation detail screen

Same layout concept as the steel calculation-details screen.

Viewport remains visible.

Bottom drawer expands:

```text
Concrete design checks

▾ Flexure
   ✓ Span positive moment
   ✓ Left support negative moment
   ✓ Right support negative moment

▾ Shear
   ✓ Left
   ✓ Right

▾ Detailing
   ✓ Minimum reinforcement
   ✓ Maximum reinforcement
   ✓ Cover
   ✓ Spacing
   ! Anchorage

▾ Serviceability
   ✓ Deflection
   ? Crack width
```

Selecting, say:

```text
Flexure — left support
```

would show:

```text
Clause               ...
Combination          LC07
Station              x/L = 0.00

MEd                   242 kN·m
d                     542 mm
fcd                   ...
fyd                   ...

Required As           1,380 mm²
Provided As           1,520 mm²

Arrangement
4H22

Utilisation
0.89
```

Then intermediates and equations underneath.

---

# 8. Whole-model concrete overview

Same concept as Steel Design Overview:

```text
Member   Section     Reinforcement       Status        Governing
────────────────────────────────────────────────────────────────
B01      300×600     4H22 / 2H16        PASS          Flexure 0.82
B02      300×600     5H25 / 2H16        FAIL          Spacing
B03      250×500     3H20 / 2H16        PASS          Shear 0.73
B04      300×650     —                  UNSUPPORTED   Anchorage
B05      300×600     —                  NOT CHECKED   —
B06      350×700     5H22 / 3H16        STALE         —
```

Filters:

```text
[All]
[Failing]
[Unsupported]
[Stale]
[Not checked]
[Flexure]
[Shear]
[Detailing]
[Serviceability]
```

And the viewport could overlay:

```text
green    passing
red      failing
amber    unsupported
gray     stale
outline  not checked
```

---

# 9. Reinforcement study replaces the steel “section study”

Steel explores:

```text
W18×40
W18×46
W18×50
...
```

Concrete should explore **reinforcement arrangements**.

Example:

```text
REINFORCEMENT STUDY — B24

Required As
1,380 mm²

Candidate       As         Util.    Fits?   Mass
───────────────────────────────────────────────
3H25          1,473        0.94      ✓      11.6
4H22          1,520        0.89      ✓      12.0   ← proposed
5H20          1,571        0.86      ✓      12.4
4H25          1,963        0.69      ✓      15.4
6H20          1,885        —         ✕      —
```

Constraints might include:

```text
Objective
Minimum reinforcement mass

Allowed diameters
16 / 20 / 22 / 25

Minimum bars
2

Maximum layers
2

Prefer single layer
✓
```

Just like steel optimisation:

> the algorithm proposes; the user explicitly applies.

---

# 10. Beam-size study can come later

Eventually there could also be:

```text
SECTION STUDY

Current
300 × 600

Alternatives
275 × 650
300 × 650
325 × 600
...
```

But this is significantly more complex than reinforcement enumeration because changing beam dimensions changes:

- stiffness,
- self-weight,
- structural actions,
- reinforcement demand,
- deflection.

Every geometric candidate therefore needs reanalysis.

I would **not** include this in the first concrete module.

---

# 11. Bar schedule

This is something steel member design doesn't need in quite the same way.

M08 explicitly calls for scheduling, so the bottom drawer gets:

```text
Schedule
```

Example:

| Mark | Member | Bar | Shape | Qty | Length | Total |
|---|---|---|---|---:|---:|---:|
| B24-01 | B24 | H22 | 01 | 4 | 6.80 m | 27.20 m |
| B24-02 | B24 | H20 | 02 | 4 | 2.10 m | 8.40 m |
| B24-03 | B24 | H10 | 51 | 34 | 1.72 m | 58.48 m |

And ideally clicking a schedule item highlights those bars in the reinforcement view.

This gives a strong link:

```text
analysis
→ design
→ reinforcement arrangement
→ detailing
→ schedule
```

---

# 12. Important concrete readiness checks

The readiness block should be concrete-specific:

```text
DESIGN READINESS

✓ Analysis current
✓ Rectangular section recognised
✓ Concrete grade defined
✓ Reinforcement grade defined
✓ Strength combinations available
✓ Service combinations available
✓ Cover defined
✓ Preferred bar diameters defined
! Anchorage model incomplete
```

This helps the user understand why a design may be incomplete before pressing Run.

---

# 13. Concrete assumptions deserve high visibility

The design basis should prominently show things such as:

```text
Concrete profile
<code + edition>

Analysis
First-order elastic

Section
300 × 600 mm

Concrete
C30/37

Reinforcement
B500B

Nominal cover
35 mm

Effective depth
Derived from actual proposed bars

Serviceability
Deflection checked
Crack width unsupported
```

Again, no hidden defaults.

---

# 14. I would use five core screens

Mirroring the approved steel proposal:

### Screen 1 — Selected RC beam design
Current shell; inspector contains section/material/cover/preferences/readiness; bottom drawer gives design summary.

### Screen 2 — Reinforcement layout
Viewport + longitudinal reinforcement drawing + cross-section + bar fit/spacing checks.

### Screen 3 — Calculation details
Check tree, governing actions, equations, provided reinforcement, clause trail.

### Screen 4 — Whole-model concrete design overview
Pass/fail/unsupported/stale table synchronized with viewport.

### Screen 5 — Reinforcement study and schedule
Discrete bar arrangements, selected proposal, before/after comparison, and generated schedule.

I'd actually make **reinforcement layout** more prominent than the steel section catalogue, because for RC that is the central design artefact.

## The overall mental model

Steel:

```text
member
→ select section
→ check resistance
→ explore other sections
```

Concrete:

```text
member geometry
→ concrete + reinforcement grades
→ calculate required reinforcement
→ generate discrete reinforcement arrangement
→ verify it physically fits
→ check detailing + serviceability
→ generate reinforcement schedule
```

So the concrete module should feel like **“turn analysis demand into constructible reinforcement”**, not merely “calculate an RC utilisation.”

That distinction is what would make the concrete module feel like a genuine companion to the steel design workflow rather than the same screen with different equations.

The repo’s M08 definition is consistent with this direction: rectangular RC beam first, discrete reinforcement enumeration, flexure/shear/detailing/serviceability checks, reinforcement visualisation, and a schedule. The relevant current specification is [SPECIFICATION.md](https://github.com/swiftugandan/structural-workbench/blob/main/SPECIFICATION.md), particularly M08.