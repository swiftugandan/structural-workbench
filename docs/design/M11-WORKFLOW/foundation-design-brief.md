> **Layout brief only.** Mockup labels are not the code pin. Schedule: [M11-SHELL](../../../agent-tasks/M11-SHELL.md) after M11 engineering. ADR 0008.

Foundation design should also reuse the same approved Structural Workbench shell, but its mental model is:

**column reaction → soil/contact model → footing geometry → geotechnical checks → structural checks → reinforcement/detailing.**

That matches the repo’s M11 scope: start with a **pad footing**, transfer an exact reaction combination from the model, handle eccentricity/contact correctly, then check bearing, flexure, shear and punching under pinned design rules. Soil capacity remains an engineering input unless a separately validated geotechnical module computes it.

## 1. Selected foundation — setup

The user would select a support/column and create or open its footing:

```text
Model Explorer        Viewport                    Selection Inspector
─────────────────────────────────────────────────────────────────────
Columns                                          F01 — Pad footing
  C07  ───────────►        C07                   Foundation design
Foundations                 │
  F01                       ▼
                       ┌─────────┐
                       │ footing │
                       └─────────┘
```

The right inspector becomes:

```text
F01 — Pad footing

Column
C07

Geometry
Length X                 2.40 m
Length Y                 2.10 m
Thickness                550 mm
Column                    400 × 400 mm

Concrete                  C30/37
Reinforcement             B500B
Cover                     50 mm

Soil
Allowable bearing         200 kPa    User supplied
Foundation depth          1.20 m
Soil unit weight          18 kN/m³
```

The important UX point is that **soil bearing resistance must say where it came from**:

```text
200 kPa
User supplied
```

not imply Structural Workbench calculated it geotechnically.

---

# 2. Load/reaction source

The reaction provenance should be very prominent.

```text
Design actions

Source
Model reaction

Column                  C07
Result                  R1842
Combination             ULS07
Model revision           r42

N                       1,420 kN
Mx                        185 kN·m
My                        112 kN·m
Vx                         35 kN
Vy                         21 kN
```

And:

```text
✓ Analysis current
✓ Reaction belongs to current model hash
```

If the frame changes:

```text
STALE REACTION

Foundation design used reactions from revision r42.
Current model is revision r43.

[Reanalyse structure]
```

Foundation design should never quietly retain old column reactions.

---

# 3. Soil-pressure / contact screen

This is probably the most important foundation-specific visual.

The viewport should be able to show the footing from below or in plan with soil-pressure contours:

```text
Soil pressure — ULS07

qmax = 184 kPa
qmin = 72 kPa

             184
         ┌───────────┐
         │▓▓▓▓▒▒▒░░░ │
         │▓▓▒▒▒░░░   │
         │▒▒░░░      │
         └───────────┘
              72
```

For eccentric loading:

```text
Resultant eccentricity

ex = My / N
ey = Mx / N
```

with the resultant visibly plotted:

```text
┌───────────────────┐
│                   │
│        + column   │
│                   │
│             ●     │ ← reaction resultant
│                   │
└───────────────────┘
```

The bottom drawer could show:

| Check | Result |
|---|---:|
| Area | 5.04 m² |
| Average pressure | 142 kPa |
| qmax | 184 kPa |
| qmin | 72 kPa |
| Allowable/design bearing | 200 kPa |
| Bearing utilisation | 0.92 |

---

# 4. Partial contact / uplift has to be explicit

This is one area where the UX needs to be especially careful.

The repo specifically says:

> no negative tension soil pressure treated as valid full contact

So this must **not** happen:

```text
qmin = -26 kPa
PASS
```

Instead:

```text
CONTACT CONDITION

PARTIAL CONTACT

The full-contact pressure solution produces
qmin = −26 kPa.

Soil tension is not permitted.

Contact area has been recomputed using a
compression-only pressure model.
```

And the viewport should visibly show the actual contact region:

```text
Footing

┌────────────────────┐
│██████████████      │
│████████████        │
│██████████          │
│████████            │
└────────────────────┘

█ compression contact
blank = separated / no soil tension
```

If the resultant falls outside the implemented contact domain:

```text
UNSUPPORTED

Reaction eccentricity is outside the
validated footing-contact model.
```

not an invented pressure distribution.

---

# 5. Foundation design results

The bottom drawer can use the same check hierarchy as steel/concrete:

```text
Foundation design — F01

OVERALL
PASS

Governing
Punching shear
Utilisation 0.84
ULS07
```

Check matrix:

| Check | Status | Util. |
|---|---|---:|
| Bearing pressure | PASS | 0.92 |
| Sliding | PASS | 0.47 |
| Overturning/contact | PASS | — |
| Flexure X | PASS | 0.71 |
| Flexure Y | PASS | 0.65 |
| One-way shear X | PASS | 0.63 |
| One-way shear Y | PASS | 0.58 |
| Punching shear | PASS | 0.84 |
| Minimum reinforcement | PASS | — |
| Bar spacing | PASS | — |
| Anchorage | UNSUPPORTED | — |

If anchorage is mandatory for the profile:

```text
Overall
UNSUPPORTED
```

even though the numeric strength checks pass.

---

# 6. Structural design regions

The footing viewport should show where each structural check acts.

For example:

```text
PLAN

        punching perimeter
       ┌───────────────┐
       │   ┌───────┐   │
       │   │column │   │
       │   └───────┘   │
       └───────────────┘

───────────────  one-way shear section X

│<────────────>│ flexural cantilever region
```

Toggling a check should highlight its geometry:

```text
[ Bearing ]
[ Flexure X ]
[ Flexure Y ]
[ Shear X ]
[ Shear Y ]
[ Punching ]
```

That makes the calculation understandable rather than just showing six utilisations.

---

# 7. Reinforcement view

Like the beam module, footing design should produce real reinforcement arrangements.

Bottom reinforcement might be:

```text
X direction
H16 @ 150

Y direction
H16 @ 175
```

Viewport:

```text
┌─────────────────────────┐
│|||||||||||||||||||||||||│
│=========================│
│||||||  ┌──────┐  ||||||│
│======  │ C07  │  ======│
│||||||  └──────┘  ||||||│
│=========================│
│|||||||||||||||||||||||||│
└─────────────────────────┘
```

And section:

```text
        C07
        ││
      ┌─┴┴─┐
      │    │
──────┴────┴────── ground/top
│                 │
│                 │
│ ● ● ● ● ● ● ●  │ bottom reinforcement
└─────────────────┘
```

Actual cover and spacing should be checked against the proposed discrete arrangement.

---

# 8. Calculation-details screen

Same approved pattern: viewport stays visible, bottom drawer expands.

Example:

```text
▾ Soil/contact
   ✓ Bearing
   ✓ Compression-only contact
   ✓ Resultant location

▾ Flexure
   ✓ X direction
   ✓ Y direction

▾ One-way shear
   ✓ X direction
   ✓ Y direction

▾ Punching
   ✓ Column C07 perimeter

▾ Detailing
   ✓ Minimum reinforcement
   ✓ Cover
   ✓ Spacing
```

Selecting Punching:

```text
Punching shear — C07

Combination           ULS07

Column                 400 × 400 mm
Effective depth        486 mm
Control perimeter      3.54 m

Applied shear          812 kN
Resistance             968 kN

Utilisation            0.84

PASS
```

Plus clause, assumptions and equation trail.

---

# 9. Foundation sizing study

This is where foundation design gets particularly useful.

Same philosophy as the steel section study:

```text
FOUNDATION STUDY — F01

Objective
Minimum concrete volume

Constraints
Bearing utilisation ≤ 1.00
Punching ≤ 1.00
Minimum plan size 1.50 m
Dimension increment 100 mm
```

Candidates:

| Size | Thickness | Bearing | Punching | Rebar mass | Status |
|---|---:|---:|---:|---:|---|
| 2.0 × 1.8 | 500 | 1.16 | 0.91 | 72 kg | FAIL |
| 2.2 × 2.0 | 500 | 0.99 | 0.88 | 83 kg | PASS |
| 2.4 × 2.1 | 550 | 0.92 | 0.84 | 91 kg | CURRENT |
| 2.5 × 2.2 | 500 | 0.81 | 0.93 | 94 kg | PASS |

Then:

```text
Proposed
2.20 × 2.00 × 0.50 m

Concrete     −21%
Rebar         −9%
Bearing       0.99
Punching      0.88

[Apply proposal]
```

Applying dimensions is explicit.

---

# 10. Does every footing candidate need frame reanalysis?

This is a useful distinction from steel members.

If the footing is treated only as a **reaction-consuming design object** and changing it does not alter the structural frame/support stiffness, a candidate footing geometry usually does not require a full superstructure reanalysis.

So the workflow may be:

```text
current verified column reaction
        ↓
many footing candidates
        ↓
foundation checks
```

Much cheaper than steel section optimisation.

But if later foundation stiffness/springs become coupled back into the frame:

```text
foundation changes
→ support stiffness changes
→ structural reanalysis required
```

The UI should state which model applies.

---

# 11. Whole-foundation overview

For an actual building:

```text
Foundation design
  Passing (18)
  Failing (3)
  Unsupported (1)
  Stale (2)
  Not checked (6)
```

Viewport could show foundation status at ground level.

Table:

| Foundation | Column | Size | Status | Governing | Util. |
|---|---|---|---|---|---:|
| F01 | C01 | 2.2×2.0×0.5 | PASS | Bearing | 0.91 |
| F02 | C02 | 2.4×2.2×0.55 | PASS | Punching | 0.84 |
| F03 | C03 | 2.0×1.8×0.5 | FAIL | Bearing | 1.12 |
| F04 | C04 | — | UNSUPPORTED | Contact | — |

Selecting a row selects the footing and column.

---

# 12. Soil inputs need their own provenance

For foundations, this is critical.

I would show:

```text
SOIL DESIGN INPUTS

Allowable bearing pressure
200 kPa
Source: Geotechnical report
Reference: GI-2026-014 §6.2
User entered

Soil unit weight
18 kN/m³
User entered

Groundwater
Not considered
```

A later geotechnical plugin/module might calculate some values, but the foundation module itself shouldn't pretend to be a soil mechanics calculator.

---

# 13. I wouldn't start with combined/strap/raft foundations

First release:

### Pad footing

```text
single column
+
rectangular footing
+
compression-only soil contact
+
reinforced concrete design
```

Then expand in separate slices:

- rectangular eccentric footing,
- pedestal footing,
- combined footing,
- strap footing,
- strip footing,
- raft,
- pile caps.

Each introduces substantially different mechanics/detailing.

---

# The five screens I'd design first

Following the visual language you've approved:

### Screen 1 — Footing setup
Selected column + foundation geometry + soil/materials + reaction source + readiness.

### Screen 2 — Soil pressure/contact
Pressure contour, resultant, eccentricity, full/partial contact, bearing utilisation.

### Screen 3 — Structural design
Flexure, one-way shear and punching with control sections visible in the viewport.

### Screen 4 — Reinforcement/detailing
Bottom reinforcement plan, sections, bar spacing/cover and schedule.

### Screen 5 — Foundation study / whole-project overview
Candidate dimensions plus the project-wide foundation status table.

This would make foundation design feel consistent with steel, beam RC and slab RC, while still giving it its own engineering identity: **the most important visual is not a force diagram or reinforcement contour—it's the relationship between column reaction, soil contact, footing geometry and structural resistance.**