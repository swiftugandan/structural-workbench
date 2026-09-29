use serde_json::{Value, json};
use workbench_design::{CheckOutcome, CheckStatus, DesignDemand, DesignRun, native};
use workbench_model::{Project, Result, digest, err};

pub fn apply(v: &mut Value, c: &Value) -> Result<()> {
    let a = &c["args"];
    let id = a["id"]
        .as_str()
        .ok_or_else(|| err("INVALID_SCHEMA", "Member id required"))?;
    let index = v["members"]
        .as_array()
        .unwrap()
        .iter()
        .position(|m| m["id"] == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown design member"))?;
    if c["type"] == "SetSteelDesign" {
        v["members"][index]["steelDesign"] = a["design"].clone();
        return Ok(());
    }
    let sr = a["sectionRef"].as_str().unwrap_or("");
    let mr = a["materialRef"].as_str().unwrap_or("");
    let (mut section, mut material, _) = native::resolve(sr, mr)?;
    let suffix = digest(format!("{}:{}:{}", c["id"], id, v["revision"]).as_bytes());
    section.id = format!("ds{}", &suffix[..20]);
    material.id = format!("dm{}", &suffix[..20]);
    v["members"][index]["section"] = json!(section.id);
    v["members"][index]["material"] = json!(material.id);
    v["sections"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::to_value(section).unwrap());
    v["materials"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::to_value(material).unwrap());
    let unset = json!({"value":null,"source":"notProvided"});
    let previous = v["members"][index]["steelDesign"].clone();
    v["members"][index]["steelDesign"] = json!({"sectionRef":sr,"materialRef":mr,
        "profileId":workbench_design::PROFILE_AISC_360_22_LRFD,
        "stabilityBasis":previous["stabilityBasis"].as_str().unwrap_or("notProvided"),
        "bracing":previous["bracing"].as_str().unwrap_or("notProvided"),
        "ky":previous.get("ky").unwrap_or(&unset),"kz":previous.get("kz").unwrap_or(&unset),
        "lb":previous.get("lb").unwrap_or(&unset),"cb":previous.get("cb").unwrap_or(&unset)});
    // Serviceability criteria belong to the member, not the section.
    if let Some(service) = previous.get("serviceability") {
        v["members"][index]["steelDesign"]["serviceability"] = service.clone();
    }
    Ok(())
}

/// Re-solve the captured model in the disposable worker. The caller supplies only
/// identifiers, never forces or capacities. Every check is a simultaneous action set.
pub fn evaluate(p: &Project, input: &Value) -> Result<Value> {
    if input["modelHash"] != p.hash() {
        return Err(err("STALE_RESULT", "Analysis belongs to another model"));
    }
    let id = input["memberId"].as_str().unwrap_or("");
    let case = input["caseId"].as_str().unwrap_or("");
    native::context(p, id)?;
    if !p.combinations.iter().any(|c| c.id == case) && !p.load_cases.iter().any(|c| c.id == case) {
        return Err(err(
            "INVALID_LOAD",
            "A real case or combination is required; envelopes cannot be designed",
        ));
    }
    let analysis = workbench_assembly::analyse(p, case)?;
    if input["resultId"] != analysis.result_id {
        return Err(err(
            "STALE_RESULT",
            "Selected result identity does not match the captured analysis",
        ));
    }
    if !analysis.converged {
        return Err(err("ANALYSIS_FAILED", "Design requires converged analysis"));
    }
    evaluate_analysis(p, id, case, &analysis)
}

fn evaluate_analysis(
    p: &Project,
    id: &str,
    case: &str,
    analysis: &workbench_results::Analysis,
) -> Result<Value> {
    let context = native::context(p, id)?;
    let m = analysis
        .members
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Result member is missing"))?;
    let registry = workbench_design::default_registry();
    let mut points: Vec<(f64, Option<String>, [f64; 6])> = m
        .key_stations
        .iter()
        .map(|s| (s.station, s.side.clone(), s.actions))
        .collect();
    points.extend(m.samples.iter().map(|s| (s.station, None, s.actions)));
    points.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    points.dedup_by(|a, b| a == b);
    let mut all = Vec::new();
    let mut outcomes = Vec::new();
    let props = context.section.as_ref().unwrap();
    let root = (props.e / context.fy).sqrt();
    for (station, side, actions) in points {
        if actions.iter().any(|v| !v.is_finite()) {
            return Err(err("INVALID_RESULT", "Nonfinite design actions"));
        }
        if actions.iter().all(|v| *v == 0.0) {
            continue;
        }
        let [n, vy, vz, t, my, mz] = actions;
        let demand = DesignDemand {
            n,
            vy,
            vz: 0.0,
            t,
            my,
            mz,
            station,
            combination_id: case.into(),
        };
        let mut ctx = context.clone();
        ctx.torsion_present = t != 0.0;
        let mut run = registry
            .evaluate(workbench_design::PROFILE_AISC_360_22_LRFD, &demand, &ctx)
            .map_err(|e| err("UNSUPPORTED_FEATURE", e))?;
        if n > 0.0 {
            run.checks.push(CheckOutcome::unsupported(
                "tension-detail",
                "D2/D3",
                "Model-native tension connection and net-area details have not been supplied",
            ));
        }
        if my != 0.0 || vz != 0.0 {
            run.checks.push(CheckOutcome::unsupported(
                "weak-axis",
                "F6/G6",
                "Weak-axis bending or shear is outside the model-native S2 scope",
            ));
        }
        // Flexural classification (F2 compact, F3 noncompact flange, F4/F5
        // webs unsupported) is the profile's own flexure check.
        if vy != 0.0 && props.h_over_tw > 2.24 * root {
            run.checks.retain(|c| c.check_id != "shear");
            run.checks.push(CheckOutcome::unsupported(
                "shear",
                "G2.1(a)",
                "Web slenderness is outside the G2.1(a) shear path",
            ));
        }
        run.overall = DesignRun::overall_from_checks(&run.checks);
        for c in &run.checks {
            let mut out = c.to_json();
            out["station"] = json!(station);
            out["side"] = json!(side);
            out["combinationId"] = json!(case);
            out["actions"] = json!(actions);
            out["formulaId"] = json!(c.clause);
            all.push(out);
            outcomes.push(c.clone());
        }
    }
    let overall = if outcomes.is_empty() {
        CheckStatus::Indeterminate
    } else {
        DesignRun::overall_from_checks(&outcomes)
    };
    let rank = |v: &Value| match v["status"].as_str().unwrap_or("") {
        "fail" => 3,
        "unsupported" => 2,
        "indeterminate" => 1,
        _ => 0,
    };
    let governing = all
        .iter()
        .max_by(|a, b| {
            rank(a).cmp(&rank(b)).then_with(|| {
                a["utilisation"]
                    .as_f64()
                    .unwrap_or(-1.0)
                    .total_cmp(&b["utilisation"].as_f64().unwrap_or(-1.0))
            })
        })
        .cloned();
    let mut summary = std::collections::BTreeMap::<String, Value>::new();
    for c in &all {
        let key = c["checkId"].as_str().unwrap().to_string();
        if summary.get(&key).is_none_or(|old| {
            rank(c) > rank(old)
                || (rank(c) == rank(old)
                    && c["utilisation"].as_f64().unwrap_or(-1.0)
                        > old["utilisation"].as_f64().unwrap_or(-1.0))
        }) {
            summary.insert(key, c.clone());
        }
    }
    let settings = native::member(p, id)?.steel_design.as_ref().unwrap();
    let settings_hash = digest(&serde_json::to_vec(settings).unwrap());
    let mut out = json!({"contractVersion":1,"profileId":workbench_design::PROFILE_AISC_360_22_LRFD,"profileVersion":"S2-model-native-1",
        "source":"modelNative","mock":false,"structureHash":p.structure.hash(),"physicalMemberId":p.structure.physical_members.iter().find(|m|m.analytical_member_ids.iter().any(|x|x==id)).map(|m|&m.id),"memberId":id,"combinationId":case,"station":governing.as_ref().map(|g|g["station"].clone()),
        "overall":overall.as_str(),"checks":summary.values().collect::<Vec<_>>(),"stationChecks":all,"governingAction":governing,"modelHash":analysis.model_hash,"sourceRevision":analysis.source_revision,
        "resultId":analysis.result_id,"solverBuildHash":analysis.solver_build_hash,"analysisSettingsHash":analysis.settings_hash,
        "designSettingsHash":settings_hash,"inputs":settings,"catalogue":native::catalogue()["source"],"catalogueSourceHash":native::catalogue()["sourceSha256"],
        "stabilityBasis":"First-order analysis with user effective-length factors; no second-order / direct-analysis compliance claim",
        "bracingSegments":[{"start":0.0,"end":1.0,"kind":settings.bracing,"source":"user"}],
        "serviceability":serviceability(p, id)?,"warnings":["Only the selected case/combination is checked; load completeness is the user's responsibility"],
        "limitations":["Bounded AISC 360-22 strength checks (S2, S3 flexure)", "Tension details, weak-axis actions, noncompact webs and second-order stability remain unsupported", "Serviceability is a user deflection criterion, reported separately from strength; no connection design"]});
    out["designRunId"] = json!(digest(&serde_json::to_vec(&out).unwrap()));
    Ok(out)
}

/// User deflection criterion of one member (ADR 0020), evaluated on a fresh
/// Rust solution of its service case or combination. Its status is separate
/// from the strength `overall` and never changes it.
fn serviceability(p: &Project, id: &str) -> Result<Value> {
    let member = native::member(p, id)?;
    let Some(criteria) = member.steel_design.as_ref().and_then(|d| d.serviceability.as_ref()) else {
        return Ok(json!({"status":"notChecked","reason":"No serviceability criteria are set for this member"}));
    };
    let analysis = workbench_assembly::analyse(p, &criteria.combination_id)?;
    if !analysis.converged {
        return Err(err("ANALYSIS_FAILED", "Service analysis did not converge"));
    }
    let result = analysis
        .members
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Service result member is missing"))?;
    let position = |n: &str| p.nodes.iter().find(|x| x.id == n).unwrap().position;
    let (length, r) = workbench_geometry::axes(position(&member.start), position(&member.end), member.local_y);
    let samples = &result.samples;
    let (first, last) = (samples.first().unwrap().displacement, samples.last().unwrap().displacement);
    let chord = criteria.basis == "chord";
    let mut governing = (0.0f64, 0.0f64, [0.0f64; 3]);
    for s in samples {
        let t = s.station;
        let relative: [f64; 3] = std::array::from_fn(|a| {
            s.displacement[a] - if chord { (1.0 - t) * first[a] + t * last[a] } else { 0.0 }
        });
        let l = workbench_geometry::local(r, relative);
        let transverse = l[1].hypot(l[2]);
        if transverse > governing.0 {
            governing = (transverse, t, l);
        }
    }
    let limit = length / criteria.limit_ratio;
    let ratio = governing.0 / limit;
    Ok(json!({
        "status": if governing.0 <= limit { "pass" } else { "fail" },
        "combinationId": criteria.combination_id,
        "basis": criteria.basis,
        "limitRatio": criteria.limit_ratio,
        "length": length,
        "demand": governing.0,
        "limit": limit,
        "ratio": ratio,
        "station": governing.1,
        "localDeflection": [governing.2[1], governing.2[2]],
        "units": "m",
        "samples": samples.len(),
        "resultId": analysis.result_id,
        "note": "User deflection criterion, not an AISC 360 requirement; sampled at the analysis stations of the member and reported separately from strength",
    }))
}

/// All members are represented, including those without design inputs. One exact
/// simultaneous analysis is shared; no envelope or client-supplied action is accepted.
pub fn overview(p: &Project, input: &Value) -> Result<Value> {
    if input["modelHash"] != p.hash() {
        return Err(err("STALE_RESULT", "Review belongs to another model"));
    }
    let case = input["caseId"].as_str().unwrap_or("");
    if !p.combinations.iter().any(|c| c.id == case) && !p.load_cases.iter().any(|c| c.id == case) {
        return Err(err(
            "INVALID_LOAD",
            "A real case or combination is required",
        ));
    }
    let analysis = workbench_assembly::analyse(p, case)?;
    if input["resultId"] != analysis.result_id {
        return Err(err(
            "STALE_RESULT",
            "Review result identity does not match analysis",
        ));
    }
    if !analysis.converged {
        return Err(err("ANALYSIS_FAILED", "Review requires converged analysis"));
    }
    let mut rows = Vec::new();
    for member in &p.members {
        let ready = native::readiness(p, &member.id)?;
        let run = if ready["status"] == "ready" {
            Some(evaluate_analysis(p, &member.id, case, &analysis)?)
        } else {
            None
        };
        let status = run
            .as_ref()
            .map(|r| r["overall"].clone())
            .unwrap_or_else(|| {
                json!(if ready["status"] == "unsupported" {
                    "unsupported"
                } else {
                    "notChecked"
                })
            });
        let utilisation = run
            .as_ref()
            .and_then(|r| r["checks"].as_array())
            .and_then(|checks| {
                checks
                    .iter()
                    .filter_map(|c| c["utilisation"].as_f64())
                    .max_by(f64::total_cmp)
            });
        rows.push(json!({"memberId":member.id,"status":status,"utilisation":utilisation,"readiness":ready,"run":run}));
    }
    let mut out = json!({"contractVersion":1,"source":"modelNative","mock":false,"modelHash":analysis.model_hash,"sourceRevision":analysis.source_revision,"resultId":analysis.result_id,"caseId":case,"solverBuildHash":analysis.solver_build_hash,"analysisSettingsHash":analysis.settings_hash,"rows":rows,"scope":"All analytical members; selected case only; bounded AISC S2. Not a whole-building compliance result."});
    out["reviewId"] = json!(digest(&serde_json::to_vec(&out).unwrap()));
    Ok(out)
}

/// Finite catalogue study on disposable projects. Never substitutes a candidate
/// result for live analysis and never applies a candidate to the committed model.
pub fn study(p: &Project, input: &Value) -> Result<Value> {
    let baseline = evaluate(p, input)?;
    let id = input["memberId"].as_str().unwrap();
    let case = input["caseId"].as_str().unwrap();
    let refs = input["sectionRefs"]
        .as_array()
        .ok_or_else(|| err("INVALID_SCHEMA", "Select catalogue candidates"))?;
    if refs.is_empty() || refs.len() > 5 {
        return Err(err(
            "INVALID_SCHEMA",
            "Select between one and five catalogue candidates",
        ));
    }
    let mut seen = std::collections::BTreeSet::new();
    for r in refs {
        let sr = r
            .as_str()
            .ok_or_else(|| err("INVALID_SCHEMA", "Candidate reference must be text"))?;
        if !seen.insert(sr) {
            return Err(err("INVALID_SCHEMA", "Duplicate catalogue candidate"));
        }
        native::resolve(sr, native::MATERIAL_ID)?;
    }
    let length = native::context(p, id)?.length;
    let mut rows = Vec::new();
    for sr in seen {
        let (section, material, _) = native::resolve(sr, native::MATERIAL_ID)?;
        let mut value = serde_json::to_value(p).unwrap();
        apply(
            &mut value,
            &json!({"id":format!("study-{sr}"),"type":"AssignSteelCatalogue","args":{"id":id,"sectionRef":sr,"materialRef":native::MATERIAL_ID}}),
        )?;
        let mut candidate = Project::parse(&value.to_string())?;
        candidate.revision = p.revision + 1;
        candidate.canonicalise();
        let analysis = workbench_assembly::analyse(&candidate, case)?;
        if !analysis.converged {
            return Err(err(
                "ANALYSIS_FAILED",
                "Candidate analysis did not converge; study incomplete",
            ));
        }
        let run = evaluate_analysis(&candidate, id, case, &analysis)?;
        rows.push(json!({"sectionRef":sr,"materialRef":native::MATERIAL_ID,"designation":section.name,"massKg":material.density*section.a*length,"modelHash":candidate.hash(),"resultId":analysis.result_id,"reanalysed":true,"run":run}));
    }
    rows.sort_by(|a, b| {
        a["massKg"]
            .as_f64()
            .unwrap()
            .total_cmp(&b["massKg"].as_f64().unwrap())
    });
    let lightest = rows
        .iter()
        .find(|r| r["run"]["overall"] == "pass")
        .map(|r| r["sectionRef"].clone());
    let mut out = json!({"contractVersion":1,"source":"modelNative","mock":false,"memberId":id,"caseId":case,"modelHash":p.hash(),"resultId":baseline["resultId"],"baselineRun":baseline,"objective":"selectedMemberMassKg","candidates":rows,"complete":true,"lightestPassingSectionRef":lightest,"scope":"Only the selected finite catalogue set and analysis case. No global optimality, serviceability, whole-frame or full-code compliance claim."});
    out["studyId"] = json!(digest(&serde_json::to_vec(&out).unwrap()));
    Ok(out)
}
