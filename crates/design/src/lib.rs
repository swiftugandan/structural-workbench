//! Mechanics-v1 elastic section stress screening.
//! Longitudinal fibre stress only. No stability, yield or code resistance.

use workbench_model::Section;

/// σₓ = N/A + My z / Iy − Mz y / Iz at fibre (y, z) in local section axes.
pub fn longitudinal_stress(
    n: f64,
    my: f64,
    mz: f64,
    s: &Section,
    y: f64,
    z: f64,
) -> f64 {
    n / s.a + my * z / s.iy - mz * y / s.iz
}

/// Four-corner extrema using ±cy, ±cz. Returns (maximum, minimum).
pub fn corner_stress_extrema(n: f64, my: f64, mz: f64, s: &Section) -> (f64, f64) {
    let corners = [
        (s.cy, s.cz),
        (s.cy, -s.cz),
        (-s.cy, s.cz),
        (-s.cy, -s.cz),
    ];
    let mut max = f64::NEG_INFINITY;
    let mut min = f64::INFINITY;
    for (y, z) in corners {
        let v = longitudinal_stress(n, my, mz, s, y, z);
        max = max.max(v);
        min = min.min(v);
    }
    (max, min)
}

#[cfg(test)]
mod tests {
    use super::*;
    use workbench_model::Section;

    fn b12_section() -> Section {
        Section {
            id: "sec1".into(),
            name: "B12".into(),
            a: 0.01,
            iy: 1e-5,
            iz: 2e-5,
            j: 1e-5,
            cy: 0.1,
            cz: 0.2,
            provenance: "B12 fixture".into(),
        }
    }

    #[test]
    fn b12_corner_extrema_and_axis_probes() {
        let s = b12_section();
        let n = 100_000.0;
        let my = 2000.0;
        let mz = 3000.0;
        let (max, min) = corner_stress_extrema(n, my, mz, &s);
        assert!((max - 65e6).abs() < 1e-3, "max {max}");
        assert!((min - -45e6).abs() < 1e-3, "min {min}");
        let at_y0 = longitudinal_stress(n, my, mz, &s, 0.0, s.cz);
        assert!((at_y0 - 50e6).abs() < 1e-3, "y0 {at_y0}");
        let at_z0 = longitudinal_stress(n, my, mz, &s, s.cy, 0.0);
        assert!((at_z0 - -5e6).abs() < 1e-3, "z0 {at_z0}");
    }
}
