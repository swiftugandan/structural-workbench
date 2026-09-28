//! M08-B1: the code-agnostic rc_section kernel, given EC2 3.1.7(3) block
//! parameters and 3.2.7(2)b steel, reproduces the JRC89037 beam axis 2 design
//! moments at the published tension areas. Expected values are the example's
//! own published M_Ed (fixtures/design/ec2-uk-na/jrc-axis2-beam.published.json),
//! never kernel output. Tolerance follows the dossier's published-rounding
//! policy: max(0.5 % relative, half a unit in the last published decimal).
use serde_json::Value;
use workbench_design::rc_section::{self, BarLayer, ConcreteLaw, RcRectangle, SteelLaw, TensionState};

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../fixtures/design/ec2-uk-na/jrc-axis2-beam.published.json"
    ))
    .unwrap()
}

#[test]
fn ec2_block_in_kernel_reproduces_jrc_design_moments() {
    let fx = fixture();
    let m = &fx["materials"];
    let fck = m["fck_MPa"].as_f64().unwrap() * 1e6;
    // Example basis: alpha_cc = 1.0 (EU recommended), gamma_c = 1.5, its own rounded fyd.
    let fcd = m["alphaCC"].as_f64().unwrap() * fck / m["gammaC"].as_f64().unwrap();
    let fyd = m["fyd_MPa_published"].as_f64().unwrap() * 1e6;
    let lambda = m["stressBlock"]["lambda"].as_f64().unwrap();
    let eta = m["stressBlock"]["eta"].as_f64().unwrap();
    // Table 3.1: eps_cu3 = 3.5 per mille for fck <= 50 MPa (block strain limit, 6.1(3)P).
    assert!(fck <= 50e6);
    let law = ConcreteLaw::RectangularBlock { intensity: eta * fcd, depth_ratio: lambda, ultimate_strain: 0.0035 };
    // 3.2.7(2)b horizontal top branch; 3.2.7(4) Es = 200 GPa.
    let steel = SteelLaw { yield_strength: fyd, modulus: 200e9 };
    let h = fx["section"]["h_mm"].as_f64().unwrap() / 1000.;
    let hf = fx["section"]["hf_mm"].as_f64().unwrap() / 1000.;
    let mut checked = 0;
    for c in fx["cases"].as_array().unwrap() {
        let id = c["id"].as_str().unwrap();
        if !id.starts_with("JRC-A2-FLEX") {
            continue;
        }
        let b = c["inputs"]["b_mm"].as_f64().unwrap() / 1000.;
        let d = c["inputs"]["d_mm"].as_f64().unwrap() / 1000.;
        let area = c["published"]["AsReq_mm2"]["value"].as_f64().unwrap() / 1e6;
        let med = c["inputs"]["MEd_kNm"].as_f64().unwrap() * 1e3;
        let u = rc_section::ultimate(&RcRectangle { width: b, depth: h }, &[BarLayer { depth: d, area }], &steel, &law).unwrap();
        let tol = (0.005 * med).max(0.5 * 0.1 * 1e3); // published M_Ed has 1 decimal in kN m
        assert!((u.moment - med).abs() <= tol, "{id}: kernel {} N m vs published M_Ed {med} N m", u.moment);
        // The example's route assumes yielding tension steel.
        assert!(matches!(u.classification, TensionState::TensionYielded), "{id}: tension steel must yield");
        if id == "JRC-A2-FLEX-MIDSPAN" {
            // Applicability: a rectangle of width b_eff is valid only while the block stays in the flange.
            assert!(lambda * u.neutral_axis_depth <= hf, "{id}: block leaves the flange");
        }
        checked += 1;
    }
    assert_eq!(checked, 2);
}
