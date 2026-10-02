#!/usr/bin/env python3
"""Independent pad footing oracle (M11, ADR 0028).

Pure Python; never imports the Rust kernel. Two parts:

1. Ground contact under a rigid base on tensionless ground, by a different
   method from the kernel's Newton iteration: closed forms where they exist
   (full contact; uniaxial partial contact, the triangle q_max = 2N/(3 B c)),
   and for biaxial partial contact a strip integration (4000 midpoint
   strips in x, each integrated exactly in y) with a bisection search on the
   neutral axis offset and a fixed-point rotation of its direction, accurate
   to the strip width (relative 1e-6).
2. JRC89037 4.2.1 footing B-2 (EN 1992-1-1 9.8.2.2): the tie force Fs(x), its
   maximum, the required steel and the straight-bar anchorage at x_min = h/2,
   from the report's own effective pressure.

Writes fixtures/design/ec2-uk-na/footing.reconciliation.json; exits 1 on any
disagreement.
"""
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PUBLISHED = os.path.join(ROOT, "fixtures/design/ec2-uk-na/jrc-footing-b2.published.json")
OUT = os.path.join(ROOT, "fixtures/design/ec2-uk-na/footing.reconciliation.json")
UK = {"gammaC": 1.5, "gammaS": 1.15, "alphaCC": 0.85, "CRdc": 0.18 / 1.5, "k1": 0.15}


def grid_resultants(L, B, p0, px, py, n=4000):
    """∫q, ∫qx, ∫qy for q = max(0, p0 + px x + py y): midpoint strips in x,
    each integrated exactly in y over the part where q > 0."""
    dx = L / n
    s = sx = sy = 0.0
    for i in range(n):
        x = -L / 2 + (i + 0.5) * dx
        c = p0 + px * x
        lo, hi = -B / 2, B / 2
        if py > 0:
            lo = max(lo, -c / py)
        elif py < 0:
            hi = min(hi, -c / py)
        elif c <= 0:
            continue
        if hi <= lo:
            continue
        # ∫(c + py y) dy and ∫(c + py y) y dy over [lo, hi].
        i0 = c * (hi - lo) + py * (hi ** 2 - lo ** 2) / 2
        i1 = c * (hi ** 2 - lo ** 2) / 2 + py * (hi ** 3 - lo ** 3) / 3
        s += i0
        sx += i0 * x
        sy += i1
    return s * dx, sx * dx, sy * dx


def full_contact(L, B, N, ex, ey):
    return N / (L * B), 12 * N * ex / (B * L ** 3), 12 * N * ey / (L * B ** 3)


def uniaxial_partial(L, B, N, ex):
    """Triangle: contact length 3c with c = L/2 − e; q_max = 2N/(3Bc)."""
    c = L / 2 - abs(ex)
    return 2 * N / (3 * B * c), 3 * c


def biaxial_by_search(L, B, N, ex, ey, n=2000):
    """Neutral-axis search for biaxial partial contact. For a normal angle θ
    the unit plane is q = max(0, t − (x cos θ + y sin θ)); an inner bisection
    on t puts the contact centroid's projection on the load direction at |e|,
    and an outer bisection on θ drives its perpendicular offset to zero.
    Both are monotonic in the partial-contact range, so bisection is robust."""
    e = math.hypot(ex, ey)
    ux, uy = ex / e, ey / e

    def centroid(theta, t):
        c, s = math.cos(theta), math.sin(theta)
        R, Rx, Ry = grid_resultants(L, B, t, -c, -s, n)
        if R <= 0:
            return 0.0, None
        return R, (Rx / R, Ry / R)

    def fit_offset(theta):
        c, s = math.cos(theta), math.sin(theta)
        pc = [c * sx * L / 2 + s * sy * B / 2 for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
        lo, hi = min(pc), max(pc) + 10 * max(L, B)
        for _ in range(70):
            t = (lo + hi) / 2
            R, g = centroid(theta, t)
            proj = math.inf if g is None else g[0] * ux + g[1] * uy
            if proj > e:
                lo = t
            else:
                hi = t
        R, g = centroid(theta, (lo + hi) / 2)
        return (lo + hi) / 2, R, g

    def perp(theta):
        t, R, g = fit_offset(theta)
        return g[0] * (-uy) + g[1] * ux, t, R

    base = math.atan2(ey, ex) + math.pi
    a, b = base - 1.2, base + 1.2
    fa = perp(a)[0]
    for _ in range(50):
        m = (a + b) / 2
        fm, t, R = perp(m)
        if (fm > 0) == (fa > 0):
            a, fa = m, fm
        else:
            b = m
    theta = (a + b) / 2
    _, t, R = perp(theta)
    k = N / R
    c, s = math.cos(theta), math.sin(theta)
    return k * t, -k * c, -k * s


def corners(L, B, p0, px, py):
    return [max(0.0, p0 + px * sx * L / 2 + py * sy * B / 2) for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]


CONTACT = [
    {"id": "CENTRED", "L": 2.4, "B": 2.1, "N": 1.2e6, "ex": 0.0, "ey": 0.0},
    {"id": "UNIAXIAL-IN-KERN", "L": 2.4, "B": 2.1, "N": 1.2e6, "ex": 0.3, "ey": 0.0},
    {"id": "UNIAXIAL-KERN-EDGE", "L": 2.4, "B": 2.1, "N": 1.2e6, "ex": 0.4, "ey": 0.0},
    {"id": "UNIAXIAL-PARTIAL", "L": 2.4, "B": 2.1, "N": 1.2e6, "ex": 0.7, "ey": 0.0},
    {"id": "BIAXIAL-IN-KERN", "L": 2.4, "B": 2.1, "N": 1.2e6, "ex": 0.15, "ey": 0.12},
    {"id": "BIAXIAL-PARTIAL", "L": 2.4, "B": 2.1, "N": 1.2e6, "ex": 0.45, "ey": 0.35},
]


def contact_case(c):
    L, B, N, ex, ey = c["L"], c["B"], c["N"], c["ex"], c["ey"]
    p0, px, py = full_contact(L, B, N, ex, ey)
    raw = [p0 + px * sx * L / 2 + py * sy * B / 2 for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    if min(raw) >= -1e-9 * N / (L * B):
        return {"state": "full", "corners": corners(L, B, p0, px, py), "method": "closed form",
                "tolerance": 1e-12}
    if ey == 0:
        qmax, length = uniaxial_partial(L, B, N, ex)
        q = [0.0, qmax, qmax, 0.0] if ex > 0 else [qmax, 0.0, 0.0, qmax]
        return {"state": "partial", "corners": q, "contactLength": length, "method": "closed form triangle",
                "tolerance": 1e-12}
    p0, px, py = biaxial_by_search(L, B, N, ex, ey)
    R, Rx, Ry = grid_resultants(L, B, p0, px, py)
    return {"state": "partial", "corners": corners(L, B, p0, px, py), "method": "strip integration search",
            "gridCheck": {"N": R, "ex": Rx / R, "ey": Ry / R}, "tolerance": 1e-5}


def jrc(pub):
    i = pub["inputs"]
    sigma = i["sigmaEffective"] * 1e3  # Pa
    b, a, d = i["b"], i["a"], i["d"]
    # The report prints z_i = 0.9 d = 662 mm and computes with that value.
    zi = i["zi"]
    fyd = i["fyk"] / i["gammaS"]
    edge_to_n = b / 2 - 0.35 * a

    def fs(x):
        return sigma * b * x * (edge_to_n - x / 2) / zi

    xs = edge_to_n
    out = {"zi": zi, "FsMax": fs(xs), "xAtMax": xs, "AsRequired": fs(xs) / fyd,
           "FsAtXmin": fs(i["h"] / 2)}
    as16 = 17 * math.pi * 0.016 ** 2 / 4
    out["lbRequiredPhi16"] = i["lbdPhi16"] * out["FsAtXmin"] / (as16 * fyd)
    return out


def main():
    failures = []
    pub = json.load(open(PUBLISHED))
    contacts = []
    for c in CONTACT:
        r = contact_case(c)
        if "gridCheck" in r:
            g = r["gridCheck"]
            if abs(g["N"] / c["N"] - 1) > 1e-6 or abs(g["ex"] - c["ex"]) > 1e-6 or abs(g["ey"] - c["ey"]) > 1e-6:
                failures.append(f"{c['id']} grid check {g}")
        contacts.append({"input": c, **r})
    j = jrc(pub)
    p = pub["published"]
    for key in ["FsMax", "AsRequired", "FsAtXmin", "lbRequiredPhi16"]:
        want = p[key]
        if abs(j[key] * want["scale"] - want["value"]) > want["rounding"]:
            failures.append(f"JRC {key}: {j[key] * want['scale']} vs {want['value']}")
    out = {
        "fixtureVersion": 1,
        "published": os.path.relpath(PUBLISHED, ROOT),
        "publishedSha256": hashlib.sha256(open(PUBLISHED, "rb").read()).hexdigest(),
        "oracle": os.path.relpath(__file__, ROOT),
        "oracleSha256": hashlib.sha256(open(__file__, "rb").read()).hexdigest(),
        "python": sys.version.split()[0],
        "contact": contacts,
        "jrc": j,
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
