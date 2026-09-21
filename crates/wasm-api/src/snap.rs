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
    let axes: [usize; 2] = match q["plane"].as_str().unwrap_or("XZ") {
        "XZ" => [0, 2],
        "XY" => [0, 1],
        "YZ" => [1, 2],
        _ => return Err(err("INVALID_SCHEMA", "Working plane must be XZ, XY or YZ")),
    };
    let normal = 3 - axes[0] - axes[1];
    let positions: std::collections::BTreeMap<_, _> = p
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.position))
        .collect();
    let mut candidates: Vec<(u8, f64, String, [f64; 3], &'static str)> = vec![];
    let mut add = |priority, id: String, at: [f64; 3], kind| {
        if (at[normal] - point[normal]).abs() > 1e-6 {
            return;
        }
        let distance = (at[axes[0]] - point[axes[0]]).hypot(at[axes[1]] - point[axes[1]]);
        if distance <= tolerance {
            candidates.push((priority, distance, id, at, kind));
        }
    };
    for node in &p.nodes {
        add(0, node.id.clone(), node.position, "node");
    }
    if q["features"].as_bool().unwrap_or(false) {
        let mut nearby = vec![];
        for m in &p.members {
            let a = positions[m.start.as_str()];
            let b = positions[m.end.as_str()];
            add(
                2,
                m.id.clone(),
                std::array::from_fn(|i| (a[i] + b[i]) * 0.5),
                "midpoint",
            );
            if (a[normal] - point[normal]).abs() > 1e-6 || (b[normal] - point[normal]).abs() > 1e-6
            {
                continue;
            }
            if axes.iter().all(|i| {
                point[*i] >= a[*i].min(b[*i]) - tolerance
                    && point[*i] <= a[*i].max(b[*i]) + tolerance
            }) {
                nearby.push((m, a, b));
            }
        }
        // Broad-phase rejects distant segments before any pair intersections.
        for (i, (m, a, b)) in nearby.iter().enumerate() {
            for (n, c, d) in nearby.iter().skip(i + 1) {
                let u = axes.map(|i| b[i] - a[i]);
                let v = axes.map(|i| d[i] - c[i]);
                let w = axes.map(|i| c[i] - a[i]);
                let cross = |x: [f64; 2], y: [f64; 2]| x[0] * y[1] - x[1] * y[0];
                let den = cross(u, v);
                if den.abs() < 1e-15 {
                    continue;
                }
                let t = cross(w, v) / den;
                let s = cross(w, u) / den;
                if (0. ..=1.).contains(&t) && (0. ..=1.).contains(&s) {
                    add(
                        1,
                        format!("{}:{}", m.id, n.id),
                        std::array::from_fn(|i| a[i] + t * (b[i] - a[i])),
                        "intersection",
                    );
                }
            }
        }
        if let Some(grid) = q["grid"].as_f64() {
            if !grid.is_finite() || grid <= 0. {
                return Err(err("INVALID_SCHEMA", "Positive grid spacing required"));
            }
            let mut at = point;
            for i in axes {
                at[i] = (point[i] / grid).round() * grid;
            }
            add(3, String::new(), at, "grid");
        }
    }
    candidates.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| a.1.total_cmp(&b.1))
            .then_with(|| a.2.cmp(&b.2))
    });
    Ok(match candidates.first() {
        Some((_, distance, id, position, kind)) => {
            json!({"position":position,"kind":kind,"entityId":if *kind=="node" {Some(id)} else {None},"featureId":id,"distance":distance})
        }
        None => json!({"position":point,"kind":"free","entityId":null,"distance":0}),
    })
}
