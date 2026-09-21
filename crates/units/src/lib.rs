/// Parse finite scalar units without expressions. Output SI.
pub fn parse(input: &str, dimension: &str, default_factor: f64) -> Result<f64, String> {
    let s = input.trim();
    let end = s
        .find(|c: char| c.is_alphabetic() && c != 'e' && c != 'E')
        .unwrap_or(s.len());
    let (number, unit) = s.split_at(end);
    let n = number.trim().parse::<f64>().map_err(|_| "Invalid number")?;
    let unit = unit.trim();
    let factor = match (dimension, unit) {
        (_, "") => default_factor,
        ("length", "m") => 1.,
        ("length", "mm") => 0.001,
        ("force", "N") => 1.,
        ("force", "kN") => 1000.,
        ("moment", "N m" | "Nm") => 1.,
        ("moment", "kN m" | "kNm") => 1000.,
        ("area", "m2" | "m²") => 1.,
        ("area", "mm2" | "mm²") => 1e-6,
        ("inertia", "m4" | "m⁴") => 1.,
        ("inertia", "mm4" | "mm⁴") => 1e-12,
        ("density", "kg/m3" | "kg/m³") => 1.,
        ("stress", "Pa") => 1.,
        ("stress", "MPa") => 1e6,
        ("stress", "GPa") => 1e9,
        _ => return Err("Unknown or incompatible unit".into()),
    };
    let v = n * factor;
    if v.is_finite() {
        Ok(v)
    } else {
        Err("Non-finite input".into())
    }
}
#[test]
fn units() {
    assert_eq!(parse("250 mm", "length", 1.).unwrap(), 0.25);
    assert_eq!(parse("2.1e5 MPa", "stress", 1.).unwrap(), 2.1e11);
    assert!(parse("10 kN", "length", 1.).is_err());
}
