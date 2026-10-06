#!/usr/bin/env python3
"""Independent composite beam oracle (M17, ADR 0031).

Pure Python, standard library only; never imports the Rust kernel. For a set
of composite beams it recomputes, by methods different from the kernel's:

- the plastic moment for a slab force C: the steel W (three rectangles) is
  split at a plastic neutral axis found by bisection on the force balance
  F_y(A_above) − F_y(A_below) + C = 0, and the moment is integrated about the
  slab top (the kernel uses the closed form of Commentary C-I3-10);
- the concrete block depth and centroid by direct integration over the slab
  layers;
- the fully composite transformed I_tr by bisection on the elastic neutral
  axis and direct integration (concrete in tension neglected);
- the lower-bound I_LB by the parallel-axis theorem on the two-area model of
  Commentary C-I3-1 (the slab force at d1, the steel at d/2);
- stud strengths by I8-1 with R_g and R_p from the I8.2a table;
- midspan deflections of uniform and third-point loads by closed forms.

Writes fixtures/design/aisc-360-22-lrfd/composite-oracle.json.
"""
import hashlib
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "fixtures/design/aisc-360-22-lrfd/composite-oracle.json")
IN = 0.0254
KSI = 6.894757293168361e6
KIP = 4448.2216152605
PCF = 16.01846337396014
FT = 0.3048


def shape(name):
    data = json.load(open(os.path.join(ROOT, "crates/design/data/aisc-v16-subset.json")))
    s = next(x for x in data["shapes"] if x["designation"] == name)
    return {"A": s["A"] * IN * IN, "d": s["d"] * IN, "tw": s["tw"] * IN, "bf": s["bf"] * IN, "tf": s["tf"] * IN, "Ix": s["Ix"] * IN ** 4}


def layers(c, beff):
    t, hr = c["t"], c["hr"]
    if c["deck"] == "solid":
        return [(0.0, t, beff)]
    if c["deck"] == "perpendicular":
        return [(0.0, t - hr, beff)]
    return [(0.0, t - hr, beff), (t - hr, hr, beff * min(c["wr"] / c["pitch"], 1.0))]


def block(ls, fc, C):
    """Depth and centroid of the 0.85 f'c block carrying C, by integration."""
    if C <= 0:
        return 0.0, 0.0
    lo, hi = 0.0, sum(l[1] for l in ls) + ls[0][0]
    def force(y):
        return sum(0.85 * fc * w * max(0.0, min(y - top, h)) for top, h, w in ls)
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if force(mid) < C else (lo, mid)
    a = (lo + hi) / 2
    m = sum(0.85 * fc * w * max(0.0, min(a - top, h)) * (top + max(0.0, min(a - top, h)) / 2) for top, h, w in ls)
    return a, m / C


def steel_rects(s):
    """(top, height, width) of the W as flange, web, flange, below its top."""
    return [(0.0, s["tf"], s["bf"]), (s["tf"], s["d"] - 2 * s["tf"], s["tw"]), (s["d"] - s["tf"], s["tf"], s["bf"])]


def plastic(c, s, beff, C):
    """M_n about the slab top for slab force C: steel PNA by bisection.

    The W is three rectangles (flange, web of t_w, flange); the rest of its
    area (the fillets) acts at mid-depth. With C ≥ 0 the steel compression is
    at most half the section, so the PNA lies above mid-depth and the fillet
    area is always in tension (the Commentary C-I3-10 idealisation).
    """
    fy = c["Fy"]
    rects = steel_rects(s)
    fillet = s["A"] - sum(h * w for _, h, w in rects)
    def above(y):
        return sum(w * max(0.0, min(y - top, h)) for top, h, w in rects)
    target = max(0.0, (s["A"] * fy - C) / (2 * fy))
    lo, hi = 0.0, s["d"] / 2
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if above(mid) < target else (lo, mid)
    ypna = (lo + hi) / 2 if target > 0 else 0.0
    t = c["t"]
    _, centroid = block(layers(c, beff), c["fc"], C)
    # Moment of the resultants about the slab top, compression positive.
    m = C * centroid
    for top, h, w in rects:
        hc = max(0.0, min(ypna - top, h))
        m += fy * w * hc * (t + top + hc / 2)
        ht = h - hc
        m -= fy * w * ht * (t + top + hc + ht / 2)
    m -= fy * fillet * (t + s["d"] / 2)
    return -m, ypna


def transformed(c, s, beff, n):
    ls = layers(c, beff)
    zs = c["t"] + s["d"] / 2
    def moment(y):
        m = sum(w / n * max(0.0, min(y - top, h)) * (y - top - max(0.0, min(y - top, h)) / 2) for top, h, w in ls)
        return m - s["A"] * (zs - y)
    lo, hi = 0.0, c["t"] + s["d"]
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if moment(mid) > 0 else (mid, hi)
    y = (lo + hi) / 2
    i = s["Ix"] + s["A"] * (zs - y) ** 2
    for top, h, w in ls:
        hh = max(0.0, min(y - top, h))
        i += (w / n) * hh ** 3 / 12 + (w / n) * hh * (y - top - hh / 2) ** 2
    return i, y


def lower_bound(c, s, beff, q):
    _, centroid = block(layers(c, beff), c["fc"], q)
    d1 = c["t"] - centroid
    aq = q / c["Fy"]
    # Two areas: A_s at d/2 below the steel top, ΣQn/F_y at d1 above it.
    zs, zq = s["d"] / 2, -d1
    ybar = (s["A"] * zs + aq * zq) / (s["A"] + aq)
    return s["Ix"] + s["A"] * (zs - ybar) ** 2 + aq * (zq - ybar) ** 2


def ec(c):
    """E_c = w_c^1.5 √f'c (I8.2a, US form; w_c in lb/ft³, f'c in ksi)."""
    return c["wc"] ** 1.5 * math.sqrt(c["fc"] / KSI) * KSI


def stud(c):
    asa = math.pi * c["dsa"] ** 2 / 4
    conc = 0.5 * asa * math.sqrt(c["fc"] * ec(c))
    if c["deck"] == "solid":
        rg, rp = 1.0, 0.75
    elif c["deck"] == "parallel":
        rg, rp = (1.0 if c["wr"] / c["hr"] >= 1.5 else 0.85), 0.75
    else:
        rg = {1: 1.0, 2: 0.85}.get(c["perRow"], 0.7)
        rp = 0.75 if c.get("emid", 0) >= 2 * IN else 0.6
    return min(conc, rg * rp * asa * c["studFu"])


def case(name, beam, span_ft, spacing_ft, t, deck, hr, wr, pitch, fc_ksi, wc, per_row, slab_forces):
    s = shape(beam)
    c = {"name": name, "beam": beam, "span": span_ft * FT, "spacing": spacing_ft * FT, "t": t * IN, "deck": deck,
         "hr": hr * IN, "wr": wr * IN, "pitch": pitch * IN, "fc": fc_ksi * KSI, "wc": wc, "Fy": 50 * KSI,
         "dsa": 0.75 * IN, "studFu": 65 * KSI, "perRow": per_row}
    beff = 2 * min(c["span"] / 8, c["spacing"] / 2)
    ls = layers(c, beff)
    ac = sum(h * w for _, h, w in ls)
    cf = min(0.85 * c["fc"] * ac, s["A"] * c["Fy"])
    n = 29000 * KSI / ec(c)
    itr, ena = transformed(c, s, beff, n)
    out = {"inputs": c, "beff": beff, "Ac": ac, "Cf": cf, "Ec": ec(c), "Qn": stud(c), "Itr": itr, "ena": ena, "forces": []}
    for frac in slab_forces:
        C = frac * cf
        mn, ypna = plastic(c, s, beff, C)
        out["forces"].append({"C": C, "Mn": mn, "pnaDepth": ypna, "ILB": lower_bound(c, s, beff, C)})
    E, L = 29000 * KSI, c["span"]
    w, P = 10e3, 50e3
    out["deflections"] = {"E": E, "w": w, "P": P,
                          "uniformOverEI": 5 * w * L ** 4 / 384, "thirdPointsOverEI": 23 * P * L ** 3 / 648}
    return out


CASES = [
    case("I.1 W21X50 deck perpendicular", "W21X50", 45, 10, 7.5, "perpendicular", 3, 6, 12, 4, 145, 1, [0.25, 0.525, 1.0]),
    case("I.2 W24X76 deck parallel", "W24X76", 30, 45, 7.5, "parallel", 3, 6, 12, 4, 145, 1, [0.3, 0.5, 0.8, 1.0]),
    case("solid slab W18X50", "W18X50", 28, 8, 5.5, "solid", 0, 0, 1, 5, 145, 1, [0.4, 1.0]),
    case("two per rib W21X62", "W21X62", 36, 12, 6.25, "perpendicular", 2, 6, 12, 3.5, 110, 2, [0.6, 1.0]),
    case("narrow parallel W16X36", "W16X36", 24, 6, 5.0, "parallel", 2, 2.5, 6, 4, 145, 1, [0.5, 1.0]),
]


def main():
    out = {
        "oracle": "tools/oracles/composite_oracle.py",
        "oracleSha256": hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest(),
        "method": "Fibre force balance PNA and direct integration of the plastic moment; bisected transformed ENA; two-area I_LB; I8-1 studs; closed-form deflections",
        "tolerance": 1e-8,
        "cases": CASES,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"wrote {OUT}: {len(CASES)} cases")


if __name__ == "__main__":
    main()
