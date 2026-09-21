/// Mechanics only. No stability or code resistance implied.
pub fn longitudinal_stress(
    n: f64,
    my: f64,
    mz: f64,
    s: &workbench_model::Section,
    y: f64,
    z: f64,
) -> f64 {
    n / s.a + my * z / s.iy - mz * y / s.iz
}
