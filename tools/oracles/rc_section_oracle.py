"""Independent oracle for rectangular RC section mechanics (docs/formulations/rc-section.md).

Pure Python, no numerical libraries, no import of the Rust kernel. The concrete
stress field is integrated over depth by graded composite Gauss-Legendre
quadrature (not the kernel's closed-form strain-space integrals); equilibrium
uses the Illinois method; the cracked neutral axis is solved as a quadratic per
bar interval. Writes fixtures/design/rc-section-mechanics/cases.json.
"""
import hashlib, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "fixtures", "design", "rc-section-mechanics", "cases.json")


def gauss_legendre(n):
    nodes, weights = [], []
    for i in range(1, n + 1):
        x = math.cos(math.pi * (i - 0.25) / (n + 0.5))
        for _ in range(100):
            p0, p1 = 1.0, x
            for k in range(2, n + 1):
                p0, p1 = p1, ((2 * k - 1) * x * p1 - (k - 1) * p0) / k
            dp = n * (x * p1 - p0) / (x * x - 1)
            dx = p1 / dp
            x -= dx
            if abs(dx) < 1e-16:
                break
        nodes.append(x)
        weights.append(2 / ((1 - x * x) * dp * dp))
    return nodes, weights


GL = gauss_legendre(8)


def integrate(f, a, b, panels):
    total = 0.0
    edges = [a + (b - a) * k / panels for k in range(panels + 1)]
    for lo, hi in zip(edges, edges[1:]):
        half, mid = (hi - lo) / 2, (hi + lo) / 2
        total += half * sum(w * f(mid + half * t) for t, w in zip(*GL))
    return total


def integrate_graded(f, a, b, toward_a):
    """Geometric panels refined towards a (toward_a) or b."""
    if b <= a:
        return 0.0
    cuts, length, ratio = [], b - a, 0.2
    s = length
    for _ in range(60):
        s *= ratio
        cuts.append(s)
    pts = sorted(set([0.0, length] + cuts))
    total = 0.0
    for lo, hi in zip(pts, pts[1:]):
        if toward_a:
            total += integrate(f, a + lo, a + hi, 4)
        else:
            total += integrate(f, b - hi, b - lo, 4)
    return total


def concrete_stress(law, eps):
    if eps <= 0:
        return 0.0
    if law["kind"] == "rectangularBlock":
        raise ValueError("block stress is positional, not strain based")
    f, e2, ecu, n = law["peak"], law["strainAtPeak"], law["ultimateStrain"], law["exponent"]
    if eps >= e2:
        return f
    return f * (1 - (1 - eps / e2) ** n)


def concrete_resultant(sec, law, x):
    """(C, moment about compression face) by integration over depth y in [0, x]."""
    b = sec["width"]
    if law["kind"] == "rectangularBlock":
        a = law["depthRatio"] * x
        C = integrate(lambda y: law["intensity"] * b, 0.0, a, 50)
        M = integrate(lambda y: law["intensity"] * b * y, 0.0, a, 50)
        return C, M
    ecu, e2 = law["ultimateStrain"], law["strainAtPeak"]
    eps = lambda y: ecu * (1 - y / x)
    ystar = x * (1 - e2 / ecu)  # plateau for y < ystar, parabola for y > ystar
    sig = lambda y: concrete_stress(law, eps(y))
    C = integrate(lambda y: sig(y) * b, 0.0, ystar, 200) if ystar > 0 else 0.0
    M = integrate(lambda y: sig(y) * b * y, 0.0, ystar, 200) if ystar > 0 else 0.0
    C += integrate_graded(lambda y: sig(y) * b, ystar, x, True)
    M += integrate_graded(lambda y: sig(y) * b * y, ystar, x, True)
    return C, M


def bar_displaced_stress(law, x, eps_i, d):
    if eps_i <= 0:
        return 0.0
    if law["kind"] == "rectangularBlock":
        return law["intensity"] if d < law["depthRatio"] * x else 0.0
    return concrete_stress(law, eps_i)


def ultimate_parts(case, x):
    sec, law, steel = case["section"], case["concrete"], case["steel"]
    ecu = law["ultimateStrain"]
    C, Mc = concrete_resultant(sec, law, x)
    layers = []
    for L in case["layers"]:
        e = ecu * (1 - L["depth"] / x)
        s = max(-steel["yieldStrength"], min(steel["yieldStrength"], steel["modulus"] * e))
        net = L["area"] * (s - bar_displaced_stress(law, x, e, L["depth"]))
        layers.append({"strain": e, "steelStress": s, "force": net})
    return C, Mc, layers


def illinois(f, a, b):
    fa, fb, side = f(a), f(b), 0
    assert fa < 0 < fb, (fa, fb)
    for _ in range(500):
        c = (a * fb - b * fa) / (fb - fa)
        fc = f(c)
        if fc == 0 or abs(b - a) < 1e-17:
            return c
        if fc < 0:
            a, fa = c, fc
            if side == -1:
                fb /= 2
            side = -1
        else:
            b, fb = c, fc
            if side == 1:
                fa /= 2
            side = 1
    return (a + b) / 2


def ultimate(case):
    h = case["section"]["depth"]
    F = lambda x: (lambda p: p[0] + sum(l["force"] for l in p[2]))(ultimate_parts(case, x))
    x = illinois(F, h * 1e-9, h)
    C, Mc, layers = ultimate_parts(case, x)
    Mu = -sum(l["force"] * L["depth"] for l, L in zip(layers, case["layers"])) - Mc
    ey = case["steel"]["yieldStrength"] / case["steel"]["modulus"]
    # Extreme (deepest) tension layer decides the classification.
    dmax = max(L["depth"] for L in case["layers"])
    extreme = next(l for l, L in zip(layers, case["layers"]) if L["depth"] == dmax)
    cls = "tensionYielded" if -extreme["strain"] >= ey else "tensionElastic"
    return {"neutralAxisDepth": x, "moment": Mu, "concreteForce": C, "curvature": case["concrete"]["ultimateStrain"] / x,
            "classification": cls, "depthRatio": x / dmax,
            "layers": [{"strain": l["strain"], "steelStress": l["steelStress"], "force": l["force"],
                        "yielded": abs(l["strain"]) >= ey} for l in layers]}


def elastic(case):
    b, h = case["section"]["width"], case["section"]["depth"]
    m = case["steel"]["modulus"] / case["elastic"]["concreteModulus"]
    Ls = case["layers"]
    At = b * h + (m - 1) * sum(L["area"] for L in Ls)
    ybar = (b * h * h / 2 + (m - 1) * sum(L["area"] * L["depth"] for L in Ls)) / At
    Iu = b * h ** 3 / 12 + b * h * (h / 2 - ybar) ** 2 + (m - 1) * sum(L["area"] * (L["depth"] - ybar) ** 2 for L in Ls)
    out = {"modularRatio": m, "uncrackedArea": At, "uncrackedCentroid": ybar, "uncrackedInertia": Iu}
    fct = case["elastic"].get("tensileStrength")
    if fct is not None:
        out["crackingMoment"] = fct * Iu / (h - ybar)
    # Cracked: quadratic b/2 x^2 + (sum k A) x - sum k A d = 0 on each interval between depths.
    depths = sorted(set([0.0, h] + [L["depth"] for L in Ls]))
    x = None
    for lo, hi in zip(depths, depths[1:]):
        k = [(m - 1) if L["depth"] < (lo + hi) / 2 else m for L in Ls]
        p = sum(ki * L["area"] for ki, L in zip(k, Ls))
        q = sum(ki * L["area"] * L["depth"] for ki, L in zip(k, Ls))
        r = (-p + math.sqrt(p * p + 2 * b * q)) / b
        if lo <= r <= hi:
            x = r
            break
    assert x is not None
    k = [(m - 1) if L["depth"] < x else m for L in Ls]
    Icr = b * x ** 3 / 3 + sum(ki * L["area"] * (x - L["depth"]) ** 2 for ki, L in zip(k, Ls))
    out.update({"crackedNeutralAxis": x, "crackedInertia": Icr})
    M = case["elastic"].get("serviceMoment")
    if M is not None:
        out["serviceConcreteStress"] = M * x / Icr
        out["serviceSteelStress"] = [m * M * (x - L["depth"]) / Icr for L in Ls]
    return out


def row(r):
    clear_width = r["width"] - 2 * (r["sideCover"] + r["linkDiameter"]) - r["count"] * r["barDiameter"]
    spacing = clear_width / (r["count"] - 1) if r["count"] >= 2 else None
    fits = clear_width >= 0 and (spacing is None or spacing >= r["minimumClearSpacing"])
    return {"area": r["count"] * math.pi * r["barDiameter"] ** 2 / 4, "clearSpacing": spacing,
            "depthFromFace": r["sideCover"] + r["linkDiameter"] + r["barDiameter"] / 2, "fits": fits}


def bar(n, phi):
    return n * math.pi * phi * phi / 4


SEC = {"width": 0.3, "depth": 0.6}
STEEL = {"yieldStrength": 460e6, "modulus": 200e9}
BLOCK = {"kind": "rectangularBlock", "intensity": 20e6, "depthRatio": 0.75, "ultimateStrain": 0.003}
PARA2 = {"kind": "parabolaRectangle", "peak": 22e6, "strainAtPeak": 0.0021, "ultimateStrain": 0.0034, "exponent": 2.0}
PARA_NONINT = {"kind": "parabolaRectangle", "peak": 38e6, "strainAtPeak": 0.0023, "ultimateStrain": 0.0029, "exponent": 1.6}
ELASTIC = {"concreteModulus": 30e9, "tensileStrength": 2.8e6, "serviceMoment": 150e3}


def balanced_area(d):
    ecu, ey = BLOCK["ultimateStrain"], STEEL["yieldStrength"] / STEEL["modulus"]
    xb = ecu * d / (ecu + ey)
    return BLOCK["intensity"] * SEC["width"] * BLOCK["depthRatio"] * xb / STEEL["yieldStrength"]


def cases():
    d = 0.55
    ab = balanced_area(d)
    return [
        {"id": "RC-SR-BLOCK-YIELD", "note": "Singly reinforced, rectangular block, tension yields; hand check x = A fy /(intensity b lambda)",
         "section": SEC, "steel": STEEL, "concrete": BLOCK, "layers": [{"depth": d, "area": bar(3, 0.02)}], "elastic": ELASTIC},
        {"id": "RC-SR-BLOCK-BAL-UNDER", "note": "0.1% below balanced area: tension yields",
         "section": SEC, "steel": STEEL, "concrete": BLOCK, "layers": [{"depth": d, "area": ab * 0.999}]},
        {"id": "RC-SR-BLOCK-BAL-OVER", "note": "0.1% above balanced area: tension elastic",
         "section": SEC, "steel": STEEL, "concrete": BLOCK, "layers": [{"depth": d, "area": ab * 1.001}]},
        {"id": "RC-SR-BLOCK-OVER", "note": "Heavily reinforced: tension steel elastic at ultimate",
         "section": SEC, "steel": STEEL, "concrete": BLOCK, "layers": [{"depth": d, "area": bar(8, 0.032)}], "elastic": ELASTIC},
        {"id": "RC-DR-BLOCK", "note": "Doubly reinforced, rectangular block; compression bars inside the block displace concrete",
         "section": SEC, "steel": STEEL, "concrete": BLOCK,
         "layers": [{"depth": 0.045, "area": bar(3, 0.02)}, {"depth": d, "area": bar(5, 0.025)}], "elastic": ELASTIC},
        {"id": "RC-PREVIEW-DEFAULT", "note": "Default rcBeam preview draft: 300x600, cover 35 to link, link 10, 4 x 20 bars each face; synthetic mechanics defaults",
         "section": SEC, "steel": STEEL, "concrete": BLOCK,
         "layers": [{"depth": 0.035 + 0.01 + 0.01, "area": bar(4, 0.02)}, {"depth": 0.6 - (0.035 + 0.01 + 0.01), "area": bar(4, 0.02)}],
         "elastic": {"concreteModulus": 30e9, "tensileStrength": 2.8e6}},
        {"id": "RC-PREVIEW-ASYM-SAGGING", "note": "Preview draft with top 2x16, bottom 4x25; top face in compression",
         "section": SEC, "steel": STEEL, "concrete": BLOCK,
         "layers": [{"depth": 0.035 + 0.01 + 0.008, "area": bar(2, 0.016)}, {"depth": 0.6 - (0.035 + 0.01 + 0.0125), "area": bar(4, 0.025)}],
         "elastic": {"concreteModulus": 30e9, "tensileStrength": 2.8e6}},
        {"id": "RC-PREVIEW-ASYM-HOGGING", "note": "Same draft; bottom face in compression, so the 2x16 top row is in tension",
         "section": SEC, "steel": STEEL, "concrete": BLOCK,
         "layers": [{"depth": 0.035 + 0.01 + 0.0125, "area": bar(4, 0.025)}, {"depth": 0.6 - (0.035 + 0.01 + 0.008), "area": bar(2, 0.016)}],
         "elastic": {"concreteModulus": 30e9, "tensileStrength": 2.8e6}},
        {"id": "RC-PREVIEW-B08-SAGGING-SERVICE", "note": "Default preview draft under the B08 fixed-fixed UDL midspan moment qL^2/24 = 15 kN m (ADR 0014); cracked service stresses",
         "section": SEC, "steel": STEEL, "concrete": BLOCK,
         "layers": [{"depth": 0.035 + 0.01 + 0.01, "area": bar(4, 0.02)}, {"depth": 0.6 - (0.035 + 0.01 + 0.01), "area": bar(4, 0.02)}],
         "elastic": {"concreteModulus": 30e9, "tensileStrength": 2.8e6, "serviceMoment": 15e3}},
        {"id": "RC-PREVIEW-B08-HOGGING-SERVICE", "note": "Default preview draft under the B08 fixed-fixed UDL end moment qL^2/12 = 30 kN m (ADR 0014); cracked service stresses",
         "section": SEC, "steel": STEEL, "concrete": BLOCK,
         "layers": [{"depth": 0.035 + 0.01 + 0.01, "area": bar(4, 0.02)}, {"depth": 0.6 - (0.035 + 0.01 + 0.01), "area": bar(4, 0.02)}],
         "elastic": {"concreteModulus": 30e9, "tensileStrength": 2.8e6, "serviceMoment": 30e3}},
        {"id": "RC-PREVIEW-EC2-UK-DEFAULT", "note": "Default preview draft with EC2 UK NA (2009) parameters (ADR 0016): block intensity eta alpha_cc fck/gamma_c = 0.85 x 30/1.5 MPa, lambda 0.8, eps_cu3 0.0035; fyd = 500/1.15 MPa",
         "section": SEC, "steel": {"yieldStrength": 500e6 / 1.15, "modulus": 200e9},
         "concrete": {"kind": "rectangularBlock", "intensity": 0.85 * 30e6 / 1.5, "depthRatio": 0.8, "ultimateStrain": 0.0035},
         "layers": [{"depth": 0.035 + 0.01 + 0.01, "area": bar(4, 0.02)}, {"depth": 0.6 - (0.035 + 0.01 + 0.01), "area": bar(4, 0.02)}]},
        {"id": "RC-DR-PARABOLA", "note": "Doubly reinforced, parabola-rectangle n=2, compression bars displace concrete",
         "section": SEC, "steel": STEEL, "concrete": PARA2,
         "layers": [{"depth": 0.05, "area": bar(2, 0.016)}, {"depth": d, "area": bar(4, 0.025)}], "elastic": ELASTIC},
        {"id": "RC-ML-PARABOLA-NONINT", "note": "Two tension rows, non-integer exponent, higher strength",
         "section": {"width": 0.25, "depth": 0.5}, "steel": {"yieldStrength": 500e6, "modulus": 200e9}, "concrete": PARA_NONINT,
         "layers": [{"depth": 0.04, "area": bar(2, 0.012)}, {"depth": 0.41, "area": bar(2, 0.02)}, {"depth": 0.45, "area": bar(3, 0.02)}],
         "elastic": {"concreteModulus": 33e9, "tensileStrength": 3.5e6, "serviceMoment": 90e3}},
    ]


ROWS = [
    {"id": "ROW-FITS", "width": 0.3, "sideCover": 0.035, "linkDiameter": 0.01, "barDiameter": 0.02, "count": 4, "minimumClearSpacing": 0.025},
    {"id": "ROW-SPACING-FAILS", "width": 0.3, "sideCover": 0.035, "linkDiameter": 0.01, "barDiameter": 0.025, "count": 5, "minimumClearSpacing": 0.025},
    {"id": "ROW-OVERFILLS", "width": 0.2, "sideCover": 0.04, "linkDiameter": 0.01, "barDiameter": 0.032, "count": 5, "minimumClearSpacing": 0.02},
    {"id": "ROW-SINGLE", "width": 0.2, "sideCover": 0.04, "linkDiameter": 0.01, "barDiameter": 0.02, "count": 1, "minimumClearSpacing": 0.02},
]


def main():
    out = []
    for c in cases():
        e = {"ultimate": ultimate(c)}
        if "elastic" in c:
            e["elastic"] = elastic(c)
        out.append({**c, "expected": e})
    rows = [{**r, "expected": row(r)} for r in ROWS]
    src = open(os.path.abspath(__file__), "rb").read()
    doc = {"fixtureVersion": 1, "formulation": "docs/formulations/rc-section.md",
           "oracle": "tools/oracles/rc_section_oracle.py", "oracleSha256": hashlib.sha256(src).hexdigest(),
           "python": sys.version.split()[0], "units": "SI (N, m, Pa); compression positive; depths from compression face",
           "tolerance": {"relative": 1e-9, "absoluteStrain": 1e-12},
           "codeProfile": None, "cases": out, "rows": rows}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
    print(OUT)


if __name__ == "__main__":
    main()
