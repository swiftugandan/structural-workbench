//! IFC4 writer: the project's analysis model as an IfcStructuralAnalysisModel
//! in SI units, with explicit conditions at every member end, workbench
//! identity property sets for lossless round trips, and deterministic GUIDs.
use crate::guid;
use crate::ifc_read::{IDENTITY_PSET, PROJECT_PSET, SECTION_PSET};
use crate::review::Ledger;
use crate::step::{real, string};
use std::collections::BTreeMap;
use std::fmt::Write;
use workbench_model::{Load, Project};

struct Out {
    lines: Vec<String>,
    scope: String,
    labels: BTreeMap<String, String>,
}

impl Out {
    fn add(&mut self, entity: &str, args: &[String]) -> String {
        self.lines.push(format!("{}({})", entity, args.join(",")));
        format!("#{}", self.lines.len())
    }
    fn guid(&self, id: &str) -> String {
        string(&guid::for_entity(&self.scope, id))
    }
    fn point(&mut self, p: [f64; 3]) -> String {
        self.add(
            "IFCCARTESIANPOINT",
            &[format!("({},{},{})", real(p[0]), real(p[1]), real(p[2]))],
        )
    }
    fn direction(&mut self, d: [f64; 3]) -> String {
        self.add(
            "IFCDIRECTION",
            &[format!("({},{},{})", real(d[0]), real(d[1]), real(d[2]))],
        )
    }
    fn single(&mut self, name: &str, value: String) -> String {
        self.add(
            "IFCPROPERTYSINGLEVALUE",
            &[string(name), "$".into(), value, "$".into()],
        )
    }
    /// A Workbench_Identity property set on one object: its entity ID,
    /// presentation label and any further identities it carries.
    fn identity(&mut self, object: &str, owner_id: &str, props: &[(&str, String)]) {
        let mut props = props.to_vec();
        if let Some(l) = self.labels.get(owner_id) {
            props.insert(1, ("Label", id_value(l)));
        }
        let values: Vec<String> = props
            .iter()
            .map(|(n, v)| self.single(n, v.clone()))
            .collect();
        let set_guid = string(&guid::derive(&self.scope, &format!("pset:{owner_id}")));
        let set = self.add(
            "IFCPROPERTYSET",
            &[
                set_guid,
                "$".into(),
                string(IDENTITY_PSET),
                "$".into(),
                format!("({})", values.join(",")),
            ],
        );
        let rel_guid = string(&guid::derive(&self.scope, &format!("rel-pset:{owner_id}")));
        self.add(
            "IFCRELDEFINESBYPROPERTIES",
            &[
                rel_guid,
                "$".into(),
                "$".into(),
                "$".into(),
                format!("({object})"),
                set,
            ],
        );
    }
}

fn id_value(s: &str) -> String {
    format!("IFCIDENTIFIER({})", string(s))
}
fn boolean(b: bool) -> String {
    format!("IFCBOOLEAN(.{}.)", if b { "T" } else { "F" })
}

pub struct Written {
    pub text: String,
    pub ledger: Ledger,
}

/// `timestamp` is ISO 8601; the caller supplies it so output is reproducible.
pub fn write(p: &Project, file_name: &str, timestamp: &str) -> Written {
    let mut o = Out {
        lines: vec![],
        scope: p.id.clone(),
        labels: p.metadata.entity_labels.clone().into_iter().collect(),
    };
    let mut ledger = Ledger::default();
    let label = |id: &str| {
        p.metadata
            .entity_labels
            .get(id)
            .cloned()
            .unwrap_or_else(|| id.to_string())
    };

    // Units: SI, with every derived unit the file uses stated explicitly.
    let si = |o: &mut Out, t: &str, prefix: &str, name: &str| {
        o.add(
            "IFCSIUNIT",
            &[
                "*".into(),
                format!(".{t}."),
                prefix.into(),
                format!(".{name}."),
            ],
        )
    };
    let metre = si(&mut o, "LENGTHUNIT", "$", "METRE");
    let newton = si(&mut o, "FORCEUNIT", "$", "NEWTON");
    let kilogram = si(&mut o, "MASSUNIT", ".KILO.", "GRAM");
    let second = si(&mut o, "TIMEUNIT", "$", "SECOND");
    let radian = si(&mut o, "PLANEANGLEUNIT", "$", "RADIAN");
    let area = si(&mut o, "AREAUNIT", "$", "SQUARE_METRE");
    let volume = si(&mut o, "VOLUMEUNIT", "$", "CUBIC_METRE");
    let pascal = si(&mut o, "PRESSUREUNIT", "$", "PASCAL");
    let derived = |o: &mut Out, t: &str, parts: &[(&String, i32)]| {
        let els: Vec<String> = parts
            .iter()
            .map(|(u, e)| o.add("IFCDERIVEDUNITELEMENT", &[(*u).clone(), e.to_string()]))
            .collect();
        o.add(
            "IFCDERIVEDUNIT",
            &[format!("({})", els.join(",")), format!(".{t}."), "$".into()],
        )
    };
    let units = vec![
        metre.clone(),
        newton.clone(),
        kilogram.clone(),
        second,
        radian.clone(),
        area,
        volume,
        pascal,
        derived(&mut o, "MOMENTOFINERTIAUNIT", &[(&metre, 4)]),
        derived(&mut o, "SECTIONMODULUSUNIT", &[(&metre, 3)]),
        derived(
            &mut o,
            "MODULUSOFELASTICITYUNIT",
            &[(&newton, 1), (&metre, -2)],
        ),
        derived(&mut o, "MASSDENSITYUNIT", &[(&kilogram, 1), (&metre, -3)]),
        derived(&mut o, "LINEARFORCEUNIT", &[(&newton, 1), (&metre, -1)]),
        derived(
            &mut o,
            "LINEARMOMENTUNIT",
            &[(&newton, 1), (&metre, 1), (&metre, -1)],
        ),
        derived(&mut o, "TORQUEUNIT", &[(&newton, 1), (&metre, 1)]),
        derived(&mut o, "LINEARSTIFFNESSUNIT", &[(&newton, 1), (&metre, -1)]),
        derived(
            &mut o,
            "ROTATIONALSTIFFNESSUNIT",
            &[(&newton, 1), (&metre, 1), (&radian, -1)],
        ),
    ];
    let unit_assignment = o.add("IFCUNITASSIGNMENT", &[format!("({})", units.join(","))]);

    let origin = o.point([0., 0., 0.]);
    let wcs = o.add(
        "IFCAXIS2PLACEMENT3D",
        &[origin.clone(), "$".into(), "$".into()],
    );
    let context = o.add(
        "IFCGEOMETRICREPRESENTATIONCONTEXT",
        &[
            "$".into(),
            string("Model"),
            "3".into(),
            real(1e-6),
            wcs.clone(),
            "$".into(),
        ],
    );
    let project = o.add(
        "IFCPROJECT",
        &[
            o.guid("project"),
            "$".into(),
            string(&p.name),
            "$".into(),
            "$".into(),
            "$".into(),
            "$".into(),
            format!("({context})"),
            unit_assignment,
        ],
    );
    let shared = o.add("IFCLOCALPLACEMENT", &["$".into(), wcs]);

    let model_orientation = if p.analysis_mode == "planarXZ" {
        let z = o.direction([0., -1., 0.]);
        let x = o.direction([1., 0., 0.]);
        o.add("IFCAXIS2PLACEMENT3D", &[origin.clone(), z, x])
    } else {
        "$".into()
    };
    let model = o.add(
        "IFCSTRUCTURALANALYSISMODEL",
        &[
            o.guid("analysis-model"),
            "$".into(),
            string(&p.name),
            "$".into(),
            "$".into(),
            if p.analysis_mode == "planarXZ" {
                ".IN_PLANE_LOADING_2D.".into()
            } else {
                ".LOADING_3D.".into()
            },
            model_orientation,
            "$".into(), // LoadedBy: filled below
            "$".into(),
            shared.clone(),
        ],
    );
    o.add(
        "IFCRELAGGREGATES",
        &[
            string(&guid::derive(&p.id, "rel-project-model")),
            "$".into(),
            "$".into(),
            "$".into(),
            project,
            format!("({model})"),
        ],
    );
    {
        let values = vec![
            o.single("EntityId", id_value(&p.id)),
            o.single(
                "TimeoutMs",
                format!("IFCINTEGER({})", p.analysis_settings.timeout_ms),
            ),
            o.single(
                "MemoryLimitMiB",
                format!("IFCINTEGER({})", p.analysis_settings.memory_limit_mi_b),
            ),
            o.single(
                "DisplayUnits",
                format!("IFCLABEL({})", string(&p.display_units)),
            ),
        ];
        let set = o.add(
            "IFCPROPERTYSET",
            &[
                string(&guid::derive(&p.id, "pset:project")),
                "$".into(),
                string(PROJECT_PSET),
                "$".into(),
                format!("({})", values.join(",")),
            ],
        );
        o.add(
            "IFCRELDEFINESBYPROPERTIES",
            &[
                string(&guid::derive(&p.id, "rel-pset:project")),
                "$".into(),
                "$".into(),
                "$".into(),
                format!("({model})"),
                set,
            ],
        );
    }

    // Nodes: every node is a point connection with a shared vertex.
    let mut vertex = BTreeMap::new();
    let mut connection = BTreeMap::new();
    let mut items = vec![];
    let support_of: BTreeMap<&str, &workbench_model::Support> =
        p.supports.iter().map(|s| (s.node.as_str(), s)).collect();
    for n in &p.nodes {
        let pt = o.point(n.position);
        let v = o.add("IFCVERTEXPOINT", &[pt]);
        vertex.insert(n.id.as_str(), v.clone());
        let rep = o.add(
            "IFCTOPOLOGYREPRESENTATION",
            &[
                context.clone(),
                string("Reference"),
                string("Vertex"),
                format!("({v})"),
            ],
        );
        let shape = o.add(
            "IFCPRODUCTDEFINITIONSHAPE",
            &["$".into(), "$".into(), format!("({rep})")],
        );
        let condition = match support_of.get(n.id.as_str()) {
            Some(s) => {
                if s.prescribed.iter().any(|x| *x != 0.) {
                    ledger.add("notExported", "prescribed support displacement", "IFC places displacements in load cases; case-independent settlements are not exported", s.id.clone());
                }
                let f: Vec<String> = s.fixed.iter().map(|x| boolean(*x)).collect();
                o.add(
                    "IFCBOUNDARYNODECONDITION",
                    &[
                        string(&label(&s.id)),
                        f[0].clone(),
                        f[1].clone(),
                        f[2].clone(),
                        f[3].clone(),
                        f[4].clone(),
                        f[5].clone(),
                    ],
                )
            }
            None => "$".into(),
        };
        let c = o.add(
            "IFCSTRUCTURALPOINTCONNECTION",
            &[
                o.guid(&n.id),
                "$".into(),
                string(&label(&n.id)),
                "$".into(),
                "$".into(),
                shared.clone(),
                shape,
                condition,
                "$".into(),
            ],
        );
        let mut props = vec![("EntityId", id_value(&n.id))];
        if let Some(s) = support_of.get(n.id.as_str()) {
            props.push(("SupportId", id_value(&s.id)));
            if let Some(l) = p.metadata.entity_labels.get(&s.id) {
                props.push(("SupportLabel", id_value(l)));
            }
        }
        o.identity(&c, &n.id, &props);
        connection.insert(n.id.as_str(), c.clone());
        items.push(c);
    }

    // Materials and profiles.
    let mut material = BTreeMap::new();
    for m in &p.materials {
        let mi = o.add("IFCMATERIAL", &[string(&m.name), "$".into(), "$".into()]);
        let mech = vec![
            o.single(
                "YoungModulus",
                format!("IFCMODULUSOFELASTICITYMEASURE({})", real(m.e)),
            ),
            o.single(
                "PoissonRatio",
                format!("IFCPOSITIVERATIOMEASURE({})", real(m.nu)),
            ),
        ];
        if m.nu <= 0. {
            ledger.add("converted", "material Poisson's ratio", "IFC's PoissonRatio is a positive ratio; a value ≤ 0 is written but not schema-valid", m.id.clone());
        }
        o.add(
            "IFCMATERIALPROPERTIES",
            &[
                string("Pset_MaterialMechanical"),
                "$".into(),
                format!("({})", mech.join(",")),
                mi.clone(),
            ],
        );
        let common = o.single(
            "MassDensity",
            format!("IFCMASSDENSITYMEASURE({})", real(m.density)),
        );
        o.add(
            "IFCMATERIALPROPERTIES",
            &[
                string("Pset_MaterialCommon"),
                "$".into(),
                format!("({common})"),
                mi.clone(),
            ],
        );
        let mut ident = vec![o.single("EntityId", id_value(&m.id))];
        if let Some(l) = p.metadata.entity_labels.get(&m.id) {
            ident.push(o.single("Label", id_value(l)));
        }
        o.add(
            "IFCMATERIALPROPERTIES",
            &[
                string(IDENTITY_PSET),
                "$".into(),
                format!("({})", ident.join(",")),
                mi.clone(),
            ],
        );
        material.insert(m.id.as_str(), mi);
    }
    let mut profile = BTreeMap::new();
    for s in &p.sections {
        let pd = o.add("IFCPROFILEDEF", &[".AREA.".into(), string(&s.name)]);
        let mech = vec![
            o.single("CrossSectionArea", format!("IFCAREAMEASURE({})", real(s.a))),
            o.single(
                "MomentOfInertiaY",
                format!("IFCMOMENTOFINERTIAMEASURE({})", real(s.iy)),
            ),
            o.single(
                "MomentOfInertiaZ",
                format!("IFCMOMENTOFINERTIAMEASURE({})", real(s.iz)),
            ),
            o.single(
                "TorsionalConstantX",
                format!("IFCMOMENTOFINERTIAMEASURE({})", real(s.j)),
            ),
            o.single(
                "MaximumSectionModulusY",
                format!("IFCSECTIONMODULUSMEASURE({})", real(s.iy / s.cz)),
            ),
            o.single(
                "MinimumSectionModulusY",
                format!("IFCSECTIONMODULUSMEASURE({})", real(s.iy / s.cz)),
            ),
            o.single(
                "MaximumSectionModulusZ",
                format!("IFCSECTIONMODULUSMEASURE({})", real(s.iz / s.cy)),
            ),
            o.single(
                "MinimumSectionModulusZ",
                format!("IFCSECTIONMODULUSMEASURE({})", real(s.iz / s.cy)),
            ),
        ];
        o.add(
            "IFCPROFILEPROPERTIES",
            &[
                string("Pset_ProfileMechanical"),
                "$".into(),
                format!("({})", mech.join(",")),
                pd.clone(),
            ],
        );
        let mut ws = vec![o.single("EntityId", id_value(&s.id))];
        if let Some(l) = p.metadata.entity_labels.get(&s.id) {
            ws.push(o.single("Label", id_value(l)));
        }
        ws.extend([
            o.single(
                "ExtremeFibreY",
                format!("IFCPOSITIVELENGTHMEASURE({})", real(s.cy)),
            ),
            o.single(
                "ExtremeFibreZ",
                format!("IFCPOSITIVELENGTHMEASURE({})", real(s.cz)),
            ),
            o.single("Provenance", format!("IFCTEXT({})", string(&s.provenance))),
        ]);
        o.add(
            "IFCPROFILEPROPERTIES",
            &[
                string(SECTION_PSET),
                "$".into(),
                format!("({})", ws.join(",")),
                pd.clone(),
            ],
        );
        profile.insert(s.id.as_str(), pd);
    }
    // One profile set usage per (material, section) pair.
    let mut usage: BTreeMap<(&str, &str), (String, Vec<String>)> = BTreeMap::new();

    // Members.
    let node_pos: BTreeMap<&str, [f64; 3]> = p
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.position))
        .collect();
    let mut member_ref = BTreeMap::new();
    let mut member_axes = BTreeMap::new();
    for m in &p.members {
        let (a, b) = (node_pos[m.start.as_str()], node_pos[m.end.as_str()]);
        let d: [f64; 3] = std::array::from_fn(|i| b[i] - a[i]);
        let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        let x = d.map(|v| v / l);
        let yy = m.local_y;
        let proj: f64 = (0..3).map(|i| yy[i] * x[i]).sum();
        let yp: [f64; 3] = std::array::from_fn(|i| yy[i] - proj * x[i]);
        let yl = (yp[0] * yp[0] + yp[1] * yp[1] + yp[2] * yp[2]).sqrt();
        let y = yp.map(|v| v / yl);
        let z = [
            x[1] * y[2] - x[2] * y[1],
            x[2] * y[0] - x[0] * y[2],
            x[0] * y[1] - x[1] * y[0],
        ];
        member_axes.insert(m.id.as_str(), (x, y, z, l));
        let edge = o.add(
            "IFCEDGE",
            &[
                vertex[m.start.as_str()].clone(),
                vertex[m.end.as_str()].clone(),
            ],
        );
        let rep = o.add(
            "IFCTOPOLOGYREPRESENTATION",
            &[
                context.clone(),
                string("Reference"),
                string("Edge"),
                format!("({edge})"),
            ],
        );
        let shape = o.add(
            "IFCPRODUCTDEFINITIONSHAPE",
            &["$".into(), "$".into(), format!("({rep})")],
        );
        let axis = o.direction(z);
        let c = o.add(
            "IFCSTRUCTURALCURVEMEMBER",
            &[
                o.guid(&m.id),
                "$".into(),
                string(&label(&m.id)),
                "$".into(),
                "$".into(),
                shared.clone(),
                shape,
                ".RIGID_JOINED_MEMBER.".into(),
                axis,
            ],
        );
        let mut props = vec![
            ("EntityId", id_value(&m.id)),
            // The authored vector; Axis carries the same frame for others.
            ("LocalYX", format!("IFCREAL({})", real(m.local_y[0]))),
            ("LocalYY", format!("IFCREAL({})", real(m.local_y[1]))),
            ("LocalYZ", format!("IFCREAL({})", real(m.local_y[2]))),
        ];
        if let (Some(parent), Some([s0, s1])) = (&m.parent_member_id, m.station_range) {
            props.push(("ParentMemberId", id_value(parent)));
            props.push(("StationStart", format!("IFCREAL({})", real(s0))));
            props.push(("StationEnd", format!("IFCREAL({})", real(s1))));
        }
        o.identity(&c, &m.id, &props);
        for (end, node, rel) in [
            ("start", &m.start, &m.release_start),
            ("end", &m.end, &m.release_end),
        ] {
            let cond = o.add(
                "IFCBOUNDARYNODECONDITION",
                &[
                    string(&format!("{} {end}", label(&m.id))),
                    boolean(true),
                    boolean(true),
                    boolean(true),
                    boolean(true),
                    boolean(!rel.my),
                    boolean(!rel.mz),
                ],
            );
            o.add(
                "IFCRELCONNECTSSTRUCTURALMEMBER",
                &[
                    string(&guid::derive(&p.id, &format!("rel-{}-{end}", m.id))),
                    "$".into(),
                    "$".into(),
                    "$".into(),
                    c.clone(),
                    connection[node.as_str()].clone(),
                    cond,
                    "$".into(),
                    "$".into(),
                    "$".into(),
                ],
            );
        }
        usage
            .entry((m.material.as_str(), m.section.as_str()))
            .or_default()
            .1
            .push(c.clone());
        if m.steel_design.is_some() {
            ledger.add(
                "notExported",
                "steel design settings",
                "design settings are workbench data with no IFC structural analysis equivalent",
                m.id.clone(),
            );
        }
        member_ref.insert(m.id.as_str(), c.clone());
        items.push(c);
    }
    for ((mat, sec), (_, members)) in usage.iter_mut() {
        let mp = o.add(
            "IFCMATERIALPROFILE",
            &[
                "$".into(),
                "$".into(),
                material[mat].clone(),
                profile[sec].clone(),
                "$".into(),
                "$".into(),
            ],
        );
        let set = o.add(
            "IFCMATERIALPROFILESET",
            &["$".into(), "$".into(), format!("({mp})"), "$".into()],
        );
        let u = o.add(
            "IFCMATERIALPROFILESETUSAGE",
            &[set, "10".into(), "$".into()],
        );
        o.add(
            "IFCRELASSOCIATESMATERIAL",
            &[
                string(&guid::derive(&p.id, &format!("rel-material-{mat}-{sec}"))),
                "$".into(),
                "$".into(),
                "$".into(),
                format!("({})", members.join(",")),
                u,
            ],
        );
    }
    o.add(
        "IFCRELASSIGNSTOGROUP",
        &[
            string(&guid::derive(&p.id, "rel-model-items")),
            "$".into(),
            "$".into(),
            "$".into(),
            format!("({})", items.join(",")),
            "$".into(),
            model.clone(),
        ],
    );

    // Load cases and their actions.
    let mut case_ref = BTreeMap::new();
    let all_members: std::collections::BTreeSet<&str> =
        p.members.iter().map(|m| m.id.as_str()).collect();
    for c in &p.load_cases {
        let (action_type, source) = match c.category.as_str() {
            "dead" => ("PERMANENT_G", "DEAD_LOAD_G"),
            "live" => ("VARIABLE_Q", "LIVE_LOAD_Q"),
            "wind" => ("VARIABLE_Q", "WIND_W"),
            _ => ("NOTDEFINED", "NOTDEFINED"),
        };
        // Self weight: IFC's coefficients apply to every member.
        let mut sw = 0.;
        let mut sw_id = None;
        for l in &p.loads {
            if let Load::SelfWeight {
                case,
                members,
                factor,
                id,
            } = l
            {
                if case != &c.id {
                    continue;
                }
                let every: std::collections::BTreeSet<&str> =
                    members.iter().map(String::as_str).collect();
                if every == all_members {
                    sw += factor;
                    sw_id = Some(id.clone());
                } else {
                    ledger.add(
                        "notExported",
                        "self weight on some members",
                        "IFC self-weight coefficients apply to the whole model",
                        id.clone(),
                    );
                }
            }
        }
        let coefficients = if sw != 0. {
            format!("({},{},{})", real(0.), real(0.), real(-sw))
        } else {
            "$".into()
        };
        if p.gravity != [0., 0., -9.80665] && sw != 0. {
            ledger.add(
                "converted",
                "gravity",
                "IFC self weight has no gravity value; standard gravity is implied",
                c.id.clone(),
            );
        }
        let r = o.add(
            "IFCSTRUCTURALLOADCASE",
            &[
                o.guid(&c.id),
                "$".into(),
                string(&c.name),
                "$".into(),
                "$".into(),
                ".LOAD_CASE.".into(),
                format!(".{action_type}."),
                format!(".{source}."),
                "$".into(),
                "$".into(),
                coefficients,
            ],
        );
        let mut props = vec![("EntityId", id_value(&c.id))];
        if let Some(sw) = sw_id.filter(|_| sw != 0.) {
            if let Some(l) = p.metadata.entity_labels.get(&sw) {
                props.push(("SelfWeightLabel", id_value(l)));
            }
            props.push(("SelfWeightId", id_value(&sw)));
        }
        o.identity(&r, &c.id, &props);
        case_ref.insert(c.id.as_str(), r);
    }
    let mut by_case: BTreeMap<&str, Vec<String>> = BTreeMap::new();
    for l in &p.loads {
        let (six, target, placement_vertex, local, name) = match l {
            Load::Nodal { node, values, .. } => (
                Some(*values),
                connection[node.as_str()].clone(),
                None,
                false,
                "nodal",
            ),
            Load::Point {
                member,
                values,
                station,
                axes,
                ..
            } => {
                let (x, _, _, len) = member_axes[member.as_str()];
                let a = node_pos[p
                    .members
                    .iter()
                    .find(|m| &m.id == member)
                    .unwrap()
                    .start
                    .as_str()];
                let at: [f64; 3] = std::array::from_fn(|i| a[i] + x[i] * station * len);
                (
                    Some(*values),
                    member_ref[member.as_str()].clone(),
                    Some(at),
                    axes == "local",
                    "point",
                )
            }
            Load::Uniform {
                member,
                force_per_length,
                axes,
                id,
                case,
            } => {
                let q = force_per_length;
                let lf = o.add(
                    "IFCSTRUCTURALLOADLINEARFORCE",
                    &[
                        string(&label(id)),
                        real(q[0]),
                        real(q[1]),
                        real(q[2]),
                        "$".into(),
                        "$".into(),
                        "$".into(),
                    ],
                );
                let a = o.add(
                    "IFCSTRUCTURALLINEARACTION",
                    &[
                        o.guid(id),
                        "$".into(),
                        string(&label(id)),
                        "$".into(),
                        "$".into(),
                        "$".into(),
                        "$".into(),
                        lf,
                        if axes == "local" {
                            ".LOCAL_COORDS.".into()
                        } else {
                            ".GLOBAL_COORDS.".into()
                        },
                        ".F.".into(),
                        ".TRUE_LENGTH.".into(),
                        ".CONST.".into(),
                    ],
                );
                o.identity(&a, id, &[("EntityId", id_value(id))]);
                o.add(
                    "IFCRELCONNECTSSTRUCTURALACTIVITY",
                    &[
                        string(&guid::derive(&p.id, &format!("rel-activity-{id}"))),
                        "$".into(),
                        "$".into(),
                        "$".into(),
                        member_ref[member.as_str()].clone(),
                        a.clone(),
                    ],
                );
                by_case.entry(case.as_str()).or_default().push(a);
                continue;
            }
            Load::SelfWeight { .. } => continue,
        };
        let (id, case) = (l.id(), l.case());
        let v = six.unwrap();
        let force = o.add(
            "IFCSTRUCTURALLOADSINGLEFORCE",
            &[
                string(&label(id)),
                real(v[0]),
                real(v[1]),
                real(v[2]),
                real(v[3]),
                real(v[4]),
                real(v[5]),
            ],
        );
        let (placement, rep) = match placement_vertex {
            Some(at) => {
                let pt = o.point(at);
                let v = o.add("IFCVERTEXPOINT", &[pt]);
                let r = o.add(
                    "IFCTOPOLOGYREPRESENTATION",
                    &[
                        context.clone(),
                        string("Reference"),
                        string("Vertex"),
                        format!("({v})"),
                    ],
                );
                (
                    shared.clone(),
                    o.add(
                        "IFCPRODUCTDEFINITIONSHAPE",
                        &["$".into(), "$".into(), format!("({r})")],
                    ),
                )
            }
            None => ("$".into(), "$".into()),
        };
        let a = o.add(
            "IFCSTRUCTURALPOINTACTION",
            &[
                o.guid(id),
                "$".into(),
                string(&label(id)),
                "$".into(),
                "$".into(),
                placement,
                rep,
                force,
                if local {
                    ".LOCAL_COORDS.".into()
                } else {
                    ".GLOBAL_COORDS.".into()
                },
                ".F.".into(),
            ],
        );
        let _ = name;
        o.identity(&a, id, &[("EntityId", id_value(id))]);
        o.add(
            "IFCRELCONNECTSSTRUCTURALACTIVITY",
            &[
                string(&guid::derive(&p.id, &format!("rel-activity-{id}"))),
                "$".into(),
                "$".into(),
                "$".into(),
                target,
                a.clone(),
            ],
        );
        by_case.entry(case).or_default().push(a);
    }
    for (case, actions) in &by_case {
        o.add(
            "IFCRELASSIGNSTOGROUP",
            &[
                string(&guid::derive(&p.id, &format!("rel-case-{case}"))),
                "$".into(),
                "$".into(),
                "$".into(),
                format!("({})", actions.join(",")),
                "$".into(),
                case_ref[case].clone(),
            ],
        );
    }
    let mut top = vec![];
    for c in &p.combinations {
        let r = o.add(
            "IFCSTRUCTURALLOADGROUP",
            &[
                o.guid(&c.id),
                "$".into(),
                string(&c.name),
                "$".into(),
                "$".into(),
                ".LOAD_COMBINATION.".into(),
                ".NOTDEFINED.".into(),
                ".NOTDEFINED.".into(),
                "$".into(),
                string(&c.purpose),
            ],
        );
        o.identity(&r, &c.id, &[("EntityId", id_value(&c.id))]);
        for t in &c.terms {
            o.add(
                "IFCRELASSIGNSTOGROUPBYFACTOR",
                &[
                    string(&guid::derive(
                        &p.id,
                        &format!("rel-term-{}-{}", c.id, t.case),
                    )),
                    "$".into(),
                    "$".into(),
                    "$".into(),
                    format!("({})", case_ref[t.case.as_str()]),
                    "$".into(),
                    r.clone(),
                    real(t.factor),
                ],
            );
        }
        top.push(r);
    }
    // LoadedBy: load combinations if any, else load cases (IFC4 note).
    if top.is_empty() {
        top = case_ref.values().cloned().collect();
    }
    let model_index: usize = model[1..].parse::<usize>().unwrap() - 1;
    let line = &mut o.lines[model_index];
    let loaded_by = format!("({})", top.join(","));
    // Replace the 8th attribute placeholder (LoadedBy) in the model line.
    let mut parts = split_top(line);
    parts[7] = loaded_by;
    *line = format!("IFCSTRUCTURALANALYSISMODEL({})", parts.join(","));

    for (subject, reason, list) in [
        (
            "design preview",
            "design drafts are workbench data",
            p.design_previews
                .iter()
                .map(|d| d.id.clone())
                .collect::<Vec<_>>(),
        ),
        (
            "mass source",
            "IFC structural analysis has no modal mass declaration",
            p.mass_sources.iter().map(|m| m.id().to_string()).collect(),
        ),
        (
            "response spectrum",
            "IFC has no response spectrum entity",
            p.response_spectra.iter().map(|s| s.id.clone()).collect(),
        ),
    ] {
        for id in list {
            ledger.add("notExported", subject, reason, id);
        }
    }
    ledger.add(
        "notExported",
        "analysis results",
        "results are not exported; the receiver re-analyses",
        String::new(),
    );
    ledger.add(
        "notExported",
        "physical structure hierarchy",
        "the workbench's physical grouping is presentation data",
        String::new(),
    );

    let mut text = String::new();
    let _ = writeln!(text, "ISO-10303-21;");
    let _ = writeln!(text, "HEADER;");
    let _ = writeln!(
        text,
        "FILE_DESCRIPTION(('ViewDefinition [NotAssigned]','Structural Workbench exchange-v1'),'2;1');"
    );
    let _ = writeln!(
        text,
        "FILE_NAME({},{},(''),(''),'Structural Workbench exchange-v1','Structural Workbench','');",
        string(file_name),
        string(timestamp)
    );
    let _ = writeln!(text, "FILE_SCHEMA(('IFC4'));");
    let _ = writeln!(text, "ENDSEC;");
    let _ = writeln!(text, "DATA;");
    for (k, l) in o.lines.iter().enumerate() {
        let _ = writeln!(text, "#{}={};", k + 1, l);
    }
    let _ = writeln!(text, "ENDSEC;");
    let _ = writeln!(text, "END-ISO-10303-21;");
    Written { text, ledger }
}

/// Split a written entity's argument list at top-level commas.
fn split_top(line: &str) -> Vec<String> {
    let inner = &line[line.find('(').unwrap() + 1..line.len() - 1];
    let (mut depth, mut quoted, mut cur, mut out) = (0, false, String::new(), vec![]);
    for ch in inner.chars() {
        match ch {
            '\'' => quoted = !quoted,
            '(' if !quoted => depth += 1,
            ')' if !quoted => depth -= 1,
            ',' if !quoted && depth == 0 => {
                out.push(std::mem::take(&mut cur));
                continue;
            }
            _ => {}
        }
        cur.push(ch);
    }
    out.push(cur);
    out
}
