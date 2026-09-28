#!/usr/bin/env python3
"""Independent stability oracle (M09-A, stability-v1).

Closed forms and the beam-column differential equation give elastic critical
loads; OpenSees gives the second-order portal response. Nothing here imports
the Rust kernel. Run with tools/oracle-env/bin/python (openseespy pinned in
tools/oracle-requirements.txt).

Writes fixtures/stability/stability-oracle.json. Exits 1 if any internal
consistency check fails (limits of the characteristic equation, agreement of
the two OpenSees transformations, amplification against the analytic factor).
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "fixtures/stability/stability-oracle.json")

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


# --- Euler struts --------------------------------------------------------
# kL roots of each end condition's characteristic equation (Timoshenko & Gere).
E = 210e9
NU = 0.3
L = 5.0
IZ = 8.356e-5
IY = 6.038e-6
A = 5.381e-3
J = 2.01e-7

# fixed-pinned: tan(kL) = kL, root in (pi, 3pi/2)
kl_fixed_pinned = bisect(lambda x: math.tan(x) - x, math.pi + 1e-9, 1.5 * math.pi - 1e-9)
check(abs(kl_fixed_pinned - 4.493409457909064) < 1e-12, "fixed-pinned root")
EULER_KL = {
    "pinnedPinned": math.pi,
    "fixedFree": math.pi / 2,
    "fixedFixed": 2 * math.pi,
    "fixedPinned": kl_fixed_pinned,
}
euler = []
for i, (ends, kl) in enumerate(EULER_KL.items(), start=1):
    euler.append({
        "id": f"S-EUL-{i}",
        "ends": ends,
        "L": L, "E": E, "nu": NU, "A": A, "Iy": IY, "Iz": IZ, "J": J,
        "bendingPlane": "weak (Iy) and strong (Iz) both reported",
        "kL": kl,
        "PcrWeak": kl ** 2 * E * IY / L ** 2,
        "PcrStrong": kl ** 2 * E * IZ / L ** 2,
        "effectiveLengthFactor": math.pi / kl,
    })

# --- Fixed-base portal, sway buckling ------------------------------------
# Columns h, EIc; beam span b, EIb; equal vertical loads P at both column tops.
# Antisymmetric sway: each column is fixed at the base and its top rotation is
# resisted by kb = 6 EIb / b. With EI v'''' + P v'' = 0, v(0)=v'(0)=0, zero
# storey shear at bifurcation and EI v''(h) = -kb v'(h):
#     EI k cos(kh) + kb sin(kh) = 0,  k^2 = P / (EI),  kh in (pi/2, pi).
# Columns are axially near-rigid (large A) as the ODE assumes.
H = 3.0
B = 4.0
EIC = E * 8.356e-5
EIB = E * 1.943e-4
A_RIGID = 1.0


def portal_pcr(EIc, EIb, h, b):
    kb = 6 * EIb / b
    f = lambda kh: EIc * (kh / h) * math.cos(kh) + kb * math.sin(kh)
    kh = bisect(f, math.pi / 2 + 1e-12, math.pi - 1e-12)
    return kh, (kh / h) ** 2 * EIc


kh, pcr = portal_pcr(EIC, EIB, H, B)
# Limits: stiff beam -> fixed-fixed sway (kh -> pi); flexible beam -> cantilever.
check(abs(portal_pcr(EIC, EIB * 1e9, H, B)[0] - math.pi) < 1e-6, "stiff-beam limit")
check(abs(portal_pcr(EIC, EIB * 1e-9, H, B)[0] - math.pi / 2) < 1e-6, "flexible-beam limit")
portal = {
    "id": "S-POR-BUCK",
    "geometry": {"h": H, "b": B, "base": "fixed", "mode": "planar XZ"},
    "material": {"E": E, "nu": NU},
    "column": {"A": A_RIGID, "I": EIC / E, "note": "axially near-rigid, matching the ODE"},
    "beam": {"A": A_RIGID, "I": EIB / E},
    "load": "equal vertical point loads P at both column tops (-Z)",
    "kh": kh,
    "PcrPerColumn": pcr,
    "effectiveLengthFactor": math.pi / kh,
}

# --- Second-order portal response (OpenSees) -----------------------------
import openseespy.opensees as ops

SUB = 32


def opensees_portal(P, Hx, transf, sub=None):
    sub = sub or SUB
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 3)
    tag = [0]

    def node(x, z):
        tag[0] += 1
        ops.node(tag[0], x, z)
        return tag[0]

    ops.geomTransf(transf, 1)
    base_l = node(0.0, 0.0)
    base_r = node(B, 0.0)
    ops.fix(base_l, 1, 1, 1)
    ops.fix(base_r, 1, 1, 1)
    top_l = node(0.0, H)
    top_r = node(B, H)
    eid = [0]

    def chain(n0, n1, x0, z0, x1, z1, I):
        prev = n0
        mids = []
        for s in range(1, sub + 1):
            t = s / sub
            nxt = n1 if s == sub else node(x0 + t * (x1 - x0), z0 + t * (z1 - z0))
            eid[0] += 1
            ops.element("elasticBeamColumn", eid[0], prev, nxt, A_RIGID, E, I, 1)
            mids.append(nxt)
            prev = nxt
        return mids

    chain(base_l, top_l, 0.0, 0.0, 0.0, H, EIC / E)
    chain(base_r, top_r, B, 0.0, B, H, EIC / E)
    chain(top_l, top_r, 0.0, H, B, H, EIB / E)
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    ops.load(top_l, Hx, -P, 0.0)
    ops.load(top_r, 0.0, -P, 0.0)
    ops.system("FullGeneral")
    ops.numberer("Plain")
    ops.constraints("Plain")
    ops.test("NormDispIncr", 1e-12, 100)
    ops.algorithm("Newton")
    steps = 100
    ops.integrator("LoadControl", 1.0 / steps)
    ops.analysis("Static")
    ok = ops.analyze(steps)
    if ok != 0:
        return None
    ops.reactions()
    return {
        "swayTopLeft": ops.nodeDisp(top_l, 1),
        "swayTopRight": ops.nodeDisp(top_r, 1),
        "baseMomentLeft": ops.nodeReaction(base_l, 3),
        "baseMomentRight": ops.nodeReaction(base_r, 3),
        "baseShearLeft": ops.nodeReaction(base_l, 1),
        "baseShearRight": ops.nodeReaction(base_r, 1),
    }


# Exact linearised (small-rotation) response of the laterally loaded portal.
# Beam axially rigid, so each column takes F = H/2 at its top (antisymmetric
# half). With k^2 = P/EI and constant storey shear, EI v''' + P v' = -F:
#   v = A + Bx + C cos kx + D sin kx,  v(0) = 0 -> C = -A,
#   v'(0) = 0 -> D = -B/k,  shear -> B = -F/P,
#   top: EI v''(h) = -kb v'(h) -> A (below).  Sway = v(h); base moment EI v''(0).
# This is the same theory stability-v1 discretises, so it is the primary
# reference; OpenSees PDelta must reproduce it, corotational is a cross-check.
def portal_exact(P, F, EIc=EIC, EIb=EIB, h=H, b=B):
    kb = 6 * EIb / b
    k = math.sqrt(P / EIc)
    Bc = -F / P
    D = F / (P * k)
    s, c = math.sin(k * h), math.cos(k * h)
    A_ = (EIc * D * k * k * s - kb * (Bc + D * k * c)) / (k * (EIc * k * c + kb * s))
    sway = A_ * (1 - c) + Bc * h + D * s
    base_moment = EIc * A_ * k * k  # internal moment EI v''(0)
    return sway, base_moment


H_LATERAL = 1.0e3  # N: small drift, so large-rotation effects stay minor
lin = opensees_portal(0.0, H_LATERAL, "Linear")
sway_lin = 0.5 * (lin["swayTopLeft"] + lin["swayTopRight"])
# The P -> 0 limit of the exact solution is the first-order frame.
sway0, _ = portal_exact(1e-9 * pcr, H_LATERAL / 2)
# Columns have A = 1 m2, not infinite: overturning axial strain differs from
# the rigid-axis ODE by about I/(A h^2) ~ 1e-5.
check(abs(sway0 / sway_lin - 1) < 1e-4, f"exact P->0 limit {sway0} vs first order {sway_lin}")
second = []
for ratio in (0.2, 0.5, 0.8, 0.99):
    P = ratio * pcr
    cor = opensees_portal(P, H_LATERAL, "Corotational")
    pd = opensees_portal(P, H_LATERAL, "PDelta")
    pd2 = opensees_portal(P, H_LATERAL, "PDelta", 2 * SUB)
    sway, base_m = portal_exact(P, H_LATERAL / 2)
    cid = "S-NEAR" if ratio == 0.99 else f"S-POR-PD-{int(round(ratio * 100)):03d}"
    case = {
        "id": cid,
        "loadRatio": ratio,
        "PPerColumn": P,
        "HAtTopLeft": H_LATERAL,
        "exact": {"sway": sway, "baseMomentMagnitude": abs(base_m),
                  "amplification": sway / sway_lin},
        "opensees": {"pDelta": pd, "corotational": cor,
                     "momentSign": "reaction about global Y = -OpenSees 2D reaction (2D rotation axis X x Z = -Y)"},
    }
    if cor and pd and pd2:
        # PDelta carries chord (string) geometric stiffness only, so its error
        # is O(1/n^2) and is magnified near critical by about r/(1-r).
        # Richardson extrapolation from n and 2n removes the leading term.
        rich = lambda a, b: (4 * b - a) / 3
        sway_of = lambda r: 0.5 * (r["swayTopLeft"] + r["swayTopRight"])
        mom_of = lambda r: 0.5 * (abs(r["baseMomentLeft"]) + abs(r["baseMomentRight"]))
        sway_p = rich(sway_of(pd), sway_of(pd2))
        m_p = rich(mom_of(pd), mom_of(pd2))
        sway_c = sway_of(cor)
        case["opensees"]["pDelta2n"] = pd2
        case["opensees"]["pDeltaRichardson"] = {"sway": sway_p, "baseMomentMagnitude": m_p}
        tol = 1e-3 if ratio <= 0.8 else 1e-2
        check(abs(sway_p / sway - 1) < tol, f"{cid} OpenSees PDelta (Richardson) sway {sway_p} vs exact {sway}")
        check(abs(m_p / abs(base_m) - 1) < tol, f"{cid} OpenSees PDelta base moment {m_p} vs exact {abs(base_m)}")
        case["opensees"]["pDeltaVsExact"] = sway_p / sway - 1
        case["opensees"]["baseMomentPDeltaVsExact"] = m_p / abs(base_m) - 1
        case["opensees"]["corotationalVsExact"] = sway_c / sway - 1
    else:
        check(False, f"{cid} OpenSees did not converge")
    second.append(case)
check(second[-1]["exact"]["amplification"] >= 10, "S-NEAR amplification >= 10")

out = {
    "formulation": "docs/formulations/stability.md (stability-v1)",
    "generator": "tools/oracles/stability_oracle.py",
    "generatorSha256": hashlib.sha256(open(__file__, "rb").read()).hexdigest(),
    "opensees": {"package": "openseespy", "version": ops.version() if hasattr(ops, "version") else "3.7.1.2 (pinned)",
                 "elementsPerMember": [SUB, 2 * SUB], "transformations": ["Corotational", "PDelta"],
                 "extrapolation": "Richardson (4 f_2n - f_n)/3 on PDelta",
                 "solution": "LoadControl 100 steps, Newton, NormDispIncr 1e-12"},
    "units": "SI (N, m, Pa)",
    "euler": euler,
    "portalBuckling": portal,
    "firstOrderSwayUnderH": {"H": H_LATERAL, "sway": sway_lin, "opensees": lin},
    "secondOrder": second,
    "overCritical": {"id": "S-OVER", "loadRatio": 1.01, "PPerColumn": 1.01 * pcr,
                     "expected": "NONCONVERGED / TANGENT_NOT_POSITIVE_DEFINITE, no buffers"},
    "failures": failures,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=2)
    f.write("\n")
print(json.dumps({"portalPcr": pcr, "kh": kh,
                  "exact": [c["exact"] for c in second],
                  "pDeltaVsExact": [c["opensees"].get("pDeltaVsExact") for c in second],
                  "momentPDeltaVsExact": [c["opensees"].get("baseMomentPDeltaVsExact") for c in second],
                  "corotationalVsExact": [c["opensees"].get("corotationalVsExact") for c in second],
                  "failures": failures}, indent=1))
sys.exit(1 if failures else 0)
