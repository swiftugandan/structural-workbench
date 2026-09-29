#!/usr/bin/env python3
"""Independent modal oracle (M14-A, dynamics-v1).

Closed forms give SDOF, cantilever, simply supported, axial and torsional bar
frequencies and a two-storey shear frame; OpenSees gives the frequencies of a
spatial frame (lumped mass) and a planar portal (consistent mass). Nothing
here imports the Rust kernel. Run with tools/oracle-env/bin/python (openseespy
pinned in tools/oracle-requirements.txt).

Writes fixtures/dynamics/modal-oracle.json. Exits 1 if any internal
consistency check fails.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "fixtures/dynamics/modal-oracle.json")

failures = []


def check(cond, text):
    if not cond:
        failures.append(text)


def bisect(f, a, b, tol=1e-15):
    fa = f(a)
    for _ in range(300):
        m = 0.5 * (a + b)
        fm = f(m)
        if fa * fm <= 0:
            b = m
        else:
            a, fa = m, fm
        if b - a < tol * max(1.0, abs(m)):
            break
    return 0.5 * (a + b)


E = 210e9
NU = 0.3
G = E / (2 * (1 + NU))
RHO = 7850.0
# A doubly symmetric I-section with distinct principal inertias.
A = 5.381e-3
IY = 6.038e-6
IZ = 8.356e-5
J = 2.01e-7
L = 5.0
MU = RHO * A
SECTION = {"A": A, "Iy": IY, "Iz": IZ, "J": J}

# --- Cantilever and simply supported beam roots --------------------------
# Fixed-free: cos(x) cosh(x) = -1. Pinned-pinned: x = n pi.
cant_roots = []
for n in range(1, 4):
    lo = (n - 0.5) * math.pi - 0.6
    hi = (n - 0.5) * math.pi + 0.6
    cant_roots.append(
        bisect(lambda x: math.cos(x) * math.cosh(x) + 1.0, max(lo, 1e-6), hi)
    )
check(abs(cant_roots[0] - 1.8751040687119611) < 1e-12, "cantilever root 1")
check(abs(cant_roots[1] - 4.694091132974175) < 1e-11, "cantilever root 2")
check(abs(cant_roots[2] - 7.854757438237613) < 1e-10, "cantilever root 3")


def bending_omega(beta_l, ei):
    return beta_l**2 * math.sqrt(ei / (MU * L**4))


cantilever = {
    "id": "D-CANT",
    "support": "fixedFree",
    "L": L,
    "E": E,
    "nu": NU,
    "density": RHO,
    "section": SECTION,
    "betaL": cant_roots,
    # Iy bends in the plane of local z, Iz in the plane of local y; both
    # families appear, sorted by frequency.
    "omegaWeak": [bending_omega(b, E * IY) for b in cant_roots],
    "omegaStrong": [bending_omega(b, E * IZ) for b in cant_roots],
    "tolerance": 1e-4,
    "subdivisions": 16,
}
simply = {
    "id": "D-SS",
    "support": "pinnedPinned",
    "L": L,
    "E": E,
    "nu": NU,
    "density": RHO,
    "section": SECTION,
    "omegaWeak": [bending_omega(n * math.pi, E * IY) for n in (1, 2, 3)],
    "omegaStrong": [bending_omega(n * math.pi, E * IZ) for n in (1, 2, 3)],
    "tolerance": 1e-4,
    "subdivisions": 16,
}
axial = {
    "id": "D-AXIAL",
    "support": "fixedFree",
    "L": L,
    "E": E,
    "density": RHO,
    "omega": [(2 * n - 1) * math.pi / (2 * L) * math.sqrt(E / RHO) for n in (1, 2)],
    "tolerance": 1e-3,
    # Linear axial elements with consistent mass err by about (kh)^2/24 from
    # above: mode 2 at 16 elements is 3.6e-3, at 32 about 9e-4. The gate is
    # the 1e-3 tolerance at 32 elements plus second-order convergence 16->32.
    "subdivisions": 32,
    "convergenceOrder": 2,
}
torsion = {
    "id": "D-TORSION",
    "support": "fixedFree",
    "L": L,
    "G": G,
    "density": RHO,
    "polarMassPerLength": RHO * (IY + IZ),
    "omega": [math.pi / (2 * L) * math.sqrt(G * J / (RHO * (IY + IZ)))],
    "tolerance": 1e-3,
    "subdivisions": 16,
}

# --- SDOF: massless cantilever with a tip point mass ---------------------
M_TIP = 1500.0
sdof = {
    "id": "D-SDOF",
    "L": L,
    "E": E,
    "section": SECTION,
    "tipMass": M_TIP,
    # Lateral in each principal plane and axial: exact for Euler-Bernoulli
    # elements with only a nodal translational mass.
    "omegaWeak": math.sqrt(3 * E * IY / L**3 / M_TIP),
    "omegaStrong": math.sqrt(3 * E * IZ / L**3 / M_TIP),
    "omegaAxial": math.sqrt(E * A / L / M_TIP),
    "tolerance": 1e-9,
}

# --- Two-storey shear frame (planar XZ) ---------------------------------
# Massless fixed-fixed columns, near-rigid beams, storey masses at the beam
# ends. k = 2 * 12 EI / h^3 per storey.
H = 3.0
B = 6.0
I_COL = 8.0e-5
K_STOREY = 2 * 12 * E * I_COL / H**3
M1 = 20000.0
M2 = 12000.0
# det([[k1+k2 - w2 m1, -k2], [-k2, k2 - w2 m2]]) = 0 with k1 = k2 = k.
k = K_STOREY
a_ = M1 * M2
b_ = -(2 * k * M2 + k * M1)
c_ = k * k
disc = math.sqrt(b_ * b_ - 4 * a_ * c_)
w2 = sorted([(-b_ - disc) / (2 * a_), (-b_ + disc) / (2 * a_)])
shear = {
    "id": "D-SHEAR2",
    "storeyHeight": H,
    "bay": B,
    "E": E,
    "nu": NU,
    "column": {"A": 1e3, "Iy": I_COL, "Iz": I_COL, "J": 1e-4},
    # Beams and column axial stiffness are made effectively rigid: the
    # closed form assumes no beam rotation and no column shortening. At 1e3
    # the OpenSees model of the same frame differs from it by ~1e-7.
    "beam": {"A": 1e3, "Iy": 1e3, "Iz": 1e3, "J": 1e-4},
    "storeyMass": [M1, M2],
    "nodalMassPerBeamEnd": [M1 / 2, M2 / 2],
    "storeyStiffness": K_STOREY,
    "omega": [math.sqrt(v) for v in w2],
    "tolerance": 1e-5,
}
for v in w2:
    det = (2 * k - v * M1) * (k - v * M2) - k * k
    check(abs(det) < 1e-6 * k * k, "shear frame characteristic equation")

# --- Mass scaling ----------------------------------------------------------
scale = {"id": "D-SCALE", "massFactor": 4.0, "omegaFactor": 0.5, "tolerance": 1e-12}

# --- OpenSees frames ---------------------------------------------------------
import openseespy.opensees as ops


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def norm(a):
    s = math.sqrt(sum(x * x for x in a))
    return [x / s for x in a]


def spatial_frame():
    """Two storeys, one bay each way; columns and beams, nodal floor masses."""
    xs, ys, hs = [0.0, 6.0], [0.0, 4.5], [0.0, 3.5, 7.0]
    nodes = {}
    for k_, z in enumerate(hs):
        for i, x in enumerate(xs):
            for j, y in enumerate(ys):
                nodes[f"n{k_}{i}{j}"] = [x, y, z]
    col = {"A": 1.2e-2, "Iy": 1.2e-4, "Iz": 0.9e-4, "J": 5.0e-6}
    beam = {"A": 8.0e-3, "Iy": 2.0e-4, "Iz": 0.3e-4, "J": 2.0e-6}
    members = []
    for k_ in range(2):
        for i in range(2):
            for j in range(2):
                members.append(
                    {"id": f"c{k_}{i}{j}", "start": f"n{k_}{i}{j}", "end": f"n{k_+1}{i}{j}",
                     "section": "col", "localY": [1.0, 0.0, 0.0]}
                )
    for k_ in (1, 2):
        for j in range(2):
            members.append(
                {"id": f"bx{k_}{j}", "start": f"n{k_}0{j}", "end": f"n{k_}1{j}",
                 "section": "beam", "localY": [0.0, -1.0, 0.0]}
            )
        for i in range(2):
            members.append(
                {"id": f"by{k_}{i}", "start": f"n{k_}{i}0", "end": f"n{k_}{i}1",
                 "section": "beam", "localY": [1.0, 0.0, 0.0]}
            )
    masses = {}
    for i in range(2):
        for j in range(2):
            masses[f"n1{i}{j}"] = 4000.0 + 500.0 * i + 250.0 * j
            masses[f"n2{i}{j}"] = 2500.0 + 300.0 * j
    return {
        "nodes": nodes,
        "members": members,
        "sections": {"col": col, "beam": beam},
        "supports": [f"n0{i}{j}" for i in range(2) for j in range(2)],
        "nodalMasses": masses,
    }


def opensees_spatial(frame, subdivisions, n_modes):
    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    tags = {}
    t = [0]

    def node(pos):
        t[0] += 1
        ops.node(t[0], *pos)
        return t[0]

    for nid, pos in frame["nodes"].items():
        tags[nid] = node(pos)
    for s in frame["supports"]:
        ops.fix(tags[s], 1, 1, 1, 1, 1, 1)
    for nid, m in frame["nodalMasses"].items():
        ops.mass(tags[nid], m, m, m, 0.0, 0.0, 0.0)
    e = [0]
    for m in frame["members"]:
        a, b = frame["nodes"][m["start"]], frame["nodes"][m["end"]]
        x = norm([q - p for p, q in zip(a, b)])
        z = norm(cross(x, m["localY"]))
        e[0] += 1
        transf = e[0]
        ops.geomTransf("Linear", transf, *z)
        sec = frame["sections"][m["section"]]
        prev = tags[m["start"]]
        for s in range(1, subdivisions + 1):
            if s < subdivisions:
                nxt = node([p + (q - p) * s / subdivisions for p, q in zip(a, b)])
            else:
                nxt = tags[m["end"]]
            e[0] += 1
            ops.element(
                "elasticBeamColumn", e[0], prev, nxt, sec["A"], E, G, sec["J"],
                sec["Iy"], sec["Iz"], transf, "-mass", RHO * sec["A"],
            )
            prev = nxt
    values = ops.eigen("-fullGenLapack", n_modes)
    return [math.sqrt(v) for v in values]


def portal():
    return {
        "height": 4.0,
        "span": 7.0,
        "column": {"A": 9.1e-3, "Iy": 1.5e-4, "Iz": 1.5e-4, "J": 3.0e-6},
        "beam": {"A": 7.6e-3, "Iy": 2.2e-4, "Iz": 2.2e-4, "J": 2.0e-6},
        "nodalMass": 3000.0,
    }


def opensees_portal(p, subdivisions, n_modes):
    """Planar XZ portal, fixed bases, consistent mass (-cMass), top masses."""
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 3)
    t = [0]

    def node(x, z):
        t[0] += 1
        ops.node(t[0], x, z)
        return t[0]

    h, b = p["height"], p["span"]
    bl, br, tl, tr = node(0, 0), node(b, 0), node(0, h), node(b, h)
    ops.fix(bl, 1, 1, 1)
    ops.fix(br, 1, 1, 1)
    for n in (tl, tr):
        ops.mass(n, p["nodalMass"], p["nodalMass"], 0.0)
    ops.geomTransf("Linear", 1)
    e = [0]
    coords = {bl: (0, 0), br: (b, 0), tl: (0, h), tr: (b, h)}
    for (i, j, sec) in ((bl, tl, p["column"]), (br, tr, p["column"]), (tl, tr, p["beam"])):
        (x0, z0), (x1, z1) = coords[i], coords[j]
        prev = i
        for s in range(1, subdivisions + 1):
            nxt = node(x0 + (x1 - x0) * s / subdivisions, z0 + (z1 - z0) * s / subdivisions) if s < subdivisions else j
            e[0] += 1
            ops.element("elasticBeamColumn", e[0], prev, nxt, sec["A"], E, sec["Iy"], 1,
                        "-mass", RHO * sec["A"], "-cMass")
            prev = nxt
    values = ops.eigen("-fullGenLapack", n_modes)
    return [math.sqrt(v) for v in values]


def opensees_shear(case):
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 3)
    h, b = case["storeyHeight"], case["bay"]
    for t, (x, z) in enumerate([(0, 0), (b, 0), (0, h), (b, h), (0, 2 * h), (b, 2 * h)], 1):
        ops.node(t, x, z)
    ops.fix(1, 1, 1, 1)
    ops.fix(2, 1, 1, 1)
    for n, m in [(3, M1 / 2), (4, M1 / 2), (5, M2 / 2), (6, M2 / 2)]:
        ops.mass(n, m, m, 0.0)
    ops.geomTransf("Linear", 1)
    c, bm = case["column"], case["beam"]
    for t, (i, j, s) in enumerate([(1, 3, c), (2, 4, c), (3, 5, c), (4, 6, c), (3, 4, bm), (5, 6, bm)], 1):
        ops.element("elasticBeamColumn", t, i, j, s["A"], E, s["Iy"], 1)
    return [math.sqrt(v) for v in ops.eigen("-fullGenLapack", 2)]


shear["openSeesOmega"] = opensees_shear(shear)
check(
    all(abs(o / c - 1) < 1e-6 for o, c in zip(shear["openSeesOmega"], shear["omega"])),
    "shear frame closed form against OpenSees",
)

frame = spatial_frame()
frame_os = opensees_spatial(frame, 4, 6)
frame_os_fine = opensees_spatial(frame, 8, 6)
check(all(w > 0 for w in frame_os), "spatial frame positive frequencies")
check(frame_os == sorted(frame_os), "spatial frame ordering")
# Lumped mass is not monotone under refinement in a frame; the finer mesh is
# recorded to show the discretisation spread, and only the same-mesh values
# are gates.
check(all(abs(f / c - 1) < 5e-3 for c, f in zip(frame_os, frame_os_fine)), "spatial frame refinement spread")

por = portal()
portal_os = opensees_portal(por, 8, 4)
portal_os_fine = opensees_portal(por, 16, 4)
check(all(f <= c * (1 + 1e-12) for c, f in zip(portal_os, portal_os_fine)), "portal consistent refinement")

frame_case = {
    "id": "D-FRAME-OS",
    "E": E,
    "nu": NU,
    "density": RHO,
    "massMatrix": "lumped",
    "subdivisions": 4,
    **frame,
    "omega": frame_os,
    "omegaAt8": frame_os_fine,
    "tolerance": 1e-6,
}
portal_case = {
    "id": "D-PORTAL-OS",
    "E": E,
    "nu": NU,
    "density": RHO,
    "massMatrix": "consistent",
    "subdivisions": 8,
    **por,
    "omega": portal_os,
    "tolerance": 1e-6,
}

generator = hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest()
oracle = {
    "formulation": "docs/formulations/modal.md (dynamics-v1)",
    "generator": "tools/oracles/modal_oracle.py",
    "generatorSha256": generator,
    "opensees": {
        "package": "openseespy",
        "version": ops.version(),
        "eigen": "-fullGenLapack",
        "spatial": "elasticBeamColumn 3D, lumped (-mass rho*A), nodal translational masses",
        "planar": "elasticBeamColumn 2D, consistent (-cMass)",
    },
    "units": "SI (N, m, kg, Pa, rad/s)",
    "sdof": sdof,
    "cantilever": cantilever,
    "simplySupported": simply,
    "axial": axial,
    "torsion": torsion,
    "shearFrame": shear,
    "massScaling": scale,
    "spatialFrame": frame_case,
    "portal": portal_case,
    "failures": failures,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(oracle, f, indent=2)
    f.write("\n")
print(json.dumps({"failures": failures, "spatial": frame_os, "portal": portal_os, "shear": shear["omega"]}, indent=1))
sys.exit(1 if failures else 0)
