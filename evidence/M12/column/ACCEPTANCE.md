# M12-COLUMN acceptance record

Source hash: `83eb37b6ab55668782eca0c60e69694f51fde7643be8e68da7e5a46c5ba75599`
Build hash: `fb51d59eedce6877434409489a30b59af8f4e8c945f523e12f8fad0f4a35e0ab`
Observed: 2026-09-30T09:41:15.417Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| M12-C1-INTEGRATION | Exact concrete integration against reference and fibre models | kernel_validation | PASS | 23 strain planes over pivots A, B and C on three sections (square parabola, square block, asymmetric rectangle with a steel limit): resultants within 1e-9 of the section scale of the independent exact reference (measured 7.5e-15). They are within the 800² fibre model's measured refinement error (measured 6.2e-7 of scale). The analytic and Gauss branches of the power integral agree to 1e-12. |
| M12-C2-CAPACITY | M_Rd(N, θ) along the demand direction | kernel_validation | PASS | 48 oracle capacities (3 sections × 4 N × 4 θ) within 1e-9 (measured 4.4e-14), with axial residual and direction error ≤ 1e-12 in at most 47 bisection steps each. Squash, tension and the balanced point match their closed forms. At θ = 0° and 90° the capacity equals rc_section::ultimate for all three laws within 1e-9. The square section is symmetric, and contour points are capacities. |
| M12-C3-REFUSALS | Refusals and out-of-range axial force | failure_path | PASS | Invalid sections, bars outside the concrete, strain limits out of order, N outside the range, and contours not surrounding the centre are refused with their diagnostics. Stations beyond the squash load are reported, never rated. Invalid bar counts, covers and ε_c > ε_cu leave the project unchanged. |
| M12-C4-PROTOCOL | Model station actions reach the kernel with the documented signs | kernel_validation | PASS | The rcColumn draft reproduces SQ-PARABOLA: squash and tension within 1e-12, and the N = 0 contour meets the oracle's θ = 0 capacity within 1e-9. On a cantilever loaded to N = 1478.4 kN at θ = 37°, the fixed-end station reports N_Ed = −N_frame, the oracle's M_Rd within 1e-9 and utilisation 0.8. The run is deterministic. |
| M12-C5-BROWSER | Browser journey, export and persistence on the same build | ui_journey | PASS | In the browser build, the column bound to the analysed member shows the 72-point contour with the demand and a governing utilisation of 0.8 (within 1e-9 of the oracle). The downloaded run record and the HTML calculation record carry the same values. Edits make the run STALE, and the project reopens as schema 1.5.0 with the law and ε_c. |

Limitations: rc-column mechanics only: solid rectangular sections, perimeter or listed bars, explicit concrete and steel laws with caller strain limits, and capacity at fixed N_Ed along the demand direction at the member's key stations. Slenderness and second-order moments, minimum eccentricity, partial factors, shear and detailing need the column code profile (M08 resources) and stay UNSUPPORTED; the M12 parent is not accepted.
