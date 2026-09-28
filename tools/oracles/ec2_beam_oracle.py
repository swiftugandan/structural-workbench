#!/usr/bin/env python3
"""Independent EC2 beam oracle (M08-B1).

Recomputes the JRC89037 beam axis 2 example from the clause reading in
docs/code-profiles/ec2-uk-na/dossier-beam.md. It is pure Python, never imports
the Rust kernel, and compares every published figure within the published-
rounding tolerance. It then derives the same beam under the UK National Annex
(AMD1:2009) NDPs, labelled oracle-only (no independent publication).

Writes fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json and exits 1
when any published figure disagrees, or when a documented publication
discrepancy unexpectedly matches.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
FIXTURE = os.path.join(ROOT, "fixtures/design/ec2-uk-na/jrc-axis2-beam.published.json")
OUT = os.path.join(ROOT, "fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json")

# NDP sets. EU = recommended values (as the JRC example uses); UK = NA to BS EN
# 1992-1-1:2004 incorporating National Amendment No. 1 (2009), Table NA.1.
NDP = {
    "EU": {"gammaC": 1.5, "gammaS": 1.15, "alphaCC_flexure": 1.0, "alphaCC_other": 1.0,
           "CRdc_num": 0.18, "k1": 0.15, "cotThetaMax": 2.5, "cotThetaMin": 1.0},
    "UK-NA-2009": {"gammaC": 1.5, "gammaS": 1.15, "alphaCC_flexure": 0.85, "alphaCC_other": 1.0,
                   "CRdc_num": 0.18, "k1": 0.15, "cotThetaMax": 2.5, "cotThetaMin": 1.0},
}


def block(fck):
    """3.1.7(3): lambda (3.19)/(3.20), eta (3.21)/(3.22); eps_cu3 from Table 3.1."""
    if fck <= 50:
        return 0.8, 1.0, 0.0035
    lam = 0.8 - (fck - 50) / 400
    eta = 1.0 - (fck - 50) / 200
    ecu3 = (2.6 + 35 * ((90 - fck) / 100) ** 4) / 1000
    return lam, eta, ecu3


def flexure_required(MEd, b, d, fcd, fyd):
    """JRC design route for a rectangular compression zone (lambda=0.8, eta=1): K, z/d, As."""
    K = MEd / (b * d * d * fcd)
    zd = 0.5 * (1 + math.sqrt(1 - 2 * K))
    As = MEd / (fyd * zd * d)
    return K, zd, As


def flexure_capacity(As, b, d, fcd, fyd, lam, eta):
    """Independent capacity for a given tension area, singly reinforced, steel yielding:
    lam*x = As fyd / (eta fcd b); MRd = As fyd (d - lam x / 2). Also returns x/d."""
    lx = As * fyd / (eta * fcd * b)
    return As * fyd * (d - lx / 2), (lx / lam) / d


def shear(inp, sec, mat, ndp, fyd_links):
    """6.2.2(1) VRd,c with (6.2.b) minimum; 6.2.3(3) vertical links; 6.2.2(6) nu; 9.2.2(5)(6)."""
    fck, bw, d = mat["fck_MPa"], sec["bw_mm"], sec["d_mm"]
    gc = ndp["gammaC"]
    VEd_red = inp["VEdSupport_kN"] * (inp["zeroShearDistance_m"] - d / 1000) / inp["zeroShearDistance_m"]
    CRdc = ndp["CRdc_num"] / gc
    k = min(1 + math.sqrt(200 / d), 2.0)
    rho = min(inp["AslProv_mm2"] / (bw * d), 0.02)
    vmin = 0.035 * k ** 1.5 * math.sqrt(fck)
    VRdc_a = CRdc * k * (100 * rho * fck) ** (1 / 3) * bw * d / 1000
    VRdc = max(VRdc_a, vmin * bw * d / 1000)
    z = inp["zOverD"] * d
    cot = inp["cotTheta"]
    asw_req = VEd_red * 1000 / (z * fyd_links * cot) * 1000
    asw_prov = inp["linkLegs"] * math.pi * inp["linkDiameter_mm"] ** 2 / 4 / inp["linkSpacing_mm"] * 1000
    fyk = mat["fyk_MPa"]
    asw_min = 0.08 * math.sqrt(fck) / fyk * bw * 1000  # rho_w,min * bw per metre, alpha = 90 deg
    sl_max = 0.75 * d * (1 + 1 / math.tan(math.radians(inp["alpha_deg"])))
    nu = 0.6 * (1 - fck / 250)
    fcd_other = ndp["alphaCC_other"] * fck / gc
    # 6.2.3(3) Note 1 / UK NA: nu1 = nu (vertical links; UK: nu(1 - 0.5 cos alpha) = nu at 90 deg); alpha_cw = 1.
    VRdmax = 1.0 * bw * z * nu * fcd_other / (cot + 1 / cot) / 1000
    return {
        "VEdRed_kN": VEd_red, "CRdc": CRdc, "k": k, "rhoL": rho, "vmin_MPa": vmin,
        "VRdc_expr62a_kN": VRdc_a, "VRdc_kN": VRdc, "aswReq_mm2PerM": asw_req,
        "aswProv_mm2PerM": asw_prov, "aswMin_mm2PerM": asw_min, "slMax_mm": sl_max,
        "nu": nu, "VRdMax_kN": VRdmax,
    }


def tolerance(pub):
    return max(0.005 * abs(pub["value"]), 0.5 * 10 ** (-pub["decimals"]))


def main():
    fx = json.load(open(FIXTURE))
    mat, sec = fx["materials"], fx["section"]
    eu = NDP["EU"]
    fcd = eu["alphaCC_flexure"] * mat["fck_MPa"] / eu["gammaC"]
    fyd_pub = mat["fyd_MPa_published"]  # the example's own rounded fyd
    lam, eta, _ = block(mat["fck_MPa"])
    checks, failures = [], []

    def compare(case_id, field, calc, pub, discrepancies):
        tol = tolerance(pub)
        agrees = abs(calc - pub["value"]) <= tol
        documented = any(x["field"] == field for x in discrepancies)
        if documented and field == "aswProv_mm2PerM":
            status = "publishedDiscrepancyConfirmed" if not agrees else "DISCREPANCY_NOTE_WRONG"
        else:
            status = "agrees" if agrees else "DISAGREES"
        if status in ("DISAGREES", "DISCREPANCY_NOTE_WRONG"):
            failures.append(f"{case_id}.{field}: calc {calc} vs published {pub['value']} (tol {tol})")
        checks.append({"case": case_id, "field": field, "published": pub["value"], "oracle": calc,
                       "tolerance": tol, "status": status})

    derived = {}
    for c in fx["cases"]:
        disc = c.get("knownPublicationDiscrepancies", [])
        if c["id"].startswith("JRC-A2-FLEX"):
            MEd = c["inputs"]["MEd_kNm"] * 1e6
            K, zd, As = flexure_required(MEd, c["inputs"]["b_mm"], c["inputs"]["d_mm"], fcd, fyd_pub)
            for field, calc in (("K", K), ("zOverD", zd), ("AsReq_mm2", As)):
                compare(c["id"], field, calc, c["published"][field], disc)
            # Independent capacity at the published As: must return MEd (inverse of the design route).
            MRd, xd = flexure_capacity(c["published"]["AsReq_mm2"]["value"], c["inputs"]["b_mm"],
                                       c["inputs"]["d_mm"], fcd, fyd_pub, lam, eta)
            compare(c["id"], "MRdAtPublishedAs_kNm", MRd / 1e6,
                    {"value": c["inputs"]["MEd_kNm"], "decimals": 1}, disc)
            derived[c["id"]] = {"MRdAtPublishedAs_kNm": MRd / 1e6, "xOverD": xd,
                                "blockDepth_mm": lam * xd * c["inputs"]["d_mm"]}
        else:
            r = shear(c["inputs"], sec, mat, eu, fyd_pub)
            for field, pub in c["published"].items():
                compare(c["id"], field, r[field], pub, disc)
            derived[c["id"]] = r

    # Applicability predicate: the midspan block must lie in the flange for the rectangle (beff) model.
    mid = derived["JRC-A2-FLEX-MIDSPAN"]
    predicate_ok = mid["blockDepth_mm"] <= sec["hf_mm"]
    if not predicate_ok:
        failures.append("JRC-A2-FLEX-MIDSPAN: stress block leaves the flange; rectangle model invalid")

    # Same beam under UK NA (AMD1:2009): oracle-only, not independently published.
    uk = NDP["UK-NA-2009"]
    fcd_uk = uk["alphaCC_flexure"] * mat["fck_MPa"] / uk["gammaC"]
    fyd_exact = mat["fyk_MPa"] / uk["gammaS"]
    uk_variant = {}
    for c in fx["cases"]:
        if c["id"].startswith("JRC-A2-FLEX"):
            MEd = c["inputs"]["MEd_kNm"] * 1e6
            K, zd, As = flexure_required(MEd, c["inputs"]["b_mm"], c["inputs"]["d_mm"], fcd_uk, fyd_exact)
            MRd, xd = flexure_capacity(c["published"]["AsReq_mm2"]["value"], c["inputs"]["b_mm"],
                                       c["inputs"]["d_mm"], fcd_uk, fyd_exact, lam, eta)
            uk_variant[c["id"]] = {"fcd_MPa": fcd_uk, "fyd_MPa": fyd_exact, "K": K, "zOverD": zd,
                                   "AsReq_mm2": As, "MRdAtJrcAs_kNm": MRd / 1e6, "xOverD": xd}
        else:
            uk_variant[c["id"]] = shear(c["inputs"], sec, mat, uk, fyd_exact)

    src = open(os.path.abspath(__file__), "rb").read()
    doc = {
        "fixtureVersion": 1,
        "published": os.path.relpath(FIXTURE, ROOT),
        "publishedSha256": hashlib.sha256(open(FIXTURE, "rb").read()).hexdigest(),
        "oracle": os.path.relpath(os.path.abspath(__file__), ROOT),
        "oracleSha256": hashlib.sha256(src).hexdigest(),
        "python": sys.version.split()[0],
        "dossier": "docs/code-profiles/ec2-uk-na/dossier-beam.md",
        "tolerancePolicy": "max(0.5% relative, half a unit in the last published decimal)",
        "checks": checks,
        "derived": derived,
        "applicability": {"midspanBlockWithinFlange": predicate_ok,
                          "midspanBlockDepth_mm": mid["blockDepth_mm"], "hf_mm": sec["hf_mm"]},
        "ukNa2009Variant": {"independence": "oracle-only (no independent publication)",
                            "ndp": uk, "values": uk_variant},
        "failures": failures,
    }
    with open(OUT, "w") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
    for ch in checks:
        print(f"{ch['status']:>30}  {ch['case']}.{ch['field']}: oracle {ch['oracle']:.6g} vs published {ch['published']}")
    if failures:
        print("FAILURES:\n  " + "\n  ".join(failures))
        sys.exit(1)
    print(OUT)


if __name__ == "__main__":
    main()
