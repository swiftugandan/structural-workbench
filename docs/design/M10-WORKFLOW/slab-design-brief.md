> **Layout brief only.** Captions/mockups may show Eurocode — not the code pin. Schedule: [M10-SHELL](../../agent-tasks/M10-SHELL.md) after M10 engineering. ADR 0008.

Concrete slab design would use the same approved Structural Workbench shell, but the central engineering object changes from a **member** to a **2D design surface**.

The repo already points in this direction for M10: define a slab boundary/opening, generate a mesh, apply pressure, inspect plate actions, then produce a restricted reinforcement map under one pinned code profile. It also explicitly requires mesh convergence and distinguishes smoothed display results from the actions actually used for design.

## Core workflow

```text
Slab geometry
    ↓
plate/shell mesh
    ↓
analysis
    ↓
mx / my / mxy (+ membrane/shear where supported)
    ↓
validated design-action transformation
    ↓
required reinforcement
    ↓
practical reinforcement zones
    ↓
detailing checks
    ↓
schedule / report
```

The first important point is that this can't simply reuse the current frame-member solver. M10 needs a separately validated plate/shell numerical family.

### Screen 1 — Slab setup and mesh

Same shell:

```text
┌ Model Explorer ┬────────────── Viewport ──────────────┬ Selection Inspector ┐
│ Slabs          │                                      │ SL01                 │
│   SL01         │       floor plate + mesh             │ Concrete design      │
│   Opening O1   │                                      │                      │
└────────────────┴──────────────────────────────────────┴──────────────────────┘
┌──────────────────────── Results drawer ──────────────────────────────────────┐
│ Analysis | Plate actions | Concrete design | Reinforcement | Mesh | Warnings │
└──────────────────────────────────────────────────────────────────────────────┘
```

The right inspector would show something like:

```text
SL01 — Concrete slab

Geometry
Thickness                 225 mm
Concrete                  C30/37
Reinforcement             B500B
Nominal top cover          30 mm
Nominal bottom cover       25 mm

Design
Profile                   <pinned concrete code>
Design directions         Local X / Local Y

Mesh
Target size               400 mm
Refine at columns         Yes
Refine around openings    Yes
```

The viewport would show the actual slab outline, openings, columns/walls and mesh.

Mesh quality should be visible, not buried:

```text
Elements        2,846
Poor aspect     3
Distorted       0
Convergence     Not checked
```

---

## Screen 2 — Plate action results

This replaces the beam force-diagram concept.

The centre viewport becomes a contour plot:

```text
Plate actions
[ Mx ] [ My ] [ Mxy ] [ Vx ] [ Vy ]

Combination: LC07
Surface: Top / Bottom
Display: Raw / Smoothed
```

A cursor probe should give:

```text
SL01
Element 1837
x = 4.82 m
y = 7.14 m

LC07
mx = -62.4 kNm/m
my = -31.7 kNm/m
mxy = 8.6 kNm/m

Displayed value: averaged
Design source: unsmoothed element action
```

That final distinction matters a lot.

The existing specification explicitly says that **rebar mapping must distinguish averaged display values from design actions**.

I'd make that visible at all times.

---

# Screen 3 — Reinforcement map

This becomes the main slab-design screen.

Instead of one reinforcement arrangement like a beam, there are four fundamental reinforcement fields:

```text
TOP X
TOP Y
BOTTOM X
BOTTOM Y
```

So the viewport toolbar becomes:

```text
Reinforcement

Face
[ Top ] [ Bottom ]

Direction
[ X ] [ Y ]

Display
[ Required As ] [ Provided As ] [ Utilisation ]
```

For example:

```text
TOP X reinforcement

        column     column
          ●           ●
       ███████     ███████
       ███████     ███████
          ░░░░░░░░░
          ░░░░░░░░░
       ███████     ███████
          ●           ●

█  H16 @ 125
▓  H16 @ 175
░  H12 @ 200
```

This is much more useful than a rainbow `As required` contour alone.

The design system should transform raw required reinforcement into **constructible reinforcement zones**.

Example:

```text
Zone T-X-01
Top X
H16 @ 125
Width: 1.50 m column strip
Length: 3.20 m

Required As: 1,145 mm²/m
Provided As: 1,608 mm²/m
Status: PASS
```

---

# Screen 4 — Local slab design detail

Clicking a reinforcement region or point should open calculation details in the bottom drawer while keeping the slab visible.

Example:

```text
TOP X — Column C07 region

PASS

Governing combination
LC12

Design location
x = 8.40 m
y = 6.00 m

Design action
MEd,x = 63.4 kNm/m

Required reinforcement
As,req = 1,145 mm²/m

Provided
H16 @ 125
As,prov = 1,608 mm²/m

Utilisation
0.71
```

Then the detailed tree:

```text
▾ Flexure
   ✓ Top X
   ✓ Top Y
   ✓ Bottom X
   ✓ Bottom Y

▾ Reinforcement limits
   ✓ Minimum reinforcement
   ✓ Maximum reinforcement

▾ Detailing
   ✓ Cover
   ✓ Spacing
   ? Anchorage

▾ Serviceability
   ? Crack width
   ✓ Deflection
```

Only checks actually validated by the chosen code profile should be present as supported.

---

# Screen 5 — Whole-floor reinforcement plan

This should look much closer to an engineering reinforcement drawing than an FEA contour.

For example:

```text
                 GRID 2                   GRID 3

 A ─────────────────────────────────────────────
   │ H12@200 general                            │
   │                                           │
   │    ┌──────────────┐   ┌──────────────┐    │
   │    │ H16@125 TOP  │   │ H16@125 TOP  │    │
 B ─────┤ column strip ├───┤ column strip ├────
   │    └──────────────┘   └──────────────┘    │
   │                                           │
   │         opening                           │
   │       ┌─────────┐                         │
   │       │         │                         │
 C ────────└─────────┘─────────────────────────
```

Toolbar:

```text
Plan
[ Top reinforcement ] [ Bottom reinforcement ]

Direction
[ X ] [ Y ] [ Both ]

Annotations
☑ Bar marks
☑ Spacing
☑ Zone boundaries
☑ Required As
```

This is the point where analysis output starts becoming useful construction/design information.

---

# Screen 6 — Slab design overview

For multiple slab panels:

| Panel | t | Status | Governing | Reinforcement | Util. |
|---|---:|---|---|---|---:|
| SL01 | 225 | PASS | Top X | H16@125 | 0.82 |
| SL02 | 200 | FAIL | Bottom Y | H16@125 | 1.07 |
| SL03 | 250 | UNSUPPORTED | Opening region | — | — |
| SL04 | 225 | STALE | — | — | — |

The viewport can use the same status system already proposed for steel/concrete beams:

- green — PASS
- red — FAIL
- amber — UNSUPPORTED
- gray — STALE
- outline — NOT CHECKED

Selecting the row selects the slab surface.

---

## Openings need special UX

Slabs aren't just rectangles.

Openings create both meshing and design issues.

The UI should make an opening a real model entity:

```text
SL01
 ├ Boundary
 ├ O1 — Stair opening
 └ O2 — Service opening
```

Around an opening the viewport should be able to show:

- mesh refinement,
- local action concentrations,
- reinforcement zones,
- unsupported detailing conditions.

The software should not automatically turn every local finite-element peak into enormous reinforcement.

Re-entrant corners and point supports can produce strong mesh-dependent concentrations, so the product needs a declared policy for how those regions are designed.

---

# Column supports are especially important

Around columns, raw plate moments can become very sensitive to the FE idealisation.

So I'd introduce **design regions** rather than allowing users to design from one pixel in the contour.

For example:

```text
Column C07

┌───────────────────────┐
│   support design zone │
│       ┌─────┐         │
│       │ C07 │         │
│       └─────┘         │
└───────────────────────┘
```

The design report should state exactly how actions were derived for that zone.

No hidden averaging.

---

# Mesh convergence should be a first-class screen

This is something beam design doesn't really need.

For slabs, I'd add:

```text
Mesh convergence

Mesh          Elements        Mx support      Deflection
--------------------------------------------------------
800 mm          720             57.8            11.2
500 mm        1,680             61.3            11.8
350 mm        3,420             62.0            11.9

Change
500 → 350       +1.1%           +0.8%

✓ Convergence criterion satisfied
```

And visually:

```text
Coarse | Medium | Fine
```

The repository's M10 acceptance explicitly requires at least three mesh densities, so this deserves proper product UX rather than being only a test-suite concept.

---

# Required design-action transformation

There is also an important engineering step between:

```text
mx
my
mxy
```

and:

```text
reinforcement X
reinforcement Y
```

The application needs one explicitly documented and validated transformation policy.

For example, if the eventual profile uses a Wood-Armer-type treatment, that must be:

- explicitly selected,
- formulation-documented,
- separately validated,
- visible in reports.

I would not silently hide `mxy` or simply design X reinforcement from `mx` and Y from `my`.

---

# Punching shear

I would **not make punching shear part of the first M10 slab release** unless its code/profile evidence is ready.

The existing roadmap also treats punching as later concrete coverage.

At a column the UI could initially say:

```text
Column C07

Plate flexural design     PASS
Punching shear            NOT CHECKED

This release does not include punching shear design.
```

That's preferable to implying the slab is completely designed.

Later, punching naturally becomes its own overlay:

```text
Punching shear
C07     0.72 PASS
C08     1.08 FAIL
C09     UNSUPPORTED
```

with visible control perimeters.

---

# Slab thickness study

This would be the equivalent of steel section studies, but I would put it after the first slab-design implementation.

Example:

```text
SLAB STUDY

Current
225 mm

Candidate    Mass      Deflection   Reinf. mass   Status
---------------------------------------------------------
180 mm       ↓20%       1.24          ↑31%        FAIL
200 mm       ↓11%       0.93          ↑14%        PASS
225 mm       —          0.71           —          CURRENT
250 mm       ↑11%       0.55          ↓12%        PASS
```

Every candidate needs:

```text
new slab stiffness
→ new self-weight
→ remesh
→ reanalysis
→ new plate actions
→ new reinforcement design
```

So it is substantially more expensive than simply recalculating flexural capacity.

---

# Reinforcement study

You could also study spacing independently:

```text
TOP X — column strip

Candidate       As provided     Util.     Mass
------------------------------------------------
H12 @ 100        1,131           1.01     FAIL
H12 @ 90         1,257           0.91     PASS
H16 @ 150        1,340           0.85     PASS
H16 @ 125        1,608           0.71     PASS
```

This doesn't require changing slab stiffness, so it can be much cheaper than a thickness study.

---

# The five screens I'd build first

For a first useful slab module:

1. **Slab setup + mesh**
   - geometry,
   - openings,
   - thickness/material,
   - supports,
   - mesh controls.

2. **Plate actions**
   - `Mx / My / Mxy`,
   - raw vs displayed smoothing,
   - probes,
   - convergence.

3. **Reinforcement map**
   - Top X/Y,
   - Bottom X/Y,
   - required/provided/utilisation,
   - practical reinforcement zones.

4. **Design details**
   - local region calculation,
   - clause trail,
   - required/provided reinforcement,
   - detailing/status.

5. **Whole-floor reinforcement plan**
   - constructible bar zones,
   - annotations,
   - schedule,
   - design-state overlay.

That would fit very naturally beside the concrete beam module while still respecting the major numerical difference: **beams are 1D members; slabs are mesh-based 2D design surfaces.**

And I would keep the same shell you've now approved for steel and RC beams—Model Explorer left, slab/mesh in the central WebGPU viewport, selected slab/design settings in the right inspector, and analysis/design/reinforcement maps in the bottom Results drawer.