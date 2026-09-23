# Solid rectangular section properties

Width `b` is measured along local **y**; depth `h` along local **z** (matching
catalogue extreme-fibre conventions `cy = b/2`, `cz = h/2`).

| Quantity | Formula |
| --- | --- |
| Area | `A = b h` |
| Second moment about y | `Iy = b h³ / 12` |
| Second moment about z | `Iz = h b³ / 12` |
| Saint-Venant torsion (solid rectangle, longer side `a`, shorter `s`) | `J = a s³ [1/3 − 0.21 (s/a) (1 − s⁴/(12 a⁴))]` |

When the user supplies an explicit custom `J`, that value replaces the
Saint-Venant estimate; A, Iy, Iz, cy and cz remain geometric. Provenance
strings record whether J was computed or custom. The calculator does not store
shape parameters on the project schema — only the derived SI properties.
