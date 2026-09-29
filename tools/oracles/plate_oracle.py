#!/usr/bin/env python3
"""Independent plate oracle (M10-A, plate-v1).

Navier double series give the Kirchhoff and Mindlin (hard simple support)
solutions of uniformly loaded rectangular plates; Timoshenko & Woinowsky-
Krieger's published coefficients give the clamped square; OpenSees ShellMITC4
gives clamped, perforated, distorted and column-supported panels on meshes
identical to the kernel's.
Nothing here imports the Rust kernel. Run with tools/oracle-env/bin/python.

Sign convention (docs/formulations/plate.md): global Z up, pressure q > 0
acts downward (-Z), w is the Z displacement, and bending moments are positive
sagging (bottom face in tension); mxy is reported as a magnitude where the
sign depends on the corner.

Writes fixtures/plate/plate-oracle.json; exits 1 on any internal check.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "fixtures/plate/plate-oracle.json")
failures = []


def check(cond, text):
    if not cond:
        failures.append(text)


E = 30e9
NU = 0.2
KAPPA = 5.0 / 6.0
Q = 10e3
TERMS = 401


def rigidity(t, nu=NU):
    return E * t**3 / (12 * (1 - nu * nu))


def navier(a, b, t, x, y, nu=NU, mindlin=True):
    """Hard simply supported plate under uniform q (downward)."""
    d = rigidity(t, nu)
    g = E / (2 * (1 + nu))
    w = mx = my = 0.0
    for m in range(1, TERMS + 1, 2):
        am = m * math.pi / a
        sx = math.sin(am * x)
        for n in range(1, TERMS + 1, 2):
            bn = n * math.pi / b
            qmn = 16 * Q / (math.pi**2 * m * n)
            a2 = am * am + bn * bn
            wb = qmn / (d * a2 * a2)
            s = sx * math.sin(bn * y)
            w += (wb + (qmn / (KAPPA * g * t * a2) if mindlin else 0.0)) * s
            mx += d * wb * (am * am + nu * bn * bn) * s
            my += d * wb * (bn * bn + nu * am * am) * s
    return {"w": -w, "mx": mx, "my": my}


def navier_twist_corner(a, b, t, nu=NU):
    d = rigidity(t, nu)
    s = 0.0
    for m in range(1, TERMS + 1, 2):
        am = m * math.pi / a
        for n in range(1, TERMS + 1, 2):
            bn = n * math.pi / b
            qmn = 16 * Q / (math.pi**2 * m * n)
            a2 = am * am + bn * bn
            s += d * (1 - nu) * qmn / (d * a2 * a2) * am * bn
    return s


def ss_case(cid, a, b, t, meshes):
    points = []
    for n in meshes:
        hx, hy = a / n, b / n
        # Element centre next to the plate centre (lower-left of it).
        x, y = a / 2 - hx / 2, b / 2 - hy / 2
        v = navier(a, b, t, x, y)
        points.append({"mesh": n, "x": x, "y": y, **v})
    centre = navier(a, b, t, a / 2, b / 2)
    kirchhoff = navier(a, b, t, a / 2, b / 2, mindlin=False)
    return {
        "id": cid, "a": a, "b": b, "t": t, "E": E, "nu": NU, "q": Q, "kappa": KAPPA,
        "edges": "hardSimple", "centre": centre, "kirchhoffCentreW": kirchhoff["w"],
        "cornerTwist": navier_twist_corner(a, b, t), "elementCentres": points,
    }


ss_thin = ss_case("P-SS-THIN", 6.0, 6.0, 0.2, [8, 16, 32])
ss_thick = ss_case("P-SS-THICK", 6.0, 6.0, 1.0, [8, 16, 32])
ss_rect = ss_case("P-SS-RECT", 6.0, 4.0, 0.2, [8, 16, 32])
ss_limit = ss_case("P-SS-THINLIMIT", 6.0, 6.0, 0.02, [8, 16, 32])
# Kirchhoff limit: w/(q a^4/D) = 0.00406 for a square (Timoshenko Table 8).
d = rigidity(0.02)
check(abs(-ss_limit["kirchhoffCentreW"] * d / (Q * 6.0**4) - 0.00406) < 5e-6, "Kirchhoff square coefficient")
# Mindlin deflection exceeds Kirchhoff, more so when thick.
check(ss_thick["centre"]["w"] < ss_thick["kirchhoffCentreW"] < 0, "thick plate shear deflection")

# --- Clamped square: Timoshenko & Woinowsky-Krieger, Table 35 (nu = 0.3) ---
clamped_tim = {
    "id": "P-CL-TIM", "a": 6.0, "b": 6.0, "t": 0.1, "E": E, "nu": 0.3, "q": Q,
    "edges": "clamped",
    "source": "Timoshenko & Woinowsky-Krieger, Theory of Plates and Shells (1959), Table 35, nu = 0.3",
    "wCoefficient": 0.00126, "mxCentreCoefficient": 0.0231, "mxEdgeMidCoefficient": -0.0513,
    "tolerance": 0.02,
}

# --- OpenSees ShellMITC4 on identical meshes ---
import openseespy.opensees as ops


def distorted(xs, ys, i, j, amplitude):
    """Checkerboard distortion of interior node (i, j): each interior node
    moves by amplitude x (cell size) in x and y with sign (-1)^(i+j), so every
    cell stays a non-parallelogram quadrilateral at any refinement."""
    nx, ny = len(xs) - 1, len(ys) - 1
    if amplitude == 0.0 or i in (0, nx) or j in (0, ny):
        return xs[i], ys[j]
    sign = 1.0 if (i + j) % 2 == 0 else -1.0
    return (xs[i] + sign * amplitude * (xs[1] - xs[0]),
            ys[j] + sign * amplitude * (ys[1] - ys[0]))


def consistent_pressure(corners):
    """q * integral of the bilinear shape functions over a quadrilateral
    (2 x 2 Gauss, exact for bilinear N and linear det J)."""
    g = 1.0 / math.sqrt(3.0)
    nat = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    out = [0.0] * 4
    for r in (-g, g):
        for s_ in (-g, g):
            dr = [0.25 * c[0] * (1 + s_ * c[1]) for c in nat]
            ds = [0.25 * c[1] * (1 + r * c[0]) for c in nat]
            jxr = sum(dr[k] * corners[k][0] for k in range(4))
            jyr = sum(dr[k] * corners[k][1] for k in range(4))
            jxs = sum(ds[k] * corners[k][0] for k in range(4))
            jys = sum(ds[k] * corners[k][1] for k in range(4))
            det = jxr * jys - jyr * jxs
            for k in range(4):
                out[k] += Q * 0.25 * (1 + r * nat[k][0]) * (1 + s_ * nat[k][1]) * det
    return out


def opensees_plate(a, b, t, nx, ny, edges, nu=NU, opening=None, distortion=0.0):
    """Structured nx x ny mesh; `opening` = (x0, x1, y0, y1) removes cells.
    edges: 'simple' (hard) or 'clamped' on the outer boundary; opening edges free.
    `distortion` moves interior nodes by the checkerboard pattern of `distorted`."""
    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    ops.section("ElasticMembranePlateSection", 1, E, nu, t, 0.0)
    xs = [a * i / nx for i in range(nx + 1)]
    ys = [b * j / ny for j in range(ny + 1)]

    def inside(cx, cy):
        return opening and opening[0] < cx < opening[1] and opening[2] < cy < opening[3]

    cells = [(i, j) for j in range(ny) for i in range(nx)
             if not inside((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2)]
    used = set()
    for i, j in cells:
        used |= {(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)}
    tag = {}
    for (i, j) in sorted(used):
        tag[(i, j)] = len(tag) + 1
        ops.node(tag[(i, j)], *distorted(xs, ys, i, j, distortion), 0.0)
    for (i, j), n in tag.items():
        outer = i in (0, nx) or j in (0, ny)
        if not outer:
            continue
        if edges == "clamped":
            ops.fix(n, 1, 1, 1, 1, 1, 1)
        else:
            # Hard simple support: w = 0, tangential rotation = 0, in-plane held.
            # Along an edge y = const the tangential slope dw/dx = 0 means the
            # rotation about the global Y axis is held; along x = const, the
            # rotation about X is held.
            ry_hold = 1 if j in (0, ny) else 0
            rx_hold = 1 if i in (0, nx) else 0
            ops.fix(n, 1, 1, 1, rx_hold, ry_hold, 0)
    e = 0
    elements = {}
    for i, j in cells:
        e += 1
        elements[(i, j)] = e
        ops.element("ShellMITC4", e, tag[(i, j)], tag[(i + 1, j)], tag[(i + 1, j + 1)], tag[(i, j + 1)], 1)
    # Drilling DOFs of interior nodes are free; OpenSees stabilises them.
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    # Consistent bilinear pressure load (q A / 4 per corner on a rectangle).
    load = {}
    for i, j in cells:
        corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
        shares = consistent_pressure([distorted(xs, ys, ci, cj, distortion) for ci, cj in corners])
        for c, share in zip(corners, shares):
            load[c] = load.get(c, 0.0) + share
    for c, f in load.items():
        ops.load(tag[c], 0.0, 0.0, -f, 0.0, 0.0, 0.0)
    ops.system("UmfPack")
    ops.numberer("RCM")
    ops.constraints("Plain")
    ops.integrator("LoadControl", 1.0)
    ops.algorithm("Linear")
    ops.analysis("Static")
    if ops.analyze(1) != 0:
        raise RuntimeError("OpenSees plate solve failed")
    # ShellMITC4 updates its section resultants when resisting forces are
    # formed; a linear step alone leaves them at the previous state.
    ops.reactions()
    w = {f"{i},{j}": ops.nodeDisp(n, 3) for (i, j), n in tag.items()}
    moments = {}
    for (i, j), el in elements.items():
        s = ops.eleResponse(el, "stresses")  # 4 Gauss points x 8 resultants
        gp = [s[k * 8:(k + 1) * 8] for k in range(4)]
        avg = [sum(g[c] for g in gp) / 4 for c in range(8)]
        # OpenSees M11/M22 are positive hogging (top tension) in its axes;
        # report sagging-positive.
        moments[f"{i},{j}"] = {"mx": -avg[3], "my": -avg[4], "mxy": -avg[5]}
    return {"w": w, "moments": moments, "nodes": len(tag), "elements": len(elements)}


def pick(res, keys):
    return {k: res[k] for k in keys}


# OpenSees versus Navier on the thick SS plate: confirms the shear factor and
# the sign mapping used above.
os_thick = opensees_plate(6.0, 6.0, 1.0, 16, 16, "simple")
check(abs(os_thick["w"]["8,8"] / ss_thick["centre"]["w"] - 1) < 5e-3,
      f"OpenSees thick SS centre deflection {os_thick['w']['8,8']} vs Navier {ss_thick['centre']['w']}")
mx_os = os_thick["moments"]["7,7"]["mx"]
mx_nv = [p for p in ss_thick["elementCentres"] if p["mesh"] == 16][0]["mx"]
check(abs(mx_os / mx_nv - 1) < 2e-2, f"OpenSees thick SS moment {mx_os} vs Navier {mx_nv}")

cl = opensees_plate(6.0, 6.0, 0.1, 16, 16, "clamped", nu=0.3)
d03 = rigidity(0.1, 0.3)
check(abs(cl["w"]["8,8"] / (-clamped_tim["wCoefficient"] * Q * 6.0**4 / d03) - 1) < 0.02, "OpenSees clamped vs Timoshenko")
clamped_os = {
    "id": "P-CL-OS", "a": 6.0, "b": 6.0, "t": 0.1, "E": E, "nu": 0.3, "q": Q, "edges": "clamped",
    "mesh": [16, 16], "nodeW": pick(cl["w"], ["8,8", "4,4", "4,8"]),
    "elementMoments": pick(cl["moments"], ["7,7", "0,7", "3,3"]),
    "tolerance": 1e-6,
}
op = opensees_plate(6.0, 5.0, 0.2, 24, 20, "simple", opening=(2.0, 3.0, 2.0, 3.0))
opening_os = {
    "id": "P-OPEN-OS", "a": 6.0, "b": 5.0, "t": 0.2, "E": E, "nu": NU, "q": Q, "edges": "hardSimple",
    "opening": {"x0": 2.0, "x1": 3.0, "y0": 2.0, "y1": 3.0, "edges": "free"},
    "mesh": [24, 20], "nodes": op["nodes"], "elements": op["elements"],
    "nodeW": pick(op["w"], ["12,10", "16,10", "8,6", "8,12", "18,15"]),
    "elementMoments": pick(op["moments"], ["16,10", "7,7", "12,4", "4,15"]),
    "tolerance": 1e-6,
}

# Distorted meshes (SOURCES.md R-SHELL-BENCHMARKS): the thin SS square with
# every interior node moved by 0.2 of the cell size in the checkerboard
# pattern, so no cell is a parallelogram. Navier at the displaced centre node
# for 8, 16, 32. OpenSees ShellMITC4 on the identical meshes: it maps the tied
# shear strains with Bathe & Dvorkin's (1985) element-constant r/s angles,
# plate-v1 with the pointwise J^-1; the two coincide on parallelograms only,
# so on these meshes they are compared as converging discretisations
# (deflections only: ShellMITC4 reports moments in rotated element axes).
DISTORTION = 0.2
distorted_navier = []
distorted_os = []
for n in [8, 16, 32]:
    xs_n = [6.0 * i / n for i in range(n + 1)]
    x, y = distorted(xs_n, xs_n, n // 2, n // 2, DISTORTION)
    ref = navier(6.0, 6.0, 0.2, x, y)["w"]
    distorted_navier.append({"mesh": n, "x": x, "y": y, "w": ref})
    od = opensees_plate(6.0, 6.0, 0.2, n, n, "simple", distortion=DISTORTION)
    q4 = f"{n // 4},{n // 4}"
    distorted_os.append({"mesh": n, "nodeW": pick(od["w"], [f"{n // 2},{n // 2}", q4, f"{n // 4},{n // 2}"])})
    check(abs(od["w"][f"{n // 2},{n // 2}"] / ref - 1) < 3e-2, f"OpenSees distorted {n} vs Navier")
distorted_case = {
    "id": "P-DISTORT", "a": 6.0, "b": 6.0, "t": 0.2, "E": E, "nu": NU, "q": Q, "edges": "hardSimple",
    "distortion": {"pattern": "checkerboard (-1)^(i+j) on interior nodes", "amplitude": DISTORTION},
    "navierCentre": distorted_navier,
    "navierGate": {"mesh": 32, "w": 1e-2, "monotone": True},
    "openSees": distorted_os,
    "openSeesGate": {"basis": "converging discretisations: the largest nodal relative difference falls with each refinement and is at most 1e-3 at 32 x 32",
                     "mesh": 32, "w": 1e-3},
}

# Flat slab on columns (P-POINTS-OS): a 12 x 10 m panel, all edges free,
# on six columns: pinned, fixed and elastic (zeroLength springs to ground in
# w, rx, ry). Columns hold u, v. OpenSees ShellMITC4 on the identical 0.5 m
# mesh; point reactions are the support forces on the slab (restraint
# reactions, or -k u for springs).
def opensees_points(a, b, t, nx, ny, points, nu=NU):
    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    ops.section("ElasticMembranePlateSection", 1, E, nu, t, 0.0)
    xs = [a * i / nx for i in range(nx + 1)]
    ys = [b * j / ny for j in range(ny + 1)]
    tag = {}
    for j in range(ny + 1):
        for i in range(nx + 1):
            tag[(i, j)] = len(tag) + 1
            ops.node(tag[(i, j)], xs[i], ys[j], 0.0)
    grid = lambda x, y: (round(x / (a / nx)), round(y / (b / ny)))
    ops.uniaxialMaterial("Elastic", 900, 1.0)  # placeholder, replaced per spring
    mat = [900]
    ground = 100000
    elem = 100000
    for k, pt in enumerate(points):
        n = tag[grid(pt["x"], pt["y"])]
        if pt["kind"] == "pinned":
            ops.fix(n, 1, 1, 1, 0, 0, 0)
        elif pt["kind"] == "fixed":
            ops.fix(n, 1, 1, 1, 1, 1, 0)
        else:
            ops.fix(n, 1, 1, 0, 0, 0, 0)
            ground += 1
            ops.node(ground, pt["x"], pt["y"], 0.0)
            ops.fix(ground, 1, 1, 1, 1, 1, 1)
            mats, dirs = [], []
            for d, key in ((3, "kz"), (4, "krx"), (5, "kry")):
                if pt[key] > 0:
                    mat[0] += 1
                    ops.uniaxialMaterial("Elastic", mat[0], pt[key])
                    mats.append(mat[0])
                    dirs.append(d)
            elem += 1
            ops.element("zeroLength", elem, ground, n, "-mat", *mats, "-dir", *dirs)
    e = 0
    for j in range(ny):
        for i in range(nx):
            e += 1
            ops.element("ShellMITC4", e, tag[(i, j)], tag[(i + 1, j)], tag[(i + 1, j + 1)], tag[(i, j + 1)], 1)
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    for j in range(ny):
        for i in range(nx):
            share = Q * (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]) / 4
            for c in [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]:
                ops.load(tag[c], 0.0, 0.0, -share, 0.0, 0.0, 0.0)
    ops.system("UmfPack")
    ops.numberer("RCM")
    ops.constraints("Plain")
    ops.integrator("LoadControl", 1.0)
    ops.algorithm("Linear")
    ops.analysis("Static")
    if ops.analyze(1) != 0:
        raise RuntimeError("OpenSees point-supported slab failed")
    ops.reactions()
    w = {f"{i},{j}": ops.nodeDisp(n, 3) for (i, j), n in tag.items()}
    moments = {}
    e = 0
    for j in range(ny):
        for i in range(nx):
            e += 1
            st = ops.eleResponse(e, "stresses")
            gp = [st[k * 8:(k + 1) * 8] for k in range(4)]
            avg = [sum(g[c] for g in gp) / 4 for c in range(8)]
            moments[f"{i},{j}"] = {"mx": -avg[3], "my": -avg[4], "mxy": -avg[5]}
    reactions = []
    for pt in points:
        n = tag[grid(pt["x"], pt["y"])]
        if pt["kind"] == "spring":
            u = [ops.nodeDisp(n, d) for d in (3, 4, 5)]
            reactions.append([-pt["kz"] * u[0], -pt["krx"] * u[1], -pt["kry"] * u[2]])
        else:
            r = ops.nodeReaction(n)
            reactions.append([r[2], r[3] if pt["kind"] == "fixed" else 0.0, r[4] if pt["kind"] == "fixed" else 0.0])
    return {"w": w, "moments": moments, "reactions": reactions}


POINTS = [
    {"x": 1.0, "y": 1.0, "kind": "pinned"},
    {"x": 6.0, "y": 1.0, "kind": "fixed"},
    {"x": 11.0, "y": 1.0, "kind": "spring", "kz": 5e8, "krx": 2e8, "kry": 2e8},
    {"x": 1.0, "y": 9.0, "kind": "spring", "kz": 8e8, "krx": 0.0, "kry": 3e8},
    {"x": 6.0, "y": 9.0, "kind": "spring", "kz": 5e8, "krx": 2e8, "kry": 2e8},
    {"x": 11.0, "y": 9.0, "kind": "pinned"},
]
for pt in POINTS:
    pt.setdefault("kz", 0.0)
    pt.setdefault("krx", 0.0)
    pt.setdefault("kry", 0.0)
pp = opensees_points(12.0, 10.0, 0.25, 24, 20, POINTS)
total = sum(r[0] for r in pp["reactions"])
check(abs(total - Q * 12.0 * 10.0) < 1e-6 * Q * 120.0, f"point reactions {total} vs load")
points_case = {
    "id": "P-POINTS-OS", "a": 12.0, "b": 10.0, "t": 0.25, "E": E, "nu": NU, "q": Q, "edges": "free",
    "points": POINTS, "mesh": [24, 20],
    "nodeW": pick(pp["w"], ["12,10", "2,2", "22,18", "0,20", "24,0", "12,0"]),
    "elementMoments": pick(pp["moments"], ["11,9", "1,1", "12,1", "22,17", "5,18"]),
    "pointReactions": pp["reactions"],
    "tolerance": 1e-6,
}

# MacNeal-Harder distorted patch (0.24 x 0.12) for membrane and bending patch
# tests; the exact fields are linear (membrane) and quadratic (bending).
patch = {
    "id": "P-PATCH",
    "outer": [[0, 0], [0.24, 0], [0.24, 0.12], [0, 0.12]],
    "inner": [[0.04, 0.02], [0.18, 0.03], [0.16, 0.08], [0.08, 0.08]],
    "elements": [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]],
    "membraneField": "u = 1e-3 (x + y/2), v = 1e-3 (y + x/2)",
    "bendingField": "w = 1e-3 (x^2 + x y + y^2) / 2, rotations from -dw",
    "tolerance": 1e-10,
}

generator = hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest()
oracle = {
    "formulation": "docs/formulations/plate.md (plate-v1)",
    "generator": "tools/oracles/plate_oracle.py",
    "generatorSha256": generator,
    "opensees": {"package": "openseespy", "version": ops.version(), "element": "ShellMITC4",
                 "section": "ElasticMembranePlateSection"},
    "units": "SI (N, m, Pa); q downward; w along +Z; moments sagging-positive (N m/m)",
    "cases": [ss_thin, ss_thick, ss_rect, ss_limit],
    "clampedTimoshenko": clamped_tim,
    "clampedOpenSees": clamped_os,
    "openingOpenSees": opening_os,
    "distorted": distorted_case,
    "points": points_case,
    "patch": patch,
    "failures": failures,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(oracle, f, indent=2)
    f.write("\n")
print(json.dumps({"failures": failures, "thickCentreW": ss_thick["centre"]["w"], "osThickW": os_thick["w"]["8,8"],
                  "osClampedW": cl["w"]["8,8"], "openW": op["w"]["12,10"], "distortedW": distorted_os[-1]["nodeW"]["16,16"]}, indent=1))
sys.exit(1 if failures else 0)
