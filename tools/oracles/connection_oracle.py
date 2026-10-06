#!/usr/bin/env python3
"""Independent single-plate shear connection oracle (M13, ADR 0030).

Pure Python, standard library only; never imports the Rust kernel. It
recomputes every limit state of the workbench's single-plate connection from
the held ANSI/AISC 360-22 text (F11, J2, J3, J4) and the Manual equations the
held Design Examples v16 reproduce, for a set of cases:

- the instantaneous centre by a different method from the kernel's Newton
  iteration: a coarse grid scan of trial centres followed by Nelder-Mead on
  the squared equilibrium residual, then C from the moment equation;
- every other limit state written out independently.

Writes fixtures/design/aisc-360-22-lrfd/connection-oracle.json; exits 1 if
any centre fails to reach equilibrium.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "fixtures/design/aisc-360-22-lrfd/connection-oracle.json")

IN = 0.0254
KSI = 6.894757293168361e6
KIP = 4448.2216152605

# Table J3.2 Fnv (ksi / MPa), Table J3.3 hole, Table J3.4 edge.
US = {"3/4": (0.75, 13 / 16, 1.0), "7/8": (0.875, 15 / 16, 1.125), "1": (1.0, 1.125, 1.25)}
METRIC = {"M20": (20, 22, 26), "M24": (24, 27, 30)}
FNV = {("group120", False): (54, 370), ("group120", True): (68, 470),
       ("group150", False): (68, 470), ("group150", True): (84, 580)}


def bolt_props(c):
    if c["bolt"] in US:
        d, h, edge = (x * IN for x in US[c["bolt"]])
        fnv = FNV[(c["group"], c["threadsExcluded"])][0] * KSI
        net = h + IN / 16
        metric = False
    else:
        d, h, edge = (x * 1e-3 for x in METRIC[c["bolt"]])
        fnv = FNV[(c["group"], c["threadsExcluded"])][1] * 1e6
        net = h + 2e-3
        metric = True
    return d, h, edge, fnv, net, metric


# --- Instantaneous centre: grid scan + Nelder-Mead ---------------------------

def bolt_force(delta_m):
    delta_in = delta_m / IN
    return (1 - math.exp(-10 * delta_in)) ** 0.55


def equilibrium(bolts, point, u, ic):
    radii = [math.hypot(x - ic[0], y - ic[1]) for x, y in bolts]
    rmax = max(radii)
    fx = fy = mom = 0.0
    for (x, y), r in zip(bolts, radii):
        f = bolt_force(0.34 * IN * r / rmax)
        fx += f * -(y - ic[1]) / r
        fy += f * (x - ic[0]) / r
        mom += f * r
    cross = (point[0] - ic[0]) * u[1] - (point[1] - ic[1]) * u[0]
    if abs(cross) < 1e-12:
        return None
    sense = 1 if cross > 0 else -1
    p = mom / abs(cross)
    res = ((sense * fx - p * u[0]) / p, (sense * fy - p * u[1]) / p)
    return res, p


def nelder_mead(fun, x0, step, iters=4000):
    pts = [list(x0), [x0[0] + step, x0[1]], [x0[0], x0[1] + step]]
    vals = [fun(p) for p in pts]
    for _ in range(iters):
        order = sorted(range(3), key=lambda i: vals[i])
        pts = [pts[i] for i in order]
        vals = [vals[i] for i in order]
        if vals[0] < 1e-30 or abs(pts[0][0] - pts[2][0]) + abs(pts[0][1] - pts[2][1]) < 1e-15:
            break
        cx = (pts[0][0] + pts[1][0]) / 2
        cy = (pts[0][1] + pts[1][1]) / 2
        xr = [cx + (cx - pts[2][0]), cy + (cy - pts[2][1])]
        fr = fun(xr)
        if fr < vals[0]:
            xe = [cx + 2 * (cx - pts[2][0]), cy + 2 * (cy - pts[2][1])]
            fe = fun(xe)
            pts[2], vals[2] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[1]:
            pts[2], vals[2] = xr, fr
        else:
            xc = [cx + 0.5 * (pts[2][0] - cx), cy + 0.5 * (pts[2][1] - cy)]
            fc = fun(xc)
            if fc < vals[2]:
                pts[2], vals[2] = xc, fc
            else:
                for i in (1, 2):
                    pts[i] = [pts[0][0] + 0.5 * (pts[i][0] - pts[0][0]), pts[0][1] + 0.5 * (pts[i][1] - pts[0][1])]
                    vals[i] = fun(pts[i])
    best = min(range(3), key=lambda i: vals[i])
    return pts[best], vals[best]


def icr(bolts, point, u):
    e = point[0] * u[1] - point[1] * u[0]
    if abs(e) < 1e-12:
        return len(bolts) * bolt_force(0.34 * IN), 0.0

    span = max(math.hypot(x, y) for x, y in bolts)

    def fun(ic):
        # Far centres approach the translation limit, an asymptote whose
        # residual tends to zero: keep the search within 1000 spans.
        if math.hypot(ic[0], ic[1]) > 1e3 * span:
            return 1e9
        if min(math.hypot(x - ic[0], y - ic[1]) for x, y in bolts) < 1e-12:
            return 1e9
        r = equilibrium(bolts, point, u, ic)
        return 1e9 if r is None else r[0][0] ** 2 + r[0][1] ** 2

    # Starts on the line through the centroid perpendicular to the load,
    # nearest first, out to 10 spans either side. Ranking starts by residual
    # would favour the far field, whose residual decays toward the
    # translation asymptote.
    perp = (u[1], -u[0])
    starts = []
    for k in range(1, 41):
        for sign in (1, -1):
            t = sign * k / 4 * span
            starts.append((t * perp[0], t * perp[1]))
    best = None
    for start in starts:
        # Restarted Nelder-Mead: a fresh simplex each round, shrinking slowly.
        ic, val, step = start, None, span / 4
        for _ in range(40):
            ic, val = nelder_mead(fun, ic, step)
            step = max(step / 2, 1e-9 * span)
            if val < 1e-28:
                break
        if best is None or val < best[1]:
            best = (ic, val)
        if val < 1e-24:
            break
    ic, val = best
    res, p = equilibrium(bolts, point, u, ic)
    return p, math.sqrt(val)


# --- Limit states --------------------------------------------------------------

def block(fu, fy, agv, anv, ant, ubs):
    return min(0.6 * fu * anv + ubs * fu * ant, 0.6 * fy * agv + ubs * fu * ant)


def case_results(c):
    d, h, edge, fnv, dn, metric = bolt_props(c)
    n, cols = c["rows"], c["columns"]
    s = c["pitch"]
    g = c["gauge"] if cols == 2 else 0.0
    tp, fyp, fup = c["tp"], c["plateFy"], c["plateFu"]
    lev, lehp, a = c["lev"], c["lehPlate"], c["a"]
    lehb = c["lehBeam"] - c["underrun"]
    beam, sup = c["beam"], c["support"]
    V, N = c["V"], c["N"]
    v = abs(V)
    tension = N > 1e-6 * max(v, abs(N), 1.0)
    nt = max(N, 0.0)
    R = math.hypot(v, nt)
    L = 2 * lev + (n - 1) * s
    out = {}

    def put(key, demand, resistance):
        out[key] = {"demand": demand, "resistance": resistance}

    # Bolts: shear, bearing and tearout per bolt.
    kb, kt = (2.4, 1.2) if c["deformationConsidered"] else (3.0, 1.5)
    shear = 0.75 * fnv * math.pi * d * d / 4
    total = 0.0
    for i in range(n):
        for j in range(cols):
            if V >= 0:
                pv = lev - h / 2 if i == n - 1 else s - h
                wv = math.inf if i == 0 else s - h
            else:
                pv = lev - h / 2 if i == 0 else s - h
                wv = math.inf if i == n - 1 else s - h
            ph = lehp - h / 2 if j == cols - 1 else g - h
            wh = lehb - h / 2 if j == 0 else g - h
            if tension:
                pv, wv = min(pv, ph), min(wv, wh)
            rs = [shear, 0.75 * kb * d * tp * fup, 0.75 * kt * pv * tp * fup, 0.75 * kb * d * beam["tw"] * beam["Fu"]]
            if math.isfinite(wv):
                rs.append(0.75 * kt * wv * beam["tw"] * beam["Fu"])
            total += min(rs)
    xbar = g / 2
    bolts = [(j * g - xbar, ((n - 1) / 2 - i) * s) for j in range(cols) for i in range(n)]
    e = a + xbar
    u = (nt / R, (-v if V >= 0 else v) / R) if R > 0 else (0.0, -1.0)
    C, resid = icr(bolts, (-e, 0.0), u)
    if resid > 1e-9:
        sys.exit(f"{c['id']}: instantaneous centre residual {resid}")
    put("connection.boltGroup", R, C / (n * cols) * total)
    out["C"] = C

    # Plate.
    anv = (L - n * dn) * tp
    put("connection.plate.shearYield", v, 1.0 * 0.6 * fyp * L * tp)
    put("connection.plate.shearRupture", v, 0.75 * 0.6 * fup * anv)
    ubs = 1.0 if cols == 1 else 0.5
    bv = 0.75 * block(fup, fyp, (L - lev) * tp, (L - lev - (n - 0.5) * dn) * tp, (g + lehp - (cols - 0.5) * dn) * tp, ubs)
    put("connection.plate.blockShear", v, bv)
    mu = v * a
    Z, S = tp * L * L / 4, tp * L * L / 6
    E = c["E"]
    mn = min(fyp * Z, 1.5 * fyp * S)
    lam = a * L / tp ** 2
    if lam > 0.08 * E / fyp:
        if lam <= 1.9 * E / fyp:
            mltb = min(1.84 * (1.52 - 0.274 * lam * fyp / E) * fyp * S, fyp * Z)
        else:
            mltb = min(1.9 * E * 1.84 / lam * S, fyp * Z)
        mn = min(mn, mltb)
    phimn = 0.9 * mn
    put("connection.plate.flexure", mu, phimn)
    znet = tp * L * L / 4
    for i in range(n):
        y = abs(((n - 1) / 2 - i) * s)
        znet -= tp * dn * y if y >= dn / 2 else tp * ((dn / 2 + y) ** 2 + (dn / 2 - y) ** 2) / 2
    phimr = 0.75 * fup * znet
    put("connection.plate.flexuralRupture", mu, phimr)
    ty, tr = 0.9 * fyp * L * tp, 0.75 * fup * anv
    vy, vr = 0.6 * fyp * L * tp, 0.75 * 0.6 * fup * anv

    def inter(pc, mc, vc):
        pr = nt / pc
        if pr < 0.2:
            return (nt / (2 * pc) + mu / mc) ** 2 + (v / vc) ** 2
        return (pr + 8 / 9 * mu / mc) ** 2 + (v / vc) ** 2

    put("connection.plate.interactionYield", inter(ty, phimn, vy), 1.0)
    cprime = 0.0
    rmax = max(math.hypot(x, y) for x, y in bolts)
    for x, y in bolts:
        r = math.hypot(x, y)
        cprime += bolt_force(0.34 * IN * r / rmax) * r
    tmax = 6 * (fnv / 0.9 * math.pi * d * d / 4 * cprime) / (fyp * L * L)
    put("connection.plate.ductility", tp, tmax)
    if tension:
        put("connection.plate.tensionYield", nt, ty)
        put("connection.plate.tensionRupture", nt, tr)
        hz = g + lehp
        lb = block(fup, fyp, hz * tp, (hz - (cols - 0.5) * dn) * tp, (L - lev - (n - 0.5) * dn) * tp, 1.0)
        ub = block(fup, fyp, 2 * hz * tp, 2 * (hz - (cols - 0.5) * dn) * tp, (L - 2 * lev - (n - 1) * dn) * tp, 1.0)
        put("connection.plate.blockShearInteraction", (v / bv) ** 2 + (nt / (0.75 * min(lb, ub))) ** 2, 1.0)
        put("connection.plate.interactionRupture", inter(tr, phimr, vr), 1.0)
    # Weld and support.
    w = c["weld"]
    put("connection.weld.strength", R, 0.75 * 0.6 * c["FEXX"] * 2 * w / math.sqrt(2) * L)
    put("connection.support.shearRupture", v, 0.75 * 0.6 * sup["Fu"] * 2 * L * sup["t"])
    put("connection.support.thickness", 3.09 * (w / (IN / 16)) / (sup["Fu"] / KSI) * IN, sup["t"])
    # Beam.
    put("connection.beam.shearYield", v, 0.6 * beam["Fy"] * beam["d"] * beam["tw"])
    if tension:
        put("connection.beam.tensionYield", nt, 0.9 * beam["Fy"] * beam["A"])
        U = (beam["d"] - 2 * beam["tf"]) * beam["tw"] / beam["A"]
        put("connection.beam.tensionRupture", nt, 0.75 * beam["Fu"] * (beam["A"] - n * dn * beam["tw"]) * U)
        hz = lehb + g
        put("connection.beam.blockShear", nt, 0.75 * block(beam["Fu"], beam["Fy"], 2 * hz * beam["tw"],
                                                            2 * (hz - (cols - 0.5) * dn) * beam["tw"],
                                                            (n - 1) * (s - dn) * beam["tw"], 1.0))
    return out


def us_case(id_, bolt, rows, cols, pitch, gauge, lev, lehp, a, lehb, underrun, tp, weld, dc, beam, sup, V, N, group="group120", x=False):
    return {
        "id": id_, "bolt": bolt, "group": group, "threadsExcluded": x, "rows": rows, "columns": cols,
        "pitch": pitch * IN, "gauge": gauge * IN, "lev": lev * IN, "lehPlate": lehp * IN, "a": a * IN,
        "lehBeam": lehb * IN, "underrun": underrun * IN, "topOffset": 3 * IN, "tp": tp * IN,
        "plateFy": 50 * KSI, "plateFu": 65 * KSI, "E": 29000 * KSI, "weld": weld * IN, "FEXX": 70 * KSI,
        "deformationConsidered": dc, "beam": beam, "support": sup, "V": V * KIP, "N": N * KIP,
    }


def w(d, tw, tf, A, kdes):
    return {"d": d * IN, "tw": tw * IN, "tf": tf * IN, "A": A * IN * IN, "kdes": kdes * IN, "Fy": 50 * KSI, "Fu": 65 * KSI}


def flange(t, kind="columnFlange", bf=0.0, tw=0.0):
    return {"kind": kind, "t": t * IN, "Fu": 65 * KSI, "bf": bf * IN, "tw": tw * IN}


CASES = [
    us_case("ii-a-17a", "3/4", 4, 1, 3, 0, 1.25, 1.5, 3, 1.5, 0, 0.25, 0.1875, True, w(16.3, 0.38, 0.63, 14.7, 1.03), flange(0.71), 49.6, 0),
    us_case("ii-a-17b", "7/8", 5, 1, 3, 0, 1.25, 2.5, 2.5, 1.75, 0.25, 0.5, 0.3125, False, w(18.0, 0.355, 0.57, 14.7, 0.972), flange(0.71), 75, 60),
    us_case("ii-a-19a", "3/4", 4, 2, 3, 3, 1.5, 1.25, 9, 1.5, 0, 0.5, 0.3125, True, w(15.9, 0.295, 0.43, 10.6, 0.832), flange(0.44, "columnWeb", 14.5, 0.44), 36, 0),
    us_case("uplift-tension", "3/4", 4, 1, 3, 0, 1.25, 1.5, 3, 1.5, 0.25, 0.375, 0.25, True, w(16.3, 0.38, 0.63, 14.7, 1.03), flange(0.71), -30, 25),
    us_case("two-lines-tension", "7/8", 6, 2, 3, 3, 1.5, 1.5, 6, 1.75, 0.25, 0.5, 0.3125, False, w(21.0, 0.4, 0.615, 18.3, 1.12), flange(0.4, "girderWeb"), 80, 30, "group150", True),
    {
        "id": "metric-m20", "bolt": "M20", "group": "group150", "threadsExcluded": True, "rows": 3, "columns": 1,
        "pitch": 0.070, "gauge": 0.0, "lev": 0.040, "lehPlate": 0.040, "a": 0.060, "lehBeam": 0.040, "underrun": 0.0,
        "topOffset": 0.040, "tp": 0.010, "plateFy": 355e6, "plateFu": 470e6, "E": 200e9, "weld": 0.008, "FEXX": 480e6,
        "deformationConsidered": False, "beam": {"d": 0.3099, "tw": 0.005842, "tf": 0.009652, "A": 0.004935, "kdes": 0.017272, "Fy": 345e6, "Fu": 450e6},
        "support": {"kind": "girderWeb", "t": 0.01016, "Fu": 450e6, "bf": 0.0, "tw": 0.0}, "V": 80e3, "N": 0.0,
    },
]


def main():
    cases = []
    for c in CASES:
        r = case_results(c)
        cases.append({"inputs": c, "C": r.pop("C"), "checks": r})
    out = {
        "oracle": "tools/oracles/connection_oracle.py",
        "oracleSha256": hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest(),
        "method": "Grid scan + Nelder-Mead instantaneous centre; limit states written out independently from AISC 360-22 F11, J2, J3, J4 and the Manual equations reproduced in Design Examples II.A-17B and II.A-19A",
        "tolerance": 1e-8,
        "cases": cases,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"wrote {OUT}: {len(cases)} cases")


if __name__ == "__main__":
    main()
