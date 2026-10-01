#!/usr/bin/env python3
"""Independent EC2 column oracle (M12, ADR 0027).

Pure Python from the clause reading in
docs/code-profiles/ec2-uk-na/dossier-column.md; it never imports the Rust
kernel. Two parts:

1. JRC89037 3.2.2.4 Column B2: every figure the report derives consistently
   is reproduced within its printed rounding, and every documented
   publication discrepancy is confirmed to disagree with the code text.
2. Design-moment cases under the UK NA (2009) NDPs for the Rust tests:
   effective length (5.15)/(5.16), slenderness and λ_lim (5.13N), the 5.2(7)
   imperfection, nominal curvature (5.8.8) and the 6.1(4) minimum
   eccentricity, for braced, unbraced, double-curvature, transversely loaded
   and short columns, with the imperfection applied in one direction at a
   time (5.8.9(2)).

Writes fixtures/design/ec2-uk-na/column.reconciliation.json; exits 1 on any
disagreement or an unexpectedly matching discrepancy.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PUBLISHED = os.path.join(ROOT, "fixtures/design/ec2-uk-na/jrc-column-b2.published.json")
OUT = os.path.join(ROOT, "fixtures/design/ec2-uk-na/column.reconciliation.json")

ES = 200e9
UK = {"gammaC": 1.5, "gammaS": 1.15, "alphaCC": 0.85, "theta0": 1 / 200, "kMin": 0.1, "nBal": 0.4, "c": 10.0}


def l0_braced(l, k1, k2):
    return 0.5 * l * math.sqrt((1 + k1 / (0.45 + k1)) * (1 + k2 / (0.45 + k2)))


def l0_unbraced(l, k1, k2):
    return l * max(math.sqrt(1 + 10 * k1 * k2 / (k1 + k2)), (1 + k1 / (1 + k1)) * (1 + k2 / (1 + k2)))


def lam_lim(a, b, c, n):
    return 20 * a * b * c / math.sqrt(n)


def bars(case):
    """Bars evenly spaced on each face, centres inset by cover + link + φ/2."""
    inset = case["cover"] + case["link"] + case["phi"] / 2
    a, c = case["b"] / 2 - inset, case["h"] / 2 - inset
    nw, nd = case["nw"], case["nd"]
    area = math.pi * case["phi"] ** 2 / 4
    at = lambda k, n, half: -half + 2 * half * k / (n - 1)
    out = [(at(k, nw, a), z, area) for z in (-c, c) for k in range(nw)]
    out += [(y, at(k, nd, c), area) for y in (-a, a) for k in range(1, nd - 1)]
    return out


def axis(case, which):
    """Design moments about one axis, with and without imperfection."""
    fcd = UK["alphaCC"] * case["fck"] / UK["gammaC"]
    fyd = case["fyk"] / UK["gammaS"]
    h = case["h"] if which == "y" else case["b"]
    ends = case["myEnds"] if which == "y" else case["mzEnds"]
    mmax = case["myMax"] if which == "y" else case["mzMax"]
    k1, k2 = [max(k, UK["kMin"]) for k in case["k" + which]]
    braced = case["braced"]
    bs = bars(case)
    as_tot = sum(a for _, _, a in bs)
    ac = case["b"] * case["h"]
    n_ed = case["NEd"]
    n = n_ed / (ac * fcd)
    omega = as_tot * fyd / (ac * fcd)
    l = case["length"]
    l0 = l0_braced(l, k1, k2) if braced else l0_unbraced(l, k1, k2)
    lam = l0 / (h / math.sqrt(12))
    m02, m01 = (ends[0], ends[1]) if abs(ends[0]) >= abs(ends[1]) else (ends[1], ends[0])
    rm = 1.0 if (not braced or case["transverse"]) else (m01 / m02 if m02 else 1.0)
    phi = case.get("creep")
    A = 0.7 if phi is None else 1 / (1 + 0.2 * phi)
    B = math.sqrt(1 + 2 * omega)
    C = 1.7 - rm
    lim = lam_lim(A, B, C, n) if n > 0 else math.inf
    slender = n_ed > 0 and lam >= lim
    alpha_h = min(max(2 / math.sqrt(l), 2 / 3), 1.0)
    ei = UK["theta0"] * alpha_h * l0 / 2 if n_ed > 0 else 0.0
    e0 = max(h / 30, 0.020) if n_ed > 0 else 0.0
    e2 = 0.0
    if slender:
        # Bending about y works across z; about z across y (bars are (y, z, A)).
        i_s = math.sqrt(sum(a * (z if which == "y" else y) ** 2 for y, z, a in bs) / as_tot)
        d = h / 2 + i_s
        nu = 1 + omega
        kr = min((nu - n) / (nu - UK["nBal"]), 1.0)
        beta = 0.35 + case["fck"] / 1e6 / 200 - lam / 150
        kphi = max(1 + beta * phi, 1.0)
        e2 = kr * kphi * (fyd / ES) / (0.45 * d) * l0 ** 2 / UK["c"]
    m2 = max(n_ed, 0) * e2

    def design(imp):
        shift = max(n_ed, 0) * ei if imp else 0.0
        m02a = abs(m02) + shift
        m01s = (m01 * math.copysign(1, m02) if m02 else 0.0) + shift
        minimum = max(n_ed, 0) * e0 if imp else 0.0
        if not braced:
            mid = m02a + m2
        elif case["transverse"]:
            mid = abs(mmax) + shift + m2
        else:
            mid = max(max(0.6 * m02a + 0.4 * m01s, 0.4 * m02a) + m2, abs(m01s) + 0.5 * m2)
        return max(mid, m02a, minimum)

    return {"l0": l0, "lambda": lam, "lambdaLim": None if math.isinf(lim) else lim, "slender": slender,
            "ei": ei, "e0": e0, "e2": e2, "rm": rm, "mEdWithImperfection": design(True),
            "mEdWithoutImperfection": design(False)}


BASE = {"b": 0.4, "h": 0.4, "fck": 30e6, "fyk": 500e6, "cover": 0.03, "link": 0.01, "phi": 0.025,
        "nw": 3, "nd": 3, "length": 4.0, "braced": True, "ky": [0.5, 0.5], "kz": [0.5, 0.5],
        "creep": 1.5, "transverse": False, "NEd": 2.0e6, "myEnds": [60e3, 40e3], "mzEnds": [20e3, -10e3],
        "myMax": 60e3, "mzMax": 20e3}

CASES = [
    dict(BASE, id="BRACED-SINGLE-CURVATURE"),
    dict(BASE, id="BRACED-SINGLE-CURVATURE-SLENDER", length=8.0),
    dict(BASE, id="BRACED-DOUBLE-CURVATURE-SLENDER", length=10.0, myEnds=[100e3, -60e3], myMax=100e3),
    dict(BASE, id="UNBRACED-SLENDER", braced=False, ky=[1.0, 0.3], kz=[1.0, 0.3], NEd=1.2e6),
    dict(BASE, id="TRANSVERSE-LOAD", transverse=True, length=6.0, myEnds=[30e3, 30e3], myMax=55e3),
    dict(BASE, id="SHORT-MINIMUM-ECCENTRICITY", length=2.5, myEnds=[5e3, 2e3], mzEnds=[3e3, 1e3],
         myMax=5e3, mzMax=3e3, NEd=3.0e6),
    dict(BASE, id="RECTANGULAR-300x600", b=0.3, h=0.6, nw=2, nd=4, length=6.5, ky=[0.4, 1.0], kz=[0.2, 0.2],
         myEnds=[150e3, 80e3], mzEnds=[10e3, 5e3], myMax=150e3, mzMax=10e3, NEd=1.6e6),
]


def close(got, want, tol):
    return abs(got - want) <= tol


def main():
    pub = json.load(open(PUBLISHED))
    i = pub["inputs"]
    p = pub["published"]
    failures = []
    fcd = i["alphaCC"] * i["fck"] / i["gammaC"]
    fyd = i["fyk"] / i["gammaS"]
    l0 = l0_braced(i["height"], i["k1"], i["k2"])
    n = i["NEd"] / (i["b"] * i["h"] * fcd)
    lim = lam_lim(i["defaults"]["A"], i["defaults"]["B"], i["defaults"]["C"], n)
    omega = i["rhoAssumed"] * fyd / fcd
    kr = min((1 + omega - n) / (1 + omega - 0.4), 1.0)
    mtot = i["NEd"] * (p["MtotFromStatedEccentricities"]["e0"] + p["MtotFromStatedEccentricities"]["ei"]
                       + p["MtotFromStatedEccentricities"]["e2"]) / 1e3
    as_min = max(0.10 * i["NEd"] / fyd, 0.002 * i["b"] * i["h"]) * 1e6
    as_max = 0.04 * i["b"] * i["h"] * 1e6
    jrc = {"l0": l0, "n": n, "lambdaLim": lim, "Kr": kr, "MtotFromStatedEccentricities": mtot,
           "AsMin": as_min, "AsMax": as_max}
    for key, got in jrc.items():
        want = p[key]
        if not close(got, want["value"], want["rounding"]):
            failures.append(f"JRC {key}: {got} vs {want['value']}")
    # Discrepancies must disagree with the code text.
    lam = l0 / (i["h"] / math.sqrt(12))
    ei = UK["theta0"] * 1.0 * l0 / 2
    kphi = 1.14
    e2 = 0.62 * kphi * (fyd / ES) / (0.45 * i["d"]) * l0 ** 2 / math.pi ** 2
    e0 = max(i["h"] / 30, 0.020)
    code = {"JRC-B2-LAMBDA": lam, "JRC-B2-EI": ei, "JRC-B2-E2": e2, "JRC-B2-E0": e0}
    discrepancies = []
    for d in pub["discrepancies"]:
        got = code[d["id"]]
        agrees = abs(got - d["published"]) <= 0.02 * abs(d["published"])
        if agrees:
            failures.append(f"{d['id']} unexpectedly agrees: {got}")
        discrepancies.append({"id": d["id"], "published": d["published"], "codeValue": got})
    cases = []
    for case in CASES:
        cases.append({"input": case, "y": axis(case, "y"), "z": axis(case, "z")})
    out = {
        "fixtureVersion": 1,
        "published": os.path.relpath(PUBLISHED, ROOT),
        "publishedSha256": hashlib.sha256(open(PUBLISHED, "rb").read()).hexdigest(),
        "oracle": os.path.relpath(__file__, ROOT),
        "oracleSha256": hashlib.sha256(open(__file__, "rb").read()).hexdigest(),
        "python": sys.version.split()[0],
        "ndp": UK,
        "jrc": jrc,
        "discrepancies": discrepancies,
        "cases": cases,
        "failures": failures,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    for f_ in failures:
        print("FAIL", f_)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
