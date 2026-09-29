#!/usr/bin/env python3
"""Independent response-v1 oracle (M15): harmonic and response-spectrum.

Closed forms for a tip-mass cantilever and a two-storey shear frame; for a
spatial frame, OpenSeesPy 3.4.0 supplies K and M (GimmeMCK) and the modes,
and this script solves the complex harmonic system and combines modal
responses itself (pure Python, no numpy). Nothing here imports the Rust
kernel. Run with tools/oracle-env/bin/python.

Sign conventions (docs/formulations/response.md): u(t) = Re(U e^{i W t}),
Z = (1 + i W a1) K - (W^2 - i W a0) M; spectra Sa in m/s^2; combined
spectral responses are non-negative magnitudes.

Writes fixtures/dynamics/response-oracle.json; exits 1 on any self-check.
"""
import cmath
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "fixtures/dynamics/response-oracle.json")
failures = []


def check(cond, text):
    if not cond:
        failures.append(text)


E = 210e9
NU = 0.3
G = E / (2 * (1 + NU))
RHO = 7850.0
TWO_PI = 2 * math.pi

# The spectrum used by every response-spectrum case (m/s^2), 5 % damping.
SPECTRUM = [[0.0, 2.0], [0.1, 5.0], [0.5, 5.0], [1.0, 2.5], [2.0, 1.25], [4.0, 0.625]]
ZETA = 0.05


def sa(t):
    for (t0, s0), (t1, s1) in zip(SPECTRUM, SPECTRUM[1:]):
        if t0 <= t <= t1:
            return s0 + (s1 - s0) * (t - t0) / (t1 - t0)
    raise ValueError(f"period {t} outside the spectrum")


def rho(wi, wj, z=ZETA):
    """Der Kiureghian (1981) CQC coefficient, equal damping."""
    b = wj / wi
    return 8 * z * z * (1 + b) * b**1.5 / ((1 - b * b) ** 2 + 4 * z * z * b * (1 + b) ** 2)


def srss(values):
    return math.sqrt(sum(v * v for v in values))


def cqc(values, omegas):
    s = 0.0
    for i, (ri, wi) in enumerate(zip(values, omegas)):
        for j, (rj, wj) in enumerate(zip(values, omegas)):
            s += rho(wi, wj) * ri * rj
    return math.sqrt(max(s, 0.0))


def rayleigh(zeta, w1, w2):
    return 2 * zeta * w1 * w2 / (w1 + w2), 2 * zeta / (w1 + w2)


def solve(a, b):
    """Dense Gaussian elimination with partial pivoting (real or complex)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for p in range(n):
        piv = max(range(p, n), key=lambda r: abs(m[r][p]))
        m[p], m[piv] = m[piv], m[p]
        inv = 1 / m[p][p]
        rp = m[p]
        for r in range(p + 1, n):
            f = m[r][p] * inv
            if f != 0:
                rr = m[r]
                for c in range(p, n + 1):
                    rr[c] -= f * rp[c]
    x = [0] * n
    for p in range(n - 1, -1, -1):
        s = m[p][n] - sum(m[p][c] * x[c] for c in range(p + 1, n))
        x[p] = s / m[p][p]
    return x


# --- Tip-mass cantilever (H-SDOF, R-SDOF) -----------------------------------
# Along X, local y = global Y: a tip force along Z bends about local y (Iy).
L = 5.0
SECTION = {"A": 5.381e-3, "Iy": 6.038e-6, "Iz": 8.356e-5, "J": 2.01e-7}
M_TIP = 1500.0
K_TIP = 3 * E * SECTION["Iy"] / L**3
W_N = math.sqrt(K_TIP / M_TIP)
F_TIP = 1000.0
A0, A1 = rayleigh(ZETA, W_N, 3 * W_N)
sdof_freqs = [W_N / TWO_PI * r for r in (0.2, 0.5, 0.9, 1.0, 1.1, 2.0, 5.0)]
sdof_u = []
for f in sdof_freqs:
    w = TWO_PI * f
    u = F_TIP / (K_TIP * (1 + 1j * w * A1) - M_TIP * w * w + 1j * w * A0 * M_TIP)
    sdof_u.append([u.real, u.imag])
# At resonance the Rayleigh ratio at W_N is ZETA: |U| = F / (2 zeta k).
check(abs(abs(complex(*sdof_u[3])) - F_TIP / (2 * ZETA * K_TIP)) < 1e-12 * F_TIP / K_TIP, "SDOF resonance")
T_N = TWO_PI / W_N
sdof = {
    "id": "H-SDOF / R-SDOF",
    "L": L, "E": E, "nu": NU, "section": SECTION, "tipMass": M_TIP,
    "tipStiffness": K_TIP, "omega": W_N,
    "harmonic": {"force": F_TIP, "direction": "Z", "damping": {"ratio": ZETA, "frequencies": [W_N / TWO_PI, 3 * W_N / TWO_PI]},
                 "a0": A0, "a1": A1, "frequencies": sdof_freqs, "tipDisplacement": sdof_u, "tolerance": 1e-9},
    "spectrum": {"direction": "Z", "scale": 1.0, "period": T_N, "sa": sa(T_N),
                 "tipDisplacement": sa(T_N) / W_N**2, "baseShear": M_TIP * sa(T_N),
                 "baseMoment": M_TIP * sa(T_N) * L, "tolerance": 1e-9},
}

# --- Two-storey shear frame (R-SHEAR2) ----------------------------------------
H = 3.0
I_COL = 8.0e-5
K_S = 2 * 12 * E * I_COL / H**3
M1, M2 = 20000.0, 12000.0
a_, b_, c_ = M1 * M2, -(2 * K_S * M2 + K_S * M1), K_S * K_S
disc = math.sqrt(b_ * b_ - 4 * a_ * c_)
w2s = sorted([(-b_ - disc) / (2 * a_), (-b_ + disc) / (2 * a_)])
modes = []
for w2 in w2s:
    phi = [1.0, (2 * K_S - w2 * M1) / K_S]
    norm = math.sqrt(M1 * phi[0] ** 2 + M2 * phi[1] ** 2)
    phi = [x / norm for x in phi]
    gamma = M1 * phi[0] + M2 * phi[1]
    w = math.sqrt(w2)
    q = gamma * sa(TWO_PI / w) / w2
    u = [phi[0] * q, phi[1] * q]
    modes.append({"omega": w, "period": TWO_PI / w, "sa": sa(TWO_PI / w), "gamma": gamma,
                  "floor": u, "baseShear": K_S * u[0], "storey2Shear": K_S * (u[1] - u[0])})
check(abs(sum(m["gamma"] ** 2 for m in modes) - (M1 + M2)) < 1e-9 * (M1 + M2), "shear frame mass sum")
ws = [m["omega"] for m in modes]
comb = {}
for key, pick in (("floor1", lambda m: m["floor"][0]), ("floor2", lambda m: m["floor"][1]),
                  ("baseShear", lambda m: m["baseShear"]), ("storey2Shear", lambda m: m["storey2Shear"])):
    vals = [pick(m) for m in modes]
    comb[key] = {"srss": srss(vals), "cqc": cqc(vals, ws)}
shear = {
    "id": "R-SHEAR2", "storeyHeight": H, "bay": 6.0, "E": E, "nu": NU,
    "column": {"A": 1e3, "Iy": I_COL, "Iz": I_COL, "J": 1e-4},
    "beam": {"A": 1e3, "Iy": 1e3, "Iz": 1e3, "J": 1e-4},
    "nodalMassPerBeamEnd": [M1 / 2, M2 / 2], "direction": "X", "scale": 1.0,
    "modes": modes, "combined": comb, "tolerance": 1e-5,
}

# --- Spatial frame (H-FRAME-OS, R-FRAME-OS) -------------------------------------
import openseespy.opensees as ops


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def unit(a):
    s = math.sqrt(sum(x * x for x in a))
    return [x / s for x in a]


def spatial_frame():
    xs, ys, hs = [0.0, 6.0], [0.0, 4.5], [0.0, 3.5, 7.0]
    nodes = {}
    for k_, z in enumerate(hs):
        for i, x in enumerate(xs):
            for j, y in enumerate(ys):
                nodes[f"n{k_}{i}{j}"] = [x, y, z]
    members = []
    for k_ in range(2):
        for i in range(2):
            for j in range(2):
                members.append({"id": f"c{k_}{i}{j}", "start": f"n{k_}{i}{j}", "end": f"n{k_+1}{i}{j}",
                                "section": "col", "localY": [1.0, 0.0, 0.0]})
    for k_ in (1, 2):
        for j in range(2):
            members.append({"id": f"bx{k_}{j}", "start": f"n{k_}0{j}", "end": f"n{k_}1{j}",
                            "section": "beam", "localY": [0.0, -1.0, 0.0]})
        for i in range(2):
            members.append({"id": f"by{k_}{i}", "start": f"n{k_}{i}0", "end": f"n{k_}{i}1",
                            "section": "beam", "localY": [1.0, 0.0, 0.0]})
    masses = {}
    for i in range(2):
        for j in range(2):
            masses[f"n1{i}{j}"] = 4000.0 + 500.0 * i + 250.0 * j
            masses[f"n2{i}{j}"] = 2500.0 + 300.0 * j
    return {
        "E": E, "nu": NU, "density": RHO, "massMatrix": "lumped", "subdivisions": 4,
        "nodes": nodes, "members": members,
        "sections": {"col": {"A": 1.2e-2, "Iy": 1.2e-4, "Iz": 0.9e-4, "J": 5.0e-6},
                     "beam": {"A": 8.0e-3, "Iy": 2.0e-4, "Iz": 0.3e-4, "J": 2.0e-6}},
        "supports": [f"n0{i}{j}" for i in range(2) for j in range(2)],
        "nodalMasses": masses,
        # Harmonic load case: lateral forces at both floors, one vertical.
        "loads": {"n200": [10e3, 5e3, 0, 0, 0, 0], "n211": [10e3, -4e3, 0, 0, 0, 0],
                  "n110": [6e3, 3e3, -8e3, 0, 0, 0], "n101": [0, 6e3, 0, 0, 0, 0]},
    }


FRAME = spatial_frame()


def build(frame):
    """OpenSees model; returns node tags, original-member element chains."""
    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", 6)
    tags, chains = {}, {}
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
    n = frame["subdivisions"]
    for m in frame["members"]:
        a, b = frame["nodes"][m["start"]], frame["nodes"][m["end"]]
        x = unit([q - p for p, q in zip(a, b)])
        z = unit(cross(x, m["localY"]))
        e[0] += 1
        transf = e[0]
        ops.geomTransf("Linear", transf, *z)
        sec = frame["sections"][m["section"]]
        prev = tags[m["start"]]
        chain = []
        for s in range(1, n + 1):
            nxt = node([p + (q - p) * s / n for p, q in zip(a, b)]) if s < n else tags[m["end"]]
            e[0] += 1
            ops.element("elasticBeamColumn", e[0], prev, nxt, sec["A"], E, G, sec["J"],
                        sec["Iy"], sec["Iz"], transf, "-mass", RHO * sec["A"])
            chain.append(e[0])
            prev = nxt
        chains[m["id"]] = chain
    ops.system("FullGeneral")
    ops.numberer("Plain")
    ops.constraints("Plain")
    ops.algorithm("Linear")
    return tags, chains


def matrix(m, c, k):
    ops.integrator("GimmeMCK", m, c, k)
    ops.analysis("Transient")
    ops.analyze(1, 0.0)
    n = ops.systemSize()
    a = ops.printA("-ret")
    return [a[i * n:(i + 1) * n] for i in range(n)]


tags, chains = build(FRAME)
K = matrix(0.0, 0.0, 1.0)
M = matrix(1.0, 0.0, 0.0)
NEQ = len(K)
eq = {nid: ops.nodeDOFs(tag) for nid, tag in tags.items()}
all_eq = {tag: ops.nodeDOFs(tag) for tag in ops.getNodeTags()}
N_MODES = 12
omega2 = ops.eigen("-fullGenLapack", N_MODES)
omegas = [math.sqrt(v) for v in omega2]
# M-normalised eigenvectors on the equation numbering.
phis = []
for k_ in range(N_MODES):
    v = [0.0] * NEQ
    for tag, dofs in all_eq.items():
        vec = ops.nodeEigenvector(tag, k_ + 1)
        for d, e_ in enumerate(dofs):
            if e_ >= 0:
                v[e_] = vec[d]
    mv = [sum(M[i][j] * v[j] for j in range(NEQ)) for i in range(NEQ)]
    s = math.sqrt(sum(a * b for a, b in zip(v, mv)))
    phis.append([x / s for x in v])
    check(abs(omega2[k_] - sum(v[i] * sum(K[i][j] * v[j] for j in range(NEQ)) for i in range(NEQ)) / s**2) < 1e-6 * omega2[k_], f"Rayleigh quotient mode {k_}")

# Harmonic (H-FRAME-OS): Rayleigh 5 % at the first and third frequencies.
a0, a1 = rayleigh(ZETA, omegas[0], omegas[2])
F = [0.0] * NEQ
for nid, vals in FRAME["loads"].items():
    for d, v in enumerate(vals):
        if eq[nid][d] >= 0:
            F[eq[nid][d]] += v
w1, w2_, w3 = omegas[0], omegas[1], omegas[2]
h_freqs = [x / TWO_PI for x in (0.5 * w1, 0.99 * w1, 0.5 * (w1 + w2_), w3, 1.5 * w3)]
harmonic = []
for f in h_freqs:
    w = TWO_PI * f
    zc = [[(1 + 1j * w * a1) * K[i][j] - (w * w - 1j * w * a0) * M[i][j] for j in range(NEQ)] for i in range(NEQ)]
    U = solve(zc, [complex(x) for x in F])
    res = max(abs(sum(zc[i][j] * U[j] for j in range(NEQ)) - F[i]) for i in range(NEQ)) / max(abs(x) for x in F)
    check(res < 1e-9, f"harmonic residual {res} at {f}")
    harmonic.append({"frequency": f, "nodes": {
        nid: [[U[e_].real, U[e_].imag] if e_ >= 0 else [0.0, 0.0] for e_ in eq[nid]] for nid in FRAME["nodes"]}})
# Oracle self-check: the real 2n block system gives the same U at the first frequency.
w = TWO_PI * h_freqs[1]
A = [[K[i][j] - w * w * M[i][j] for j in range(NEQ)] for i in range(NEQ)]
C = [[w * (a0 * M[i][j] + a1 * K[i][j]) for j in range(NEQ)] for i in range(NEQ)]
big = [A[i] + [-c for c in C[i]] for i in range(NEQ)] + [C[i] + A[i] for i in range(NEQ)]
xr = solve(big, F + [0.0] * NEQ)
direct = harmonic[1]["nodes"]
worst = 0.0
scale = max(abs(complex(*c)) for v in direct.values() for c in v)
for nid in FRAME["nodes"]:
    for d, e_ in enumerate(eq[nid]):
        if e_ >= 0:
            worst = max(worst, abs(complex(xr[e_], xr[NEQ + e_]) - complex(*direct[nid][d])) / scale)
check(worst < 1e-9, f"real 2n block solve differs by {worst}")

# Response spectrum (R-FRAME-OS): X and Y, SRSS and CQC over 12 modes.
def influence(direction):
    r = [0.0] * NEQ
    for tag, dofs in all_eq.items():
        if dofs[direction] >= 0:
            r[dofs[direction]] = 1.0
    return r


def modal_state(x):
    """Set the mesh displacement to x and return (member ends, reactions, node disp)."""
    for tag, dofs in all_eq.items():
        for d, e_ in enumerate(dofs):
            ops.setNodeDisp(tag, d + 1, x[e_] if e_ >= 0 else 0.0, "-commit")
    ops.reactions()
    ends = {mid: ops.eleResponse(ch[0], "localForce")[:6] + ops.eleResponse(ch[-1], "localForce")[6:]
            for mid, ch in chains.items()}
    reac = {s: ops.nodeReaction(tags[s]) for s in FRAME["supports"]}
    disp = {nid: [x[e_] if e_ >= 0 else 0.0 for e_ in eq[nid]] for nid in FRAME["nodes"]}
    return ends, reac, disp


spectrum_cases = []
for dname, direction in (("X", 0), ("Y", 1)):
    r = influence(direction)
    per_mode = []
    for k_ in range(N_MODES):
        mr = [sum(M[i][j] * r[j] for j in range(NEQ)) for i in range(NEQ)]
        gamma = sum(a * b for a, b in zip(phis[k_], mr))
        q = gamma * sa(TWO_PI / omegas[k_]) / omega2[k_]
        per_mode.append((gamma, modal_state([p * q for p in phis[k_]])))
    base_modal = [[sum(reac[s][c] for s in FRAME["supports"]) for c in range(3)] for _, (_, reac, _) in per_mode]
    out = {"direction": dname, "scale": 1.0, "gammas": [g for g, _ in per_mode]}
    for rule, fn in (("srss", lambda v: srss(v)), ("cqc", lambda v: cqc(v, omegas))):
        out[rule] = {
            "memberEnds": {mid: [fn([pm[1][0][mid][c] for pm in per_mode]) for c in range(12)] for mid in chains},
            "reactions": {s: [fn([pm[1][1][s][c] for pm in per_mode]) for c in range(6)] for s in FRAME["supports"]},
            "nodes": {nid: [fn([pm[1][2][nid][c] for pm in per_mode]) for c in range(6)] for nid in FRAME["nodes"]},
            "baseReaction": [fn([b[c] for b in base_modal]) for c in range(3)],
        }
    # Modal base shear = effective mass x Sa, and it equals the reaction sum.
    for k_, (gamma, _) in enumerate(per_mode):
        v = gamma * gamma * sa(TWO_PI / omegas[k_])
        check(abs(abs(base_modal[k_][direction]) - v) <= 1e-6 * max(v, 1.0), f"modal base shear {dname} {k_}")
    spectrum_cases.append(out)

frame = dict(FRAME)
frame.update({
    "id": "H-FRAME-OS / R-FRAME-OS",
    "omega": omegas, "modes": N_MODES,
    "harmonic": {"damping": {"ratio": ZETA, "frequencies": [omegas[0] / TWO_PI, omegas[2] / TWO_PI]},
                 "a0": a0, "a1": a1, "responses": harmonic, "tolerance": 1e-6},
    "spectrum": {"cases": spectrum_cases, "tolerance": 1e-6},
})

generator = hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest()
oracle = {
    "formulation": "docs/formulations/response.md (response-v1)",
    "generator": "tools/oracles/response_oracle.py",
    "generatorSha256": generator,
    "opensees": {"package": "openseespy", "version": ops.version(), "element": "elasticBeamColumn",
                 "matrices": "GimmeMCK + FullGeneral printA", "eigen": "-fullGenLapack"},
    "units": "SI (N, m, s, kg); Sa in m/s^2; harmonic amplitudes [re, im]",
    "spectrum": {"points": SPECTRUM, "dampingRatio": ZETA},
    "sdof": sdof,
    "shearFrame": shear,
    "spatialFrame": frame,
    "failures": failures,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(oracle, f, indent=2)
    f.write("\n")
print(json.dumps({"failures": failures, "omega": omegas[:4], "neq": NEQ}, indent=1))
sys.exit(1 if failures else 0)
