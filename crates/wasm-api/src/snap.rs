use serde_json::{Value, json};
use workbench_model::{Project, Result, err};

// Coordinates and distances remain f64. The caller converts the 8 CSS-pixel
// aperture into model units for the orthographic XZ working plane.
pub fn snap(p: &Project, q: &Value) -> Result<Value> {
    let mut value = q["position"].clone();
    for v in value
        .as_array_mut()
        .ok_or_else(|| err("INVALID_SCHEMA", "Position required"))?
    {
        super::quantity(v, "length")?;
    }
    let point: [f64; 3] = serde_json::from_value(value)
        .map_err(|_| err("INVALID_SCHEMA", "Three coordinates required"))?;
    let tolerance = q["tolerance"].as_f64().unwrap_or(1e-6);
    if point.iter().any(|x| !x.is_finite() || x.abs() > 1e7)
        || !tolerance.is_finite()
        || tolerance < 0.
        || tolerance > 1e6
    {
        return Err(err(
            "INVALID_SCHEMA",
            "Invalid snap coordinates or aperture",
        ));
    }
    let mut candidates: Vec<(u8, f64, String, [f64; 3], &'static str)> = vec![];
    let mut add = |priority, id: String, at: [f64; 3], kind| {
        let distance = (0..3)
            .map(|i| (at[i] - point[i]).powi(2))
            .sum::<f64>()
            .sqrt();
        if distance <= tolerance {
            candidates.push((priority, distance, id, at, kind));
        }
    };
    for node in &p.nodes {
        add(0, node.id.clone(), node.position, "node");
    }
    if q["features"].as_bool().unwrap_or(false) {
        for m in &p.members {
            let a = p.nodes.iter().find(|n| n.id == m.start).unwrap().position;
            let b = p.nodes.iter().find(|n| n.id == m.end).unwrap().position;
            add(
                2,
                m.id.clone(),
                std::array::from_fn(|i| (a[i] + b[i]) / 2.),
                "midpoint",
            );
        }
        // Crossing geometry offers a location, never an implicit topological join.
        for (i, m) in p.members.iter().enumerate() {
            let a = p.nodes.iter().find(|n| n.id == m.start).unwrap().position;
            let b = p.nodes.iter().find(|n| n.id == m.end).unwrap().position;
            for n in p.members.iter().skip(i + 1) {
                let c = p
                    .nodes
                    .iter()
                    .find(|node| node.id == n.start)
                    .unwrap()
                    .position;
                let d = p
                    .nodes
                    .iter()
                    .find(|node| node.id == n.end)
                    .unwrap()
                    .position;
                if [a[1], b[1], c[1], d[1]]
                    .iter()
                    .any(|y| (*y - point[1]).abs() > 1e-6)
                {
                    continue;
                }
                let u = [b[0] - a[0], b[2] - a[2]];
                let v = [d[0] - c[0], d[2] - c[2]];
                let cross = |x: [f64; 2], y: [f64; 2]| x[0] * y[1] - x[1] * y[0];
                let den = cross(u, v);
                if den.abs() < 1e-15 {
                    continue;
                }
                let w = [c[0] - a[0], c[2] - a[2]];
                let t = cross(w, v) / den;
                let s = cross(w, u) / den;
                if (0. ..=1.).contains(&t) && (0. ..=1.).contains(&s) {
                    add(
                        1,
                        format!("{}:{}", m.id, n.id),
                        [a[0] + t * u[0], point[1], a[2] + t * u[1]],
                        "intersection",
                    );
                }
            }
        }
        if let Some(grid) = q["grid"].as_f64() {
            if !grid.is_finite() || grid <= 0. {
                return Err(err("INVALID_SCHEMA", "Positive grid spacing required"));
            }
            add(
                3,
                String::new(),
                [
                    (point[0] / grid).round() * grid,
                    point[1],
                    (point[2] / grid).round() * grid,
                ],
                "grid",
            );
        }
    }
    candidates.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| a.1.total_cmp(&b.1))
            .then_with(|| a.2.cmp(&b.2))
    });
    Ok(match candidates.first() {
        Some((_, distance, id, position, kind)) => {
            json!({"position":position,"kind":kind,"entityId":if *kind=="node" {Some(id)} else {None},"distance":distance})
        }
        None => json!({"position":point,"kind":"free","entityId":null,"distance":0}),
    })
}
