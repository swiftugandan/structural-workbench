"""Independent oracle for the biaxial RC column section (docs/formulations/rc-column.md).

Pure Python, no numerical libraries, no import of the Rust kernel.

- Reference resultants: the rectangular-block zone and the parabola-rectangle
  plateau are convex polygons (rectangle clipped by strain half-planes) and are
  integrated exactly by the shoelace formulas; the parabolic zone is integrated
  across the strain gradient by composite Gauss-Legendre quadrature on chords
  of the rectangle (the kernel instead integrates u^n analytically).
- Fibre model: an N x N midpoint grid of concrete fibres, the same laws, bars
  as points with displaced concrete. Run at 400 and 800 to measure its own
  discretisation error.
- Closed forms: squash load, tension limit and the uniaxial rectangular-block
  balanced point by hand algebra.
- Capacity M_Rd(N, theta): the Figure 6.1 pivot domain written out
  independently, Brent's method on N and on the moment direction, a 10 degree
  scan of neutral-axis angles for the direction brackets.

Writes fixtures/column/column-oracle.json.
"""
import hashlib, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "fixtures", "column", "column-oracle.json")
failures = []


def check(cond, text):
    if not cond:
        failures.append(text)
        print("FAIL:", text)


# --- quadrature -------------------------------------------------------------

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
    return list(zip(nodes, weights))


GL = gauss_legendre(8)


# --- laws -------------------------------------------------------------------

def concrete_stress(law, e):
    if e <= 0:
        return 0.0
    if law["kind"] == "rectangularBlock":
        return law["intensity"] if e > (1 - law["depthRatio"]) * law["ultimateStrain"] else 0.0
    f, e2, n = law["peak"], law["strainAtPeak"], law["exponent"]
    if e >= e2:
        return f
    return f * (1 - (1 - e / e2) ** n)


def steel_stress(st, e):
    return max(-st["yieldStrength"], min(st["yieldStrength"], st["modulus"] * e))


# --- geometry ---------------------------------------------------------------

def corners(sec):
    b, h = sec["width"] / 2, sec["depth"] / 2
    return [(-b, -h), (b, -h), (b, h), (-b, h)]


def clip(poly, n, c):
    """Part of a convex polygon with n.p >= c (Sutherland-Hodgman, one edge)."""
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        fp = n[0] * p[0] + n[1] * p[1] - c
        fq = n[0] * q[0] + n[1] * q[1] - c
        if fp >= 0:
            out.append(p)
        if (fp >= 0) != (fq >= 0):
            t = fp / (fp - fq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out


def shoelace(poly):
    """(area, integral of y, integral of z) of a simple polygon."""
    a = sy = sz = 0.0
    for i in range(len(poly)):
        (y0, z0), (y1, z1) = poly[i], poly[(i + 1) % len(poly)]
        cr = y0 * z1 - y1 * z0
        a += cr
        sy += (y0 + y1) * cr
        sz += (z0 + z1) * cr
    return a / 2, sy / 6, sz / 6


def chord(sec, n, u):
    """Length and first moments of the chord n.p = u inside the rectangle."""
    b, h = sec["width"] / 2, sec["depth"] / 2
    t = (-n[1], n[0])
    lo, hi = -math.inf, math.inf
    for base, dirn, half in ((u * n[0], t[0], b), (u * n[1], t[1], h)):
        if abs(dirn) < 1e-300:
            if abs(base) > half:
                return 0.0, 0.0, 0.0
            continue
        a1, a2 = (-half - base) / dirn, (half - base) / dirn
        lo, hi = max(lo, min(a1, a2)), min(hi, max(a1, a2))
    if hi <= lo:
        return 0.0, 0.0, 0.0
    w = hi - lo
    mid = (hi + lo) / 2
    return w, w * (u * n[0] + mid * t[0]), w * (u * n[1] + mid * t[1])


def strip_integral(sec, n, sig, u_lo, u_hi, sub):
    """Integral of sig(u) * [w, y, z] over u_lo..u_hi, panels split at corners
    and graded geometrically towards u_hi (the strain e_c2 end, where
    (1 - e/e_c2)^n is not smooth for non-integer n)."""
    if u_hi <= u_lo:
        return [0.0, 0.0, 0.0]
    graded = {u_hi - (u_hi - u_lo) * 0.2 ** k for k in range(1, 40)}
    cuts = sorted({u_lo, u_hi} | graded | {n[0] * y + n[1] * z for y, z in corners(sec) if u_lo < n[0] * y + n[1] * z < u_hi})
    total = [0.0, 0.0, 0.0]
    for a, b in zip(cuts, cuts[1:]):
        for k in range(sub):
            lo, hi = a + (b - a) * k / sub, a + (b - a) * (k + 1) / sub
            half, mid = (hi - lo) / 2, (hi + lo) / 2
            for x, wgt in GL:
                u = mid + half * x
                s = sig(u)
                if s == 0.0:
                    continue
                c = chord(sec, n, u)
                for i in range(3):
                    total[i] += half * wgt * s * c[i]
    return total


def concrete_reference(sec, law, plane, sub=2):
    """Exact (polygon) / quadrature (parabola zone) concrete resultants."""
    e0, ky, kz = plane["e0"], plane["ky"], plane["kz"]
    k = math.hypot(ky, kz)
    if k == 0.0:
        s = concrete_stress(law, e0)
        return [s * sec["width"] * sec["depth"], 0.0, 0.0]
    n = (ky / k, kz / k)
    rect = corners(sec)
    u_of = lambda e: (e - e0) / k  # strain e on the line n.p = u_of(e)
    if law["kind"] == "rectangularBlock":
        thr = (1 - law["depthRatio"]) * law["ultimateStrain"]
        poly = clip(rect, n, u_of(thr))
        a, sy, sz = shoelace(poly) if len(poly) >= 3 else (0.0, 0.0, 0.0)
        I = law["intensity"]
        # strictly above the threshold; the boundary line has zero area.
        return [I * a, I * sy, I * sz]
    f, e2 = law["peak"], law["strainAtPeak"]
    poly = clip(rect, n, u_of(e2))
    a, sy, sz = shoelace(poly) if len(poly) >= 3 else (0.0, 0.0, 0.0)
    plateau = [f * a, f * sy, f * sz]
    us = [n[0] * y + n[1] * z for y, z in rect]
    lo, hi = max(min(us), u_of(0.0)), min(max(us), u_of(e2))
    zone = strip_integral(sec, n, lambda u: concrete_stress(law, e0 + k * u), lo, hi, sub)
    return [plateau[i] + zone[i] for i in range(3)]


def disc_in_block(r, delta):
    """Area and centroid offset of the part t > delta of a disc of radius r,
    t along the strain gradient: t = r sin(phi) turns the chord integrals into
    smooth trigonometric ones, integrated by composite Gauss-Legendre."""
    if delta >= r:
        return 0.0, 0.0
    if delta <= -r:
        return math.pi * r * r, 0.0
    lo, hi = math.asin(delta / r), math.pi / 2
    area = moment = 0.0
    for k in range(8):
        a, b = lo + (hi - lo) * k / 8, lo + (hi - lo) * (k + 1) / 8
        half, mid = (b - a) / 2, (b + a) / 2
        for x, w in GL:
            phi = mid + half * x
            c = math.cos(phi)
            area += half * w * 2 * r * r * c * c
            moment += half * w * 2 * r ** 3 * math.sin(phi) * c * c
    return area, (moment / area if area > 0 else 0.0)


def bars_force(sec, law, steel, plane):
    """Bars as points for steel; displaced concrete at the bar centre for the
    parabola law, over the disc of the bar's area for the block law."""
    t = [0.0, 0.0, 0.0]
    k = math.hypot(plane["ky"], plane["kz"])
    for bar in sec["bars"]:
        e = plane["e0"] + plane["ky"] * bar["y"] + plane["kz"] * bar["z"]
        S = bar["area"] * steel_stress(steel, e)
        cy, cz = bar["y"], bar["z"]
        if law["kind"] == "rectangularBlock":
            thr = (1 - law["depthRatio"]) * law["ultimateStrain"]
            if k == 0.0:
                C = law["intensity"] * bar["area"] if e > thr else 0.0
            else:
                r = math.sqrt(bar["area"] / math.pi)
                seg, off = disc_in_block(r, (thr - e) / k)
                C = law["intensity"] * seg
                cy, cz = cy + off * plane["ky"] / k, cz + off * plane["kz"] / k
        else:
            C = bar["area"] * concrete_stress(law, e)
        t[0] += S - C
        t[1] += S * bar["y"] - C * cy
        t[2] += S * bar["z"] - C * cz
    return t


def to_resultants(q):
    """[N, integral sigma y, integral sigma z] -> N, My = -Qz, Mz = Qy."""
    return {"n": q[0], "my": -q[2], "mz": q[1]}


def reference(cfg, plane, sub=2):
    sec, law, steel = cfg["section"], cfg["concrete"], cfg["steel"]
    c = concrete_reference(sec, law, plane, sub)
    s = bars_force(sec, law, steel, plane)
    return to_resultants([c[i] + s[i] for i in range(3)])


def fibre(cfg, plane, m):
    sec, law, steel = cfg["section"], cfg["concrete"], cfg["steel"]
    b, h = sec["width"], sec["depth"]
    dy, dz = b / m, h / m
    da = dy * dz
    N = Sy = Sz = 0.0
    e0, ky, kz = plane["e0"], plane["ky"], plane["kz"]
    for j in range(m):
        z = -h / 2 + (j + 0.5) * dz
        base = e0 + kz * z
        rowN = rowY = 0.0
        for i in range(m):
            y = -b / 2 + (i + 0.5) * dy
            s = concrete_stress(law, base + ky * y)
            if s:
                rowN += s
                rowY += s * y
        N += rowN * da
        Sy += rowY * da
        Sz += rowN * da * z
    s = bars_force(sec, law, steel, plane)
    return to_resultants([N + s[0], Sy + s[1], Sz + s[2]])


def fibre_bound(cfg, plane, f400, f800):
    """Error bound of the 800 x 800 fibre result.

    Parabola-rectangle: the stress is continuous, the midpoint rule converges
    at O(h^2) (observed factor ~4 per halving), so |f800 - f400| bounds the
    f800 error with a margin of about 3.
    Both carry a summation-roundoff allowance of 1e-12 of the section's
    concrete resultant scale.
    Rectangular block: the stress jumps on the threshold line, the midpoint
    rule is O(h) and not monotone. Only cells cut by that line are
    misassigned, at most a whole cell each; a segment of length L crosses at
    most L (1/dy + 1/dz) + 1 cells, so |error N| <= I (L (dy + dz) + dy dz)
    and each moment error <= that times the largest distance to the centre.
    """
    sec, law = cfg["section"], cfg["concrete"]
    b, h = sec["width"], sec["depth"]
    r = math.hypot(b, h) / 2
    # Summation roundoff over 640 000 fibres.
    ro = 1e-12 * law.get("intensity", law.get("peak")) * b * h
    rounding = {"n": ro, "my": ro * r, "mz": ro * r}
    if law["kind"] != "rectangularBlock":
        return {k: abs(f800[k] - f400[k]) + rounding[k] for k in ("n", "my", "mz")}, "richardsonTwoGrid"
    dy, dz = b / 800, h / 800
    k = math.hypot(plane["ky"], plane["kz"])
    length = 0.0
    if k > 0:
        n = (plane["ky"] / k, plane["kz"] / k)
        thr = (1 - law["depthRatio"]) * law["ultimateStrain"]
        length = chord(sec, n, (thr - plane["e0"]) / k)[0]
    en = law["intensity"] * (length * (dy + dz) + dy * dz) if length > 0 else 0.0
    return {"n": en + rounding["n"], "my": en * r + rounding["my"], "mz": en * r + rounding["mz"]}, "cutCells"


# --- ultimate strain domain (EN 1992-1-1:2004, 6.1, Figure 6.1) ---------------

def domain_plane(cfg, alpha, tau):
    sec, law, lim = cfg["section"], cfg["concrete"], cfg["limits"]
    ecu, ec, eud = law["ultimateStrain"], lim["fullCompressionStrain"], lim.get("steelStrainLimit")
    n = (math.cos(alpha), math.sin(alpha))
    us = [n[0] * y + n[1] * z for y, z in corners(sec)]
    top, H = max(us), max(us) - min(us)
    d = max(top - (n[0] * bar["y"] + n[1] * bar["z"]) for bar in sec["bars"])
    if tau < 1:
        e_top = -eud + tau * (ecu + eud)
        kap = (e_top + eud) / d
    elif tau <= 2:
        xab = ecu * d / (ecu + eud) if eud is not None else 0.0
        x = xab + (tau - 1) * (H - xab)
        e_top, kap = ecu, ecu / x
    else:
        sc = (1 - ec / ecu) * H
        eb = (tau - 2) * ec
        kap = (ec - eb) / (H - sc)
        e_top = ec + kap * sc
    return {"e0": e_top - kap * top, "ky": kap * n[0], "kz": kap * n[1]}


def brent(f, a, b, tol=0.0):
    fa, fb = f(a), f(b)
    assert fa * fb <= 0, (a, b, fa, fb)
    if fa == 0:
        return a
    if fb == 0:
        return b
    c, fc, d = a, fa, b - a
    e = d
    for _ in range(300):
        if fb * fc > 0:
            c, fc, d = a, fa, b - a
            e = d
        if abs(fc) < abs(fb):
            a, b, c, fa, fb, fc = b, c, b, fb, fc, fb
        t = 2 * sys.float_info.epsilon * abs(b) + tol
        m = (c - b) / 2
        if abs(m) <= t or fb == 0:
            return b
        if abs(e) >= t and abs(fa) > abs(fb):
            s = fb / fa
            if a == c:
                p, q = 2 * m * s, 1 - s
            else:
                q, r = fa / fc, fb / fc
                p = s * (2 * m * q * (q - r) - (b - a) * (r - 1))
                q = (q - 1) * (r - 1) * (s - 1)
            if p > 0:
                q = -q
            else:
                p = -p
            if 2 * p < min(3 * m * q - abs(t * q), abs(e * q)):
                e, d = d, p / q
            else:
                d, e = m, m
        else:
            d, e = m, m
        a, fa = b, fb
        b += d if abs(d) > t else (t if m > 0 else -t)
        fb = f(b)
    return b


def wrap(x):
    while x > math.pi:
        x -= 2 * math.pi
    while x <= -math.pi:
        x += 2 * math.pi
    return x


def tau_low(cfg):
    return 0.0 if cfg["limits"].get("steelStrainLimit") is not None else 1 + 1e-9


def at_angle(cfg, n_ed, alpha):
    """N need not be monotone along the domain (pivot C with unequal faces):
    solve every sign change over 16 samples per pivot branch and keep the
    plane with the largest moment."""
    g = lambda tau: reference(cfg, domain_plane(cfg, alpha, tau))["n"] - n_ed
    lo = tau_low(cfg)
    branches = [(0.0, 1.0), (1.0, 2.0), (2.0, 3.0)] if lo == 0.0 else [(lo, 2.0), (2.0, 3.0)]
    taus = [a + (b - a) * k / 16 for a, b in branches for k in range(16)] + [3.0]
    vals = [g(t) for t in taus]
    best = None
    for (t0, g0), (t1, g1) in zip(zip(taus, vals), zip(taus[1:], vals[1:])):
        if g0 == 0:
            t = t0
        elif g0 * g1 < 0:
            t = brent(g, t0, t1)
        else:
            continue
        r = reference(cfg, domain_plane(cfg, alpha, t))
        if best is None or math.hypot(r["my"], r["mz"]) > math.hypot(best[1]["my"], best[1]["mz"]):
            best = (t, r)
    if vals[-1] == 0:
        r = reference(cfg, domain_plane(cfg, alpha, 3.0))
        if best is None or math.hypot(r["my"], r["mz"]) > math.hypot(best[1]["my"], best[1]["mz"]):
            best = (3.0, r)
    assert best is not None, (n_ed, alpha)
    return best


def capacity(cfg, n_ed, theta):
    phi = lambda r: math.atan2(r["mz"], r["my"])
    scan = []
    for k in range(37):
        a = 2 * math.pi * k / 36
        scan.append((a, wrap(phi(at_angle(cfg, n_ed, a)[1]) - theta)))
    best = None
    for (a0, d0), (a1, d1) in zip(scan, scan[1:]):
        if d0 <= 0 < d1 and d1 - d0 < math.pi:
            a = brent(lambda x: wrap(phi(at_angle(cfg, n_ed, x)[1]) - theta), a0, a1)
            tau, r = at_angle(cfg, n_ed, a)
            m = math.hypot(r["my"], r["mz"])
            if best is None or m < best["mRd"]:
                best = {"mRd": m, "my": r["my"], "mz": r["mz"], "neutralAxisAngle": a % (2 * math.pi), "tau": tau,
                        "n": r["n"], "directionError": abs(wrap(phi(r) - theta))}
    return best


# --- cases --------------------------------------------------------------------

def bar(y, z, dia):
    return {"y": y, "z": z, "area": math.pi * dia * dia / 4}


SQUARE_BARS = [bar(y, z, 0.025) for y in (-0.15, 0.0, 0.15) for z in (-0.15, 0.0, 0.15) if (y, z) != (0.0, 0.0)]
STEEL = {"yieldStrength": 435e6, "modulus": 200e9}

CONFIGS = [
    {"id": "SQ-PARABOLA", "section": {"width": 0.4, "depth": 0.4, "bars": SQUARE_BARS},
     "concrete": {"kind": "parabolaRectangle", "peak": 17e6, "strainAtPeak": 0.002, "ultimateStrain": 0.0035, "exponent": 2.0},
     "steel": STEEL, "limits": {"fullCompressionStrain": 0.002}},
    {"id": "SQ-BLOCK", "section": {"width": 0.4, "depth": 0.4, "bars": SQUARE_BARS},
     "concrete": {"kind": "rectangularBlock", "intensity": 17e6, "depthRatio": 0.8, "ultimateStrain": 0.0035},
     "steel": STEEL, "limits": {"fullCompressionStrain": 0.00175}},
    {"id": "RECT-ASYM", "section": {"width": 0.3, "depth": 0.6, "bars": [
        bar(-0.1, 0.24, 0.020), bar(0.0, 0.24, 0.020), bar(0.1, 0.24, 0.020),
        bar(-0.1, -0.245, 0.016), bar(0.1, -0.245, 0.016), bar(0.1, 0.0, 0.012)]},
     "concrete": {"kind": "parabolaRectangle", "peak": 30e6, "strainAtPeak": 0.0022, "ultimateStrain": 0.0031, "exponent": 1.75},
     "steel": {"yieldStrength": 500e6, "modulus": 200e9}, "limits": {"fullCompressionStrain": 0.0022, "steelStrainLimit": 0.0225}},
]

# (alpha in degrees, tau) planes spanning pivots A, B and C.
PLANES = [(0.0, 1.35), (90.0, 1.8), (30.0, 1.5), (135.0, 1.05), (220.0, 2.4), (300.0, 2.95), (63.0, 1.97)]
PLANES_A = [(10.0, 0.4), (250.0, 0.85)]
FIBRE = {(30.0, 1.5), (220.0, 2.4), (10.0, 0.4)}
N_FRACTIONS = [(0.0, "zero"), (0.35, "squash"), (0.75, "squash"), (0.5, "tension")]
THETAS = [0.0, 37.0, 90.0, 200.0]


def closed_forms(cfg):
    sec, law, steel, lim = cfg["section"], cfg["concrete"], cfg["steel"], cfg["limits"]
    ec = lim["fullCompressionStrain"]
    sc = concrete_stress(law, ec)
    squash = sc * sec["width"] * sec["depth"] + sum(b["area"] * (steel_stress(steel, ec) - sc) for b in sec["bars"])
    eud = lim.get("steelStrainLimit")
    tension = sum(b["area"] * steel_stress(steel, -eud if eud is not None else -math.inf) for b in sec["bars"])
    out = {"squash": squash, "tension": tension, "tensionAttained": eud is not None}
    if law["kind"] == "rectangularBlock":
        # Uniaxial balanced point, compression on the +z face (alpha = 90 deg):
        # top strain e_cu, extreme tension bar at -f_y/E_s.
        h, b = sec["depth"], sec["width"]
        ecu, lam, I = law["ultimateStrain"], law["depthRatio"], law["intensity"]
        d = h / 2 - min(br["z"] for br in sec["bars"])
        ey = steel["yieldStrength"] / steel["modulus"]
        x = ecu * d / (ecu + ey)
        C = I * b * lam * x
        zc = h / 2 - lam * x / 2
        N, My, Mz = C, -C * zc, 0.0
        for br in sec["bars"]:
            # Hand algebra with point bars holds when no bar disc straddles
            # the block edge.
            check(abs((h / 2 - br["z"]) - lam * x) >= math.sqrt(br["area"] / math.pi), "balanced bar straddles the block edge")
            e = ecu * (1 - (h / 2 - br["z"]) / x)
            F = br["area"] * (steel_stress(steel, e) - (I if (h / 2 - br["z"]) < lam * x else 0.0))
            N += F
            My -= F * br["z"]
            Mz += F * br["y"]
        kap = ecu / x
        out["balanced"] = {"plane": {"e0": ecu - kap * h / 2, "ky": 0.0, "kz": kap},
                           "neutralAxisDepth": x, "n": N, "my": My, "mz": Mz}
    return out


def rel(a, b, scale):
    return abs(a - b) / scale


def main():
    out = []
    for cfg in CONFIGS:
        print(cfg["id"])
        cf = closed_forms(cfg)
        scale_n = max(abs(cf["squash"]), abs(cf["tension"]))
        # Closed forms against the reference integration.
        sq = reference(cfg, {"e0": cfg["limits"]["fullCompressionStrain"], "ky": 0.0, "kz": 0.0})
        check(rel(sq["n"], cf["squash"], scale_n) < 1e-13, f"{cfg['id']} squash")
        if "balanced" in cf:
            r = reference(cfg, cf["balanced"]["plane"])
            for key in ("n", "my", "mz"):
                check(abs(r[key] - cf["balanced"][key]) <= 1e-12 * scale_n * cfg["section"]["depth"] + 1e-12 * abs(cf["balanced"][key]),
                      f"{cfg['id']} balanced {key}: {r[key]} vs {cf['balanced'][key]}")
        planes = []
        spec = PLANES + (PLANES_A if cfg["limits"].get("steelStrainLimit") is not None else [])
        for adeg, tau in spec:
            p = domain_plane(cfg, math.radians(adeg), tau)
            r = reference(cfg, p)
            # Quadrature refinement of the parabolic zone: 2 vs 6 sub-panels.
            r2 = reference(cfg, p, sub=6)
            for key in ("n", "my", "mz"):
                check(abs(r[key] - r2[key]) <= 1e-12 * scale_n * max(cfg["section"]["depth"], 1) ,
                      f"{cfg['id']} plane {adeg},{tau} quadrature {key}")
            entry = {"alphaDeg": adeg, "tau": tau, "plane": p, "reference": r}
            if (adeg, tau) in FIBRE:
                f400, f800 = fibre(cfg, p, 400), fibre(cfg, p, 800)
                bound, method = fibre_bound(cfg, p, f400, f800)
                entry["fibre"] = {"400": f400, "800": f800, "bound800": bound, "boundMethod": method}
                for key in ("n", "my", "mz"):
                    e8 = abs(f800[key] - r[key])
                    sc = scale_n * (1 if key == "n" else cfg["section"]["depth"])
                    check(e8 <= bound[key], f"{cfg['id']} fibre bound {adeg},{tau} {key}: {e8} > {bound[key]}")
                    check(e8 / sc < 1e-3, f"{cfg['id']} fibre error {adeg},{tau} {key}: {e8 / sc}")
            planes.append(entry)
        caps = []
        for frac, base in N_FRACTIONS:
            n_ed = frac * (cf["squash"] if base != "tension" else cf["tension"])
            for tdeg in THETAS:
                c = capacity(cfg, n_ed, math.radians(tdeg))
                check(c is not None, f"{cfg['id']} capacity {n_ed} {tdeg}")
                check(abs(c["n"] - n_ed) <= 1e-10 * scale_n, f"{cfg['id']} capacity axial residual {n_ed} {tdeg}")
                check(c["directionError"] < 1e-10, f"{cfg['id']} capacity direction {tdeg}: {c['directionError']}")
                caps.append({"nEd": n_ed, "thetaDeg": tdeg, **c})
                print(f"  N {n_ed:.4g} theta {tdeg}: M_Rd {c['mRd']:.6g}")
        if cfg["id"].startswith("SQ-"):
            # Doubly symmetric square: M_Rd is the same at theta and theta + 90.
            for frac, base in N_FRACTIONS[:2]:
                n_ed = frac * cf["squash"]
                a = capacity(cfg, n_ed, math.radians(20.0))["mRd"]
                b = capacity(cfg, n_ed, math.radians(110.0))["mRd"]
                check(abs(a - b) <= 1e-9 * a, f"{cfg['id']} symmetry {a} vs {b}")
        out.append({**cfg, "closedForm": cf, "planes": planes, "capacities": caps})
    src = open(os.path.abspath(__file__), "rb").read()
    doc = {
        "fixtureVersion": 1,
        "formulation": "docs/formulations/rc-column.md",
        "oracle": "tools/oracles/column_oracle.py",
        "oracleSha256": hashlib.sha256(src).hexdigest(),
        "python": sys.version.split()[0],
        "units": "SI (N, m, Pa); strain and stress compression positive; N compression positive; "
                 "My = -integral(sigma z dA), Mz = integral(sigma y dA) about the rectangle centre",
        "strainPlane": "epsilon(y, z) = e0 + ky y + kz z",
        "tolerance": {"exactRelative": 1e-9, "capacityRelative": 1e-9,
                      "fibre": "|kernel - fibre800| <= |fibre800 - fibre400| (measured refinement error)"},
        "codeProfile": None,
        "configs": out,
        "failures": failures,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
    print(OUT, "failures:", len(failures))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
