//! Original UK reference building: a connected one-way strip/frame idealisation.
//! All dimensions, loads and ground properties are provisional, not a code design.
use crate::structure::{Collection, EntityRef, Storey};
use crate::*;

pub fn residential_reference() -> Result<Project> {
    let mut p = Project::parse(include_str!("../../../fixtures/models/B02.json"))?;
    p.id = "UKR01".into();
    p.name = "UK residential reference · four storeys".into();
    p.metadata.description = "PRELIMINARY / SYNTHETIC INPUTS. British basis: intended BS EN 1990/1991/1992/1997 with UK National Annexes; no validated concrete code profile. 12 × 12 m, ground + 3 upper floors at 0/3/6/9 m, flat roof 12 m. One-way 200 mm slab strips spanning 6 m, explicit 2 × 6 m stair openings; four pairs of 1.2 m wide flights and intermediate landings. Gross uncracked elastic stiffness; gross member/slab self weight includes overlapping junction volumes (conservative centreline idealisation); no plate action, rigid diaphragm, cracking, creep, P-delta, soil springs, settlement or reinforcement design. Fixed bases at -1 m are an analysis assumption, not verified soil contact. Concrete density 2500 kg/m³, E 30 GPa; finishes/partitions 2 kPa, residential imposed 2 kPa, stairs 3 kPa, roof 0.75 kPa. Nominal 0.5 kPa lateral pressure sensitivity only, not site wind. Gravity examples 1.35G+1.5Q and G+Q are not a complete UK combination set. Firm ground: assumed 200 kPa allowable bearing, no geotechnical report. Pad dimensions 2.4 × 2.4 × 0.6 m are trial sizes. Every resistance check remains UNSUPPORTED; contact INDETERMINATE.".into();
    p.metadata.created_by = "Structural Workbench · Rust reference generator UKR01-v1".into();
    p.metadata.entity_labels.clear();
    p.nodes.clear();
    p.members.clear();
    p.supports.clear();
    p.loads.clear();
    p.materials = vec![Material {
        id: "RC".into(),
        name: "Concrete · provisional uncracked elastic".into(),
        e: 30e9,
        nu: 0.2,
        density: 2500.,
    }];
    p.sections.clear();
    for (id, w, d) in [
        ("column", 0.4, 0.4),
        ("beam", 0.3, 0.6),
        ("slab", 1., 0.2),
        ("flight", 1.2, 0.2),
        ("landing", 1.2, 0.2),
    ] {
        let r = solid_rectangle(w, d, None)?;
        p.sections.push(Section {
            id: id.into(),
            name: format!("{id} · {} × {} mm", w * 1000., d * 1000.),
            a: r.a,
            iy: r.iy,
            iz: r.iz,
            j: r.j,
            cy: r.cy,
            cz: r.cz,
            provenance: r.provenance,
        });
    }
    p.load_cases = [
        ("G", "Permanent · self weight + finishes", "dead"),
        ("Q", "Residential + stairs + roof · provisional", "live"),
        ("WX", "Nominal lateral X · sensitivity only", "wind"),
        ("WY", "Nominal lateral Y · sensitivity only", "wind"),
    ]
    .into_iter()
    .map(|(id, name, category)| LoadCase {
        id: id.into(),
        name: name.into(),
        category: category.into(),
    })
    .collect();
    p.combinations = [
        (
            "SLS",
            "G + Q · provisional service",
            "service",
            vec![("G", 1.), ("Q", 1.)],
        ),
        (
            "ULS",
            "1.35G + 1.5Q · provisional gravity",
            "strength",
            vec![("G", 1.35), ("Q", 1.5)],
        ),
        (
            "LX",
            "G + Q + WX · sensitivity",
            "service",
            vec![("G", 1.), ("Q", 1.), ("WX", 1.)],
        ),
        (
            "LY",
            "G + Q + WY · sensitivity",
            "service",
            vec![("G", 1.), ("Q", 1.), ("WY", 1.)],
        ),
    ]
    .into_iter()
    .map(|(id, name, purpose, terms)| Combination {
        id: id.into(),
        name: name.into(),
        purpose: purpose.into(),
        terms: terms
            .into_iter()
            .map(|(c, f)| Term {
                case: c.into(),
                factor: f,
            })
            .collect(),
    })
    .collect();
    // Every coincident endpoint shares one actual node. No visual-only connections.
    for x in [0., 4., 8., 12.] {
        for y in [0., 6., 12.] {
            let base = node(&mut p, [x, y, -1.]);
            p.supports.push(Support {
                id: format!("base{}", p.supports.len() + 1),
                node: base,
                fixed: [true; 6],
                prescribed: [0.; 6],
            });
            let mut zs = vec![-1., 0., 3., 6., 9., 12.];
            if x <= 4. && y <= 6. {
                zs.extend([1.5, 4.5, 7.5, 10.5]);
                zs.sort_by(f64::total_cmp);
            }
            for z in zs.windows(2) {
                member(&mut p, [x, y, z[0]], [x, y, z[1]], "column", "column", None);
            }
        }
    }
    for level in 0..=4 {
        let z = level as f64 * 3.;
        // X beams are split at slab centrelines and stair attachments.
        for y in [0., 6., 12.] {
            for i in 0..24 {
                member(
                    &mut p,
                    [i as f64 * 0.5, y, z],
                    [(i + 1) as f64 * 0.5, y, z],
                    "beam",
                    "beam",
                    None,
                );
            }
        }
        for x in [0., 4., 8., 12.] {
            for y in [0., 6.] {
                member(&mut p, [x, y, z], [x, y + 6., z], "beam", "beam", None);
            }
        }
        for i in 0..12 {
            for bay in 0..2 {
                // Opening occupies x=0..2, y=0..6 at all suspended levels.
                if level > 0 && bay == 0 && i < 2 {
                    continue;
                }
                let x = i as f64 + 0.5;
                let y = bay as f64 * 6.;
                let id = member(&mut p, [x, y, z], [x, y + 6., z], "slab", "slab", None);
                udl(&mut p, &id, "G", 2000.);
                udl(&mut p, &id, "Q", if level == 4 { 750. } else { 2000. });
            }
        }
    }
    for level in 0..4 {
        let z = level as f64 * 3.;
        let mid = z + 1.5;
        // Intermediate landing support frame terminates at split column nodes.
        for x in [0., 4.] {
            for y in [0., 3.] {
                member(&mut p, [x, y, mid], [x, y + 3., mid], "beam", "beam", None);
            }
        }
        for (a, b) in [(0., 1.), (1., 4.)] {
            member(&mut p, [a, 3., mid], [b, 3., mid], "beam", "beam", None);
        }
        for (a, b) in [(2.4, 3.), (3., 3.6)] {
            let id = member(
                &mut p,
                [1., a, mid],
                [1., b, mid],
                "landing",
                "landing",
                None,
            );
            udl(&mut p, &id, "G", 1200.);
            udl(&mut p, &id, "Q", 3600.);
        }
        for (a, b) in [
            ([1., 0., z], [1., 2.4, mid]),
            ([1., 3.6, mid], [1., 6., z + 3.]),
        ] {
            let id = member(&mut p, a, b, "flight", "stair", Some(9));
            // Step wedges: mean height half a riser over horizontal projection.
            let slope = 2.4_f64.hypot(1.5);
            let projection = 2.4 / slope;
            udl(
                &mut p,
                &id,
                "G",
                (1000. + 2500. * 9.80665 * (1.5 / 9.) / 2.) * 1.2 * projection,
            );
            udl(&mut p, &id, "Q", 3000. * 1.2 * projection);
        }
    }
    let all = p.members.iter().map(|m| m.id.clone()).collect();
    p.loads.push(Load::SelfWeight {
        id: "selfweight".into(),
        case: "G".into(),
        members: all,
        factor: 1.,
    });
    // Deliberately explicit nominal facade forces. No claim of a site wind assessment.
    for level in 1..=4 {
        for x in [0., 4., 8., 12.] {
            for y in [0., 6., 12.] {
                let n = node(&mut p, [x, y, level as f64 * 3.]);
                for (case, axis) in [("WX", 0), ("WY", 1)] {
                    let mut v = [0.; 6];
                    v[axis] = 500. * 12. * 3. / 12.;
                    p.loads.push(Load::Nodal {
                        id: format!("load{}", p.loads.len() + 1),
                        case: case.into(),
                        node: n.clone(),
                        values: v,
                    });
                }
            }
        }
    }
    p.structure = Structure::initialise(&p);
    // Physical concepts group discretised members without inventing split lineage.
    let mut grouped: std::collections::BTreeMap<String, crate::structure::PhysicalMember> =
        Default::default();
    for mut pm in p.structure.physical_members.drain(..) {
        let m = p
            .members
            .iter()
            .find(|m| m.id == pm.analytical_member_ids[0])
            .unwrap();
        let a = p.nodes.iter().find(|n| n.id == m.start).unwrap().position;
        let b = p.nodes.iter().find(|n| n.id == m.end).unwrap().position;
        let key = match m.section.as_str() {
            "slab" => format!("slab-{}-{}-{}", a[2], (a[0] / 4.).floor(), a[1]),
            "column" => format!("column-{}-{}-{}", a[0], a[1], (b[2] / 3.).ceil()),
            "beam" if a[0] != b[0] => format!("beamX-{}-{}-{}", a[2], a[1], (a[0] / 4.).floor()),
            "landing" => format!("landing-{}", a[2]),
            _ => m.id.clone(),
        };
        if let Some(owner) = grouped.get_mut(&key) {
            owner
                .analytical_member_ids
                .append(&mut pm.analytical_member_ids);
        } else {
            grouped.insert(key, pm);
        }
    }
    p.structure.physical_members = grouped.into_values().collect();

    p.structure.storeys = (0..=4)
        .map(|i| Storey {
            id: format!("level{i}"),
            name: if i == 4 {
                "Flat roof · 12 m".into()
            } else if i == 0 {
                "Ground floor · 0 m".into()
            } else {
                format!("Floor {i} · {} m", i * 3)
            },
            elevation: i as f64 * 3.,
        })
        .collect();
    // Roles derive from explicitly assigned sections, never from coordinate guessing.
    for pm in &mut p.structure.physical_members {
        let m = p
            .members
            .iter()
            .find(|m| pm.analytical_member_ids.contains(&m.id))
            .unwrap();
        pm.role = match m.section.as_str() {
            "flight" => "stair",
            x => x,
        }
        .into();
        let b = p.nodes.iter().find(|n| n.id == m.end).unwrap().position;
        let level = ((b[2] / 3.).ceil() as i32).clamp(0, 4);
        if pm.role == "stair" {
            pm.stair_risers = Some(9);
        }
        pm.storey_id = Some(format!("level{level}"));
        pm.name = format!(
            "{} {}",
            match pm.role.as_str() {
                "slab" => "One-way slab panel",
                "stair" => "Stair flight · 9 risers",
                "landing" => "Intermediate landing",
                "column" => "Concrete column",
                _ => "Concrete beam",
            },
            m.id
        );
    }
    for role in ["column", "beam", "slab", "stair", "landing"] {
        p.structure.layers.push(Collection {
            id: format!("layer{role}"),
            name: format!("Concrete {role}"),
            members: p
                .structure
                .physical_members
                .iter()
                .filter(|m| m.role == role)
                .map(|m| EntityRef {
                    kind: "physicalMember".into(),
                    id: m.id.clone(),
                })
                .collect(),
        });
    }
    for s in &p.supports {
        p.design_previews.push(DesignPreview{id:format!("footing{}",s.id),kind:"padFooting".into(),target_id:Some(s.id.clone()),input_source:"syntheticFixture".into(),input_sources:Default::default(),inputs:[("length",2.4),("width",2.4),("thickness",0.6),("cover",0.075),("concreteStrength",30e6),("rebarStrength",500e6),("columnWidth",0.4),("columnDepth",0.4),("bearingPressure",200000.),("embedment",1.6),("soilUnitWeight",18000.)].into_iter().map(|(k,v)|(k.into(),v)).collect(),soil_reference:"Firm ground requested; 200 kPa is a SYNTHETIC assumption, not a ground investigation. Contact and settlement unverified.".into()});
    }
    p.structure.sync_records(&p.clone());
    p.canonicalise();
    p.validate()?;
    Ok(p)
}
fn node(p: &mut Project, pos: [f64; 3]) -> String {
    if let Some(n) = p.nodes.iter().find(|n| n.position == pos) {
        return n.id.clone();
    }
    let id = format!("n{}", p.nodes.len() + 1);
    p.nodes.push(Node {
        id: id.clone(),
        position: pos,
    });
    id
}
fn member(
    p: &mut Project,
    a: [f64; 3],
    b: [f64; 3],
    section: &str,
    _role: &str,
    _steps: Option<u32>,
) -> String {
    let start = node(p, a);
    let end = node(p, b);
    let id = format!("m{}", p.members.len() + 1);
    // Local y horizontal across member; z therefore lies in its vertical plane.
    let local_y = if a[0] != b[0] {
        [0., 1., 0.]
    } else {
        [1., 0., 0.]
    };
    p.members.push(Member {
        id: id.clone(),
        start,
        end,
        material: "RC".into(),
        section: section.into(),
        local_y,
        release_start: Release {
            my: false,
            mz: false,
        },
        release_end: Release {
            my: false,
            mz: false,
        },
        parent_member_id: None,
        station_range: None,
        steel_design: None,
    });
    id
}
fn udl(p: &mut Project, member: &str, case: &str, q: f64) {
    p.loads.push(Load::Uniform {
        id: format!("load{}", p.loads.len() + 1),
        case: case.into(),
        member: member.into(),
        axes: "global".into(),
        force_per_length: [0., 0., -q],
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reference_has_real_connected_concepts() {
        let p = residential_reference().unwrap();
        assert_eq!(p.supports.len(), 12);
        assert_eq!(p.design_previews.len(), 12);
        assert_eq!(p.structure.storeys.len(), 5);
        assert_eq!(
            p.structure
                .physical_members
                .iter()
                .filter(|m| m.role == "stair")
                .count(),
            8
        );
        assert_eq!(
            p.structure
                .physical_members
                .iter()
                .filter(|m| m.role == "slab")
                .count(),
            30
        );
        assert_eq!(
            p.nodes
                .iter()
                .filter(|n| p
                    .members
                    .iter()
                    .filter(|m| m.start == n.id || m.end == n.id)
                    .count()
                    == 0)
                .count(),
            0
        );
        let s = serde_json::to_string(&p).unwrap();
        assert_eq!(Project::parse(&s).unwrap().hash(), p.hash());
    }
}
