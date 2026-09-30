"""exchange-v1 reference corpus and independent checks (ADR 0025).

Writes, with independent tools:
  * IFC4 files authored by IfcOpenShell (typed, schema-checked entity
    creation) with the expected SI analysis model computed here from the
    numbers put into each file;
  * DXF files authored by ezdxf, with expected WCS segments computed by
    ezdxf's own OCS transform;
  * checks of the workbench's IFC and DXF exports: IfcOpenShell validation
    (schema and EXPRESS rules) and an independent read-back in SI through
    IfcOpenShell's unit utilities, and an ezdxf read-back and audit.

Usage: tools/oracle-env/bin/python tools/oracles/exchange_oracle.py
       (needs target/release/workbench-cli; SOURCE_DATE_EPOCH=0 is set for
       reproducible exports)
Output: fixtures/exchange/*.ifc, *.dxf and exchange-oracle.json
"""

import hashlib
import json
import math
import os
import subprocess
import sys
import uuid

import ezdxf
import ifcopenshell
import ifcopenshell.guid
import ifcopenshell.util.element
import ifcopenshell.util.unit
import ifcopenshell.validate

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "fixtures", "exchange")
CLI = os.path.join(ROOT, "target", "release", "workbench-cli")
NS = uuid.UUID("6f1d3c0e-2b1a-4c55-9a70-9b3e1d2c8a11")


def gid(name):
    return ifcopenshell.guid.compress(uuid.uuid5(NS, name).hex)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def entity_id(guid):
    return "g" + guid.replace("$", "-")


# ---------------------------------------------------------------- vectors
def sub(a, b):
    return [a[i] - b[i] for i in range(3)]


def dot(a, b):
    return sum(a[i] * b[i] for i in range(3))


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def unit(a):
    n = math.sqrt(dot(a, a))
    return [x / n for x in a]


def rot_z(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return lambda v: [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]


# ------------------------------------------------------------ IFC authoring
class Ifc:
    """A small typed IFC4 author over IfcOpenShell's entity API."""

    def __init__(self, name):
        self.f = ifcopenshell.file(schema="IFC4")
        self.name = name
        self.c = self.f.create_entity
        self.vertex_of = {}

    def point(self, xyz):
        return self.c("IfcCartesianPoint", Coordinates=tuple(float(x) for x in xyz))

    def direction(self, d):
        return self.c("IfcDirection", DirectionRatios=tuple(float(x) for x in d))

    def placement3d(self, loc, axis=None, ref=None):
        return self.c(
            "IfcAxis2Placement3D",
            Location=self.point(loc),
            Axis=self.direction(axis) if axis else None,
            RefDirection=self.direction(ref) if ref else None,
        )

    def si(self, t, name, prefix=None):
        return self.c("IfcSIUnit", UnitType=t, Prefix=prefix, Name=name)

    def derived(self, t, parts):
        return self.c(
            "IfcDerivedUnit",
            Elements=[self.c("IfcDerivedUnitElement", Unit=u, Exponent=e) for u, e in parts],
            UnitType=t,
        )

    def conversion(self, t, name, factor, base, dims):
        mwu = self.c("IfcMeasureWithUnit", ValueComponent=self.c("IfcRatioMeasure", factor), UnitComponent=base)
        return self.c(
            "IfcConversionBasedUnit",
            Dimensions=self.c("IfcDimensionalExponents", *dims),
            UnitType=t,
            Name=name,
            ConversionFactor=mwu,
        )

    def project(self, units):
        self.ctx = self.c(
            "IfcGeometricRepresentationContext",
            ContextType="Model",
            CoordinateSpaceDimension=3,
            Precision=1e-6,
            WorldCoordinateSystem=self.placement3d((0.0, 0.0, 0.0)),
        )
        self.proj = self.c(
            "IfcProject",
            GlobalId=gid(self.name + ":project"),
            Name=self.name,
            RepresentationContexts=[self.ctx],
            UnitsInContext=self.c("IfcUnitAssignment", Units=units),
        )

    def model(self, placement, predefined="LOADING_3D", orientation=None):
        self.shared = placement
        self.m = self.c(
            "IfcStructuralAnalysisModel",
            GlobalId=gid(self.name + ":model"),
            Name=self.name,
            PredefinedType=predefined,
            OrientationOf2DPlane=orientation,
            SharedPlacement=placement,
        )
        self.items = []

    def vertex_shape(self, xyz):
        v = self.c("IfcVertexPoint", VertexGeometry=self.point(xyz))
        rep = self.c("IfcTopologyRepresentation", ContextOfItems=self.ctx, RepresentationIdentifier="Reference", RepresentationType="Vertex", Items=[v])
        return v, self.c("IfcProductDefinitionShape", Representations=[rep])

    def condition(self, name, values):
        """values: 6 of True/False/None/('lin'|'rot', k)."""
        def val(v):
            if v is None:
                return None
            if isinstance(v, bool):
                return self.c("IfcBoolean", v)
            kind, k = v
            return self.c("IfcLinearStiffnessMeasure" if kind == "lin" else "IfcRotationalStiffnessMeasure", float(k))
        names = ["TranslationalStiffnessX", "TranslationalStiffnessY", "TranslationalStiffnessZ", "RotationalStiffnessX", "RotationalStiffnessY", "RotationalStiffnessZ"]
        return self.c("IfcBoundaryNodeCondition", Name=name, **{n: val(v) for n, v in zip(names, values)})

    def connection(self, key, xyz, condition=None):
        v, shape = self.vertex_shape(xyz)
        e = self.c(
            "IfcStructuralPointConnection",
            GlobalId=gid(self.name + ":" + key),
            Name=key,
            ObjectPlacement=self.shared,
            Representation=shape,
            AppliedCondition=condition,
        )
        self.items.append(e)
        self.vertex_of[e.id()] = v
        return e

    def member(self, key, a, b, axis=None, predefined="RIGID_JOINED_MEMBER"):
        edge = self.c("IfcEdge", EdgeStart=self.vertex_of[a.id()], EdgeEnd=self.vertex_of[b.id()])
        rep = self.c("IfcTopologyRepresentation", ContextOfItems=self.ctx, RepresentationIdentifier="Reference", RepresentationType="Edge", Items=[edge])
        e = self.c(
            "IfcStructuralCurveMember",
            GlobalId=gid(self.name + ":" + key),
            Name=key,
            ObjectPlacement=self.shared,
            Representation=self.c("IfcProductDefinitionShape", Representations=[rep]),
            PredefinedType=predefined,
            Axis=self.direction(axis) if axis else None,
        )
        self.items.append(e)
        return e

    def end(self, key, member, conn, condition):
        self.c(
            "IfcRelConnectsStructuralMember",
            GlobalId=gid(self.name + ":rel:" + key),
            RelatingStructuralMember=member,
            RelatedStructuralConnection=conn,
            AppliedCondition=condition,
        )

    def pset_material(self, material, name, props):
        self.c(
            "IfcMaterialProperties",
            Name=name,
            Properties=[self.c("IfcPropertySingleValue", Name=k, NominalValue=v) for k, v in props],
            Material=material,
        )

    def pset_profile(self, profile, name, props):
        self.c(
            "IfcProfileProperties",
            Name=name,
            Properties=[self.c("IfcPropertySingleValue", Name=k, NominalValue=v) for k, v in props],
            ProfileDefinition=profile,
        )

    def associate(self, key, members, material, profile):
        mp = self.c("IfcMaterialProfile", Material=material, Profile=profile)
        mps = self.c("IfcMaterialProfileSet", MaterialProfiles=[mp])
        usage = self.c("IfcMaterialProfileSetUsage", ForProfileSet=mps, CardinalPoint=10)
        self.c("IfcRelAssociatesMaterial", GlobalId=gid(self.name + ":mat:" + key), RelatedObjects=members, RelatingMaterial=usage)

    def group(self, key, name, predefined, action_type="NOTDEFINED", source="NOTDEFINED", coefficient=None, purpose=None, self_weight=None, case=True):
        cls = "IfcStructuralLoadCase" if case else "IfcStructuralLoadGroup"
        kw = dict(
            GlobalId=gid(self.name + ":" + key),
            Name=name,
            PredefinedType=predefined,
            ActionType=action_type,
            ActionSource=source,
            Coefficient=coefficient,
            Purpose=purpose,
        )
        if case:
            kw["SelfWeightCoefficients"] = self_weight
        return self.c(cls, **kw)

    def assign(self, key, group, objects, factor=None):
        if factor is None:
            self.c("IfcRelAssignsToGroup", GlobalId=gid(self.name + ":assign:" + key), RelatedObjects=objects, RelatingGroup=group)
        else:
            self.c("IfcRelAssignsToGroupByFactor", GlobalId=gid(self.name + ":assign:" + key), RelatedObjects=objects, RelatingGroup=group, Factor=factor)

    def act(self, key, cls, item, load, local=False, **kw):
        a = self.c(cls, GlobalId=gid(self.name + ":" + key), Name=key, AppliedLoad=load, GlobalOrLocal="LOCAL_COORDS" if local else "GLOBAL_COORDS", **kw)
        self.c("IfcRelConnectsStructuralActivity", GlobalId=gid(self.name + ":act:" + key), RelatingElement=item, RelatedStructuralActivity=a)
        return a

    def single(self, key, fx=0.0, fy=0.0, fz=0.0, mx=0.0, my=0.0, mz=0.0):
        return self.c("IfcStructuralLoadSingleForce", Name=key, ForceX=fx, ForceY=fy, ForceZ=fz, MomentX=mx, MomentY=my, MomentZ=mz)

    def linear(self, key, qx=0.0, qy=0.0, qz=0.0, mx=0.0):
        return self.c("IfcStructuralLoadLinearForce", Name=key, LinearForceX=qx, LinearForceY=qy, LinearForceZ=qz, LinearMomentX=mx)

    def finish(self, path):
        self.c("IfcRelAssignsToGroup", GlobalId=gid(self.name + ":items"), RelatedObjects=self.items, RelatingGroup=self.m)
        self.c("IfcRelAggregates", GlobalId=gid(self.name + ":decomposes"), RelatingObject=self.proj, RelatedObjects=[self.m])
        self.f.write(path)
        return self.f


def validate(path):
    f = ifcopenshell.open(path)
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, log, express_rules=True)
    return f, [str(s.get("message")).splitlines()[0][:200] for s in log.statements]


# ------------------------------------------------------ X-PORTAL-MM (IFC)
def portal_mm():
    x = Ifc("X-PORTAL-MM")
    mm = x.si("LENGTHUNIT", "METRE", "MILLI")
    kn = x.si("FORCEUNIT", "NEWTON", "KILO")
    n = x.si("FORCEUNIT", "NEWTON")  # used inside derived units only
    kg = x.si("MASSUNIT", "GRAM", "KILO")
    m = x.si("LENGTHUNIT", "METRE")
    units = [
        mm, kn, kg,
        x.si("AREAUNIT", "SQUARE_METRE", "MILLI"),
        x.derived("MOMENTOFINERTIAUNIT", [(mm, 4)]),
        x.derived("SECTIONMODULUSUNIT", [(mm, 3)]),
        x.derived("MODULUSOFELASTICITYUNIT", [(n, 1), (mm, -2)]),
        x.derived("MASSDENSITYUNIT", [(kg, 1), (mm, -3)]),
        x.derived("LINEARFORCEUNIT", [(kn, 1), (m, -1)]),
        x.derived("TORQUEUNIT", [(kn, 1), (m, 1)]),
    ]
    x.project(units)
    # Model placement: 30° about Z and a translation, in mm.
    R, t = rot_z(30.0), [1000.0, 2000.0, 500.0]
    x.model(x.c("IfcLocalPlacement", RelativePlacement=x.placement3d(t, (0.0, 0.0, 1.0), (math.cos(math.radians(30)), math.sin(math.radians(30)), 0.0))))
    P = {"N1": (0, 0, 0), "N2": (0, 0, 4000), "N3": (3000, 0, 5000), "N4": (6000, 0, 4000), "N5": (6000, 0, 0), "N6": (0, 3000, 4000)}
    fixed = x.condition("fixed", [True] * 6)
    pinned = x.condition("pinned", [True, True, True, False, False, False])
    roller = x.condition("roller", [False, False, True, False, False, False])
    C = {k: x.connection(k, v, {"N1": fixed, "N5": pinned, "N6": roller}.get(k)) for k, v in P.items()}
    axes = {"C1": (1, 0, 0), "R1": (0, 0, 1), "R2": (0, 0, 1), "C2": (-1, 0, 0), "B1": (0, 0, 1)}
    ends = {"C1": ("N1", "N2"), "R1": ("N2", "N3"), "R2": ("N3", "N4"), "C2": ("N4", "N5"), "B1": ("N2", "N6")}
    M = {k: x.member(k, C[a], C[b], axes[k]) for k, (a, b) in ends.items()}
    rigid = x.condition("rigid", [True] * 6)
    for k, (a, b) in ends.items():
        # C2 runs N4 → N5, so its start is the top: a hinge there, above the
        # pinned base, keeps the portal stable.
        x.end(k + "-a", M[k], C[a], x.condition("C2 top hinge", [True, True, True, True, False, True]) if k == "C2" else rigid)
        x.end(k + "-b", M[k], C[b], rigid)
    steel = x.c("IfcMaterial", Name="S355")
    x.pset_material(steel, "Pset_MaterialMechanical", [("YoungModulus", x.c("IfcModulusOfElasticityMeasure", 210000.0)), ("PoissonRatio", x.c("IfcPositiveRatioMeasure", 0.3))])
    x.pset_material(steel, "Pset_MaterialCommon", [("MassDensity", x.c("IfcMassDensityMeasure", 7.85e-6))])
    ipe = x.c("IfcIShapeProfileDef", ProfileType="AREA", ProfileName="IPE300", OverallWidth=150.0, OverallDepth=300.0, WebThickness=7.1, FlangeThickness=10.7, FilletRadius=15.0)
    x.pset_profile(ipe, "Pset_ProfileMechanical", [
        ("CrossSectionArea", x.c("IfcAreaMeasure", 5381.0)),
        ("MomentOfInertiaY", x.c("IfcMomentOfInertiaMeasure", 83.56e6)),
        ("MomentOfInertiaZ", x.c("IfcMomentOfInertiaMeasure", 6.038e6)),
        ("TorsionalConstantX", x.c("IfcMomentOfInertiaMeasure", 0.2012e6)),
        ("MaximumSectionModulusY", x.c("IfcSectionModulusMeasure", 557.1e3)),
        ("MaximumSectionModulusZ", x.c("IfcSectionModulusMeasure", 80.5e3)),
    ])
    x.associate("steel", list(M.values()), steel, ipe)
    lc1 = x.group("LC1", "Dead", "LOAD_CASE", "PERMANENT_G", "DEAD_LOAD_G", self_weight=(0.0, 0.0, -1.0))
    lc2 = x.group("LC2", "Live", "LOAD_CASE", "VARIABLE_Q", "LIVE_LOAD_Q")
    lc3 = x.group("LC3", "Wind", "LOAD_CASE", "VARIABLE_Q", "WIND_W")
    a1 = x.act("dead-R1", "IfcStructuralLinearAction", M["R1"], x.linear("q", qz=-2.5), ProjectedOrTrue="TRUE_LENGTH", PredefinedType="CONST")
    a2 = x.act("dead-R2", "IfcStructuralLinearAction", M["R2"], x.linear("q", qz=-3.0), ProjectedOrTrue="PROJECTED_LENGTH", PredefinedType="CONST")
    # Point action on B1, 1200 mm from N2, in local coordinates.
    v, shape = x.vertex_shape((0.0, 1200.0, 4000.0))
    a3 = x.act("live-B1", "IfcStructuralPointAction", M["B1"], x.single("P", fz=-10.0), local=True, ObjectPlacement=x.shared, Representation=shape)
    a4 = x.act("live-N3", "IfcStructuralPointAction", C["N3"], x.single("F", fx=5.0, my=2.0))
    a5 = x.act("live-C1", "IfcStructuralLinearAction", M["C1"], x.linear("w", qy=1.5), local=True, ProjectedOrTrue="TRUE_LENGTH", PredefinedType="CONST")
    cfg = x.c("IfcStructuralLoadConfiguration", Name="gusts", Values=[x.single("g1", fx=2.0), x.single("g2", fx=2.0)], Locations=((1000.0,), (2000.0,)))
    a6 = x.act("wind-R2", "IfcStructuralCurveAction", M["R2"], cfg, ProjectedOrTrue="TRUE_LENGTH", PredefinedType="DISCRETE")
    x.assign("lc1", lc1, [a1, a2])
    x.assign("lc2", lc2, [a3, a4, a5])
    x.assign("lc3", lc3, [a6])
    uls = x.group("ULS", "1.35G+1.5Q", "LOAD_COMBINATION", purpose="strength", case=False)
    sls = x.group("SLS", "G+Q", "LOAD_COMBINATION", purpose="service", case=False)
    x.assign("uls-g", uls, [lc1], 1.35)
    x.assign("uls-q", uls, [lc2], 1.5)
    x.assign("sls", sls, [lc1, lc2], 1.0)
    x.m.LoadedBy = [uls, sls]
    path = os.path.join(OUT, "X-PORTAL-MM.ifc")
    x.finish(path)

    # Expected analysis model in SI, world coordinates.
    L = 1e-3
    world = {k: [a + b for a, b in zip(R([c * L for c in v]), [c * L for c in t])] for k, v in P.items()}
    node = {k: entity_id(gid("X-PORTAL-MM:" + k)) for k in P}
    members = {}
    for k, (a, b) in ends.items():
        xx = unit(sub(world[b], world[a]))
        ax = R(list(axes[k]))
        z = unit(sub(ax, [xx[i] * dot(ax, xx) for i in range(3)]))
        members[entity_id(gid("X-PORTAL-MM:" + k))] = {
            "start": node[a], "end": node[b], "localY": cross(z, xx),
            "releaseStart": [True, False] if k == "C2" else [False, False], "releaseEnd": [False, False],
            "material": {"E": 210000.0 * 1e6, "nu": 0.3, "density": 7.85e-6 * 1e9},
            "section": {"A": 5381.0e-6, "Iy": 83.56e6 * 1e-12, "Iz": 6.038e6 * 1e-12, "J": 0.2012e6 * 1e-12, "cy": 6.038e6 / 80.5e3 * 1e-3, "cz": 83.56e6 / 557.1e3 * 1e-3},
        }
    mid = lambda k: entity_id(gid("X-PORTAL-MM:" + k))
    lr2 = math.dist(world["N3"], world["N4"])
    x_r2 = unit(sub(world["N4"], world["N3"]))
    loads = [
        {"case": mid("LC1"), "type": "selfWeight", "factor": 1.0},
        {"case": mid("LC1"), "type": "uniform", "member": mid("R1"), "axes": "global", "values": R([0.0, 0.0, -2500.0])},
        {"case": mid("LC1"), "type": "uniform", "member": mid("R2"), "axes": "global", "values": [0.0, 0.0, -3000.0 * math.sqrt(1 - x_r2[2] ** 2)]},
        {"case": mid("LC2"), "type": "point", "member": mid("B1"), "axes": "local", "station": 0.4, "values": [0.0, 0.0, -10000.0, 0.0, 0.0, 0.0]},
        {"case": mid("LC2"), "type": "nodal", "node": node["N3"], "values": R([5000.0, 0.0, 0.0]) + R([0.0, 2000.0, 0.0])},
        {"case": mid("LC2"), "type": "uniform", "member": mid("C1"), "axes": "local", "values": [0.0, 1500.0, 0.0]},
        {"case": mid("LC3"), "type": "point", "member": mid("R2"), "axes": "global", "station": 1.0 / (lr2 / 1.0), "values": R([2000.0, 0.0, 0.0]) + [0.0, 0.0, 0.0]},
        {"case": mid("LC3"), "type": "point", "member": mid("R2"), "axes": "global", "station": 2.0 / (lr2 / 1.0), "values": R([2000.0, 0.0, 0.0]) + [0.0, 0.0, 0.0]},
    ]
    expected = {
        "file": "X-PORTAL-MM.ifc",
        "description": "IfcOpenShell-authored portal in mm and kN with derived units, a rotated and translated shared placement, Axis orientation, supports, a hinge, self weight, true and projected linear loads, local/global point actions, a discrete curve action and two combinations",
        "analysisMode": "spatial",
        "mapping": {},
        "decisions": [],
        "blocking": [],
        "nodes": {node[k]: world[k] for k in P},
        "supports": {node["N1"]: [True] * 6, node["N5"]: [True, True, True, False, False, False], node["N6"]: [False, False, True, False, False, False]},
        "members": members,
        "cases": {mid("LC1"): "dead", mid("LC2"): "live", mid("LC3"): "wind"},
        "combinations": {mid("ULS"): {"purpose": "strength", "terms": {mid("LC1"): 1.35, mid("LC2"): 1.5}}, mid("SLS"): {"purpose": "service", "terms": {mid("LC1"): 1.0, mid("LC2"): 1.0}}},
        "loads": loads,
        "ledgerSubjects": ["load per projected length", "discrete curve action"],
    }
    # Independent unit check: IfcOpenShell's own unit scale for lengths.
    f = ifcopenshell.open(path)
    assert abs(ifcopenshell.util.unit.calculate_unit_scale(f) - 1e-3) < 1e-15
    return path, expected


# ------------------------------------------------------ X-FEET-KIP (IFC)
def feet_kip():
    x = Ifc("X-FEET-KIP")
    m = x.si("LENGTHUNIT", "METRE")
    n = x.si("FORCEUNIT", "NEWTON")
    ft = x.conversion("LENGTHUNIT", "foot", 0.3048, m, (1, 0, 0, 0, 0, 0, 0))
    kip = x.conversion("FORCEUNIT", "kip", 4448.2216152605, n, (1, 1, -2, 0, 0, 0, 0))
    lb = x.conversion("MASSUNIT", "pound", 0.45359237, x.si("MASSUNIT", "GRAM", "KILO"), (0, 1, 0, 0, 0, 0, 0))
    x.project([ft, kip, lb])  # no derived units: decisions
    x.model(x.c("IfcLocalPlacement", RelativePlacement=x.placement3d((0.0, 0.0, 0.0))))
    P = {"A": (0, 0, 0), "B": (0, 0, 12), "C": (20, 0, 12), "D": (20, 0, 0)}
    C = {
        "A": x.connection("A", P["A"], x.condition("fixed", [True] * 6)),
        "B": x.connection("B", P["B"]),
        "C": x.connection("C", P["C"]),
        # Rotations restrained: col2's lower end is released (answered
        # 'pinned'), and a release at an unrestrained node would leave the
        # rotation with no stiffness at all.
        "D": x.connection("D", P["D"], x.condition("spring", [True, True, ("lin", 100.0), True, True, True])),
    }
    col1 = x.member("col1", C["A"], C["B"], (1, 0, 0))
    beam = x.member("beam", C["B"], C["C"], (0, 0, 1))
    col2 = x.member("col2", C["C"], C["D"], (1, 0, 0))
    rigid = x.condition("rigid", [True] * 6)
    x.end("col1-a", col1, C["A"], rigid)
    x.end("col1-b", col1, C["B"], rigid)
    x.end("beam-a", beam, C["B"], rigid)
    x.end("beam-b", beam, C["C"], x.condition("partly unset", [True, True, True, True, None, True]))
    x.end("col2-a", col2, C["C"], rigid)
    # col2's lower end: a relationship with no stated condition.
    x.end("col2-b", col2, C["D"], None)
    conc = x.c("IfcMaterial", Name="Concrete 4 ksi")
    # E in kip/ft² (unassigned derived unit), ν, density in lb/ft³.
    x.pset_material(conc, "Pset_MaterialMechanical", [("YoungModulus", x.c("IfcModulusOfElasticityMeasure", 518400.0)), ("PoissonRatio", x.c("IfcPositiveRatioMeasure", 0.2))])
    x.pset_material(conc, "Pset_MaterialCommon", [("MassDensity", x.c("IfcMassDensityMeasure", 150.0))])
    rect = x.c("IfcRectangleProfileDef", ProfileType="AREA", ProfileName="12x24", XDim=1.0, YDim=2.0)
    x.associate("conc", [col1, beam, col2], conc, rect)
    lc = x.group("LC1", "Dead", "LOAD_CASE", "PERMANENT_G", "DEAD_LOAD_G")
    sub_group = x.group("G1", "Superimposed", "LOAD_GROUP", coefficient=2.0, case=False)
    a1 = x.act("udl", "IfcStructuralLinearAction", beam, x.linear("q", qz=-1.0), ProjectedOrTrue="TRUE_LENGTH", PredefinedType="CONST")
    a2 = x.act("tri", "IfcStructuralCurveAction", beam, x.c("IfcStructuralLoadConfiguration", Name="tri", Values=[x.linear("a", qz=0.0), x.linear("b", qz=-1.0)], Locations=((0.0,), (20.0,))), ProjectedOrTrue="TRUE_LENGTH", PredefinedType="LINEAR")
    a3 = x.act("pt", "IfcStructuralPointAction", C["C"], x.single("P", fx=1.0))
    x.assign("lc-direct", lc, [a1, a2, sub_group])
    x.assign("group", sub_group, [a3])
    combo = x.group("U", "Ultimate", "LOAD_COMBINATION", purpose="ULS", coefficient=1.0, case=False)
    x.assign("combo", combo, [lc], 1.4)
    # Content outside a frame model.
    surface = x.c("IfcStructuralSurfaceMember", GlobalId=gid("X-FEET-KIP:slab"), Name="slab", PredefinedType="SHELL", Thickness=0.5)
    x.items.append(surface)
    x.c("IfcBeam", GlobalId=gid("X-FEET-KIP:physical beam"), Name="physical beam")
    reaction = x.c("IfcStructuralPointReaction", GlobalId=gid("X-FEET-KIP:reaction"), Name="R", AppliedLoad=x.single("R", fz=1.0), GlobalOrLocal="GLOBAL_COORDS")
    x.c("IfcRelConnectsStructuralActivity", GlobalId=gid("X-FEET-KIP:reaction-rel"), RelatingElement=C["A"], RelatedStructuralActivity=reaction)
    path = os.path.join(OUT, "X-FEET-KIP.ifc")
    x.finish(path)

    FT, KIP, LB = 0.3048, 4448.2216152605, 0.45359237
    mid = lambda k: entity_id(gid("X-FEET-KIP:" + k))
    world = {k: [c * FT for c in v] for k, v in P.items()}
    # Solid rectangle 1 ft (local y) × 2 ft (local z), the workbench's
    # Saint-Venant approximation J = a b³ (1/3 − 0.21 (b/a)(1 − b⁴/12a⁴)).
    b_, d_ = 1.0 * FT, 2.0 * FT
    a, bb = max(b_, d_), min(b_, d_)
    r = bb / a
    J = a * bb ** 3 * (1.0 / 3.0 - 0.21 * r * (1 - r ** 4 / 12.0))
    section = {"A": b_ * d_, "Iy": b_ * d_ ** 3 / 12, "Iz": d_ * b_ ** 3 / 12, "J": J, "cy": b_ / 2, "cz": d_ / 2}
    material = {"E": 518400.0 * KIP / FT ** 2, "nu": 0.2, "density": 150.0 * LB / FT ** 3}
    def ly(a_, b_, axis):
        xx = unit(sub(world[b_], world[a_]))
        if axis is None:
            return [-1.0, 0.0, 0.0] if abs(xx[1]) > 1 - 1e-9 else [0.0, 1.0, 0.0]
        z = unit(sub(list(axis), [xx[i] * dot(list(axis), xx) for i in range(3)]))
        return cross(z, xx)
    members = {
        mid("col1"): {"start": mid("A"), "end": mid("B"), "localY": ly("A", "B", (1, 0, 0)), "releaseStart": [False, False], "releaseEnd": [False, False], "material": material, "section": section},
        # Unset RotationalStiffnessY at the beam's end: answered 'pinned'.
        mid("beam"): {"start": mid("B"), "end": mid("C"), "localY": ly("B", "C", (0, 0, 1)), "releaseStart": [False, False], "releaseEnd": [True, False], "material": material, "section": section},
        # No stated condition at col2's lower end: answered 'pinned'.
        mid("col2"): {"start": mid("C"), "end": mid("D"), "localY": ly("C", "D", (1, 0, 0)), "releaseStart": [False, False], "releaseEnd": [True, True], "material": material, "section": section},
    }
    expected = {
        "file": "X-FEET-KIP.ifc",
        "description": "IfcOpenShell-authored frame in feet and kips with no derived units, a parametric rectangle profile, an elastic support, unset and missing end conditions, a nested load group with a coefficient, an unsupported linear distribution, a surface member, a physical beam, a reaction and a 'ULS' purpose",
        "analysisMode": "spatial",
        "mapping": {
            "units:area": {"choice": "derived"},
            "units:modulusOfElasticity": {"choice": "derived"},
            "units:massDensity": {"choice": "derived"},
            "units:linearForce": {"choice": "derived"},
            "units:torque": {"choice": "derived"},
            "units:linearStiffness": {"choice": "derived"},
            "supports:elastic": {"choice": "fixed"},
            "connections:unset": {"choice": "pinned"},
            "skip:surfaces": {"choice": "skip"},
            "skip:loads": {"choice": "skip"},
            "purpose:ULS": {"choice": "strength"},
        },
        "decisions": sorted(["units:modulusOfElasticity", "units:massDensity", "units:linearForce", "units:torque", "units:linearStiffness", "supports:elastic", "connections:unset", "skip:surfaces", "skip:loads", "purpose:ULS"]),
        "blocking": [],
        "nodes": {mid(k): world[k] for k in P},
        "supports": {mid("A"): [True] * 6, mid("D"): [True] * 6},
        "members": members,
        "cases": {mid("LC1"): "dead"},
        "combinations": {mid("U"): {"purpose": "strength", "terms": {mid("LC1"): 1.4}}},
        "loads": [
            {"case": mid("LC1"), "type": "uniform", "member": mid("beam"), "axes": "global", "values": [0.0, 0.0, -KIP / FT]},
            {"case": mid("LC1"), "type": "nodal", "node": mid("C"), "values": [2.0 * KIP, 0.0, 0.0, 0.0, 0.0, 0.0]},
        ],
        "ledgerSubjects": ["IfcBeam", "IfcStructuralPointReaction", "IfcStructuralSurfaceMember", "IfcStructuralCurveAction", "elastic support"],
    }
    # Area is not used by the file (no profile pset), so no decision for it.
    del expected["mapping"]["units:area"]
    return path, expected


# ---------------------------------------------------- X-BLOCKED, X-PLANAR
def blocked():
    x = Ifc("X-BLOCKED")
    x.project([x.si("LENGTHUNIT", "METRE"), x.si("FORCEUNIT", "NEWTON")])
    x.model(x.c("IfcLocalPlacement", RelativePlacement=x.placement3d((0.0, 0.0, 0.0))))
    a = x.connection("A", (0, 0, 0), x.condition("fixed", [True] * 6))
    b = x.connection("B", (4, 0, 0))
    mem = x.member("m", a, b, (0, 0, 1))
    x.end("a", mem, a, x.condition("rigid", [True] * 6))
    x.end("b", mem, b, x.condition("axial release", [False, True, True, True, True, True]))
    path = os.path.join(OUT, "X-BLOCKED.ifc")
    x.finish(path)
    return path, {"file": "X-BLOCKED.ifc", "description": "a released member-end translation, which cannot be represented", "blocking": ["UNSUPPORTED_FEATURE"], "blockingEntities": [gid("X-BLOCKED:m")]}


def planar():
    x = Ifc("X-PLANAR")
    x.project([x.si("LENGTHUNIT", "METRE"), x.si("FORCEUNIT", "NEWTON"), x.si("MASSUNIT", "GRAM", "KILO"), x.si("PRESSUREUNIT", "PASCAL")])
    orientation = x.placement3d((0.0, 0.0, 0.0), (0.0, -1.0, 0.0), (1.0, 0.0, 0.0))
    x.model(x.c("IfcLocalPlacement", RelativePlacement=x.placement3d((0.0, 0.0, 0.0))), "IN_PLANE_LOADING_2D", orientation)
    a = x.connection("A", (0, 0, 0), x.condition("pin", [True, True, True, False, False, False]))
    b = x.connection("B", (5, 0, 0), x.condition("roller", [False, True, True, False, False, False]))
    mem = x.member("m", a, b, (0, 0, 1))
    for k, c in (("a", a), ("b", b)):
        x.end(k, mem, c, x.condition("rigid", [True] * 6))
    mat = x.c("IfcMaterial", Name="steel")
    x.pset_material(mat, "Pset_MaterialMechanical", [("YoungModulus", x.c("IfcModulusOfElasticityMeasure", 2.0e11)), ("ShearModulus", x.c("IfcModulusOfElasticityMeasure", 2.0e11 / 2.6))])
    x.pset_material(mat, "Pset_MaterialCommon", [("MassDensity", x.c("IfcMassDensityMeasure", 7850.0))])
    circ = x.c("IfcCircleHollowProfileDef", ProfileType="AREA", ProfileName="CHS 168.3x8", Radius=0.08415, WallThickness=0.008)
    x.associate("s", [mem], mat, circ)
    lc = x.group("LC", "Load", "LOAD_CASE")
    x.assign("lc", lc, [x.act("q", "IfcStructuralLinearAction", mem, x.linear("q", qz=-1000.0), ProjectedOrTrue="TRUE_LENGTH", PredefinedType="CONST")])
    path = os.path.join(OUT, "X-PLANAR.ifc")
    x.finish(path)
    ro, ri = 0.08415, 0.08415 - 0.008
    i = math.pi * (ro ** 4 - ri ** 4) / 4
    mid = lambda k: entity_id(gid("X-PLANAR:" + k))
    return path, {
        "file": "X-PLANAR.ifc",
        "description": "IN_PLANE_LOADING_2D in the XZ plane, ν from E and G, and a circular hollow profile computed from its geometry",
        "analysisMode": "planarXZ",
        "mapping": {},
        "decisions": [],
        "blocking": [],
        "nodes": {mid("A"): [0.0, 0.0, 0.0], mid("B"): [5.0, 0.0, 0.0]},
        "supports": {mid("A"): [True, True, True, False, False, False], mid("B"): [False, True, True, False, False, False]},
        "members": {mid("m"): {"start": mid("A"), "end": mid("B"), "localY": [0.0, 1.0, 0.0], "releaseStart": [False, False], "releaseEnd": [False, False],
                               "material": {"E": 2.0e11, "nu": 0.3, "density": 7850.0},
                               "section": {"A": math.pi * (ro ** 2 - ri ** 2), "Iy": i, "Iz": i, "J": 2 * i, "cy": ro, "cz": ro}}},
        "cases": {mid("LC"): "other"},
        "combinations": {},
        "loads": [{"case": mid("LC"), "type": "uniform", "member": mid("m"), "axes": "global", "values": [0.0, 0.0, -1000.0]}],
        "ledgerSubjects": [],
    }


# ------------------------------------------------------------ DXF corpus
def dxf_corpus():
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = 4  # millimetres
    msp = doc.modelspace()
    for name in ("BEAM", "COLUMN", "BRACE", "NOTES"):
        doc.layers.add(name)
    msp.add_line((0, 0, 0), (0, 0, 3000), dxfattribs={"layer": "COLUMN"})
    msp.add_line((6000, 0, 0), (6000, 0, 3000), dxfattribs={"layer": "COLUMN"})
    # Beam as an LWPOLYLINE in a mirrored OCS (extrusion −Z) at elevation.
    msp.add_lwpolyline([(0, 0), (-3000, 0), (-6000, 0)], dxfattribs={"layer": "BEAM", "elevation": -3000.0, "extrusion": (0, 0, -1)})
    # A brace as a 2D POLYLINE in an arbitrary OCS.
    # Normal (0.6, −0.8, 0): a vertical plane through the origin, handled by
    # the general branch of the arbitrary axis algorithm.
    n = unit([0.6, -0.8, 0.0])
    ocs = ezdxf.math.OCS(n)
    a_w, b_w = ezdxf.math.Vec3(0, 0, 0), ezdxf.math.Vec3(2400, 1800, 3000)
    a_o, b_o = ocs.from_wcs(a_w), ocs.from_wcs(b_w)
    # 2D polyline vertices share the OCS elevation; pick the brace so both
    # ends have the same OCS z.
    b_w = ocs.to_wcs(ezdxf.math.Vec3(b_o.x, b_o.y, a_o.z))
    b_o = ocs.from_wcs(b_w)
    pl = msp.add_polyline2d([(a_o.x, a_o.y), (b_o.x, b_o.y)], dxfattribs={"layer": "BRACE", "extrusion": tuple(n)})
    pl.dxf.elevation = (0, 0, a_o.z)
    # A 3D polyline along the far bay.
    msp.add_polyline3d([(6000, 0, 3000), (6000, 4000, 3000), (0, 4000, 3000)], dxfattribs={"layer": "BEAM"})
    msp.add_line((0, 4000, 3000), (0, 0, 3000), dxfattribs={"layer": "BEAM"})
    # Not members.
    msp.add_line((0, 0, 3000), (0, 0, 3000), dxfattribs={"layer": "BEAM"})  # zero length
    msp.add_line((6000, 0, 0), (6000, 0, 3000), dxfattribs={"layer": "COLUMN"})  # duplicate
    msp.add_text("Grid A", dxfattribs={"layer": "NOTES"})
    msp.add_circle((0, 0, 0), 200, dxfattribs={"layer": "NOTES"})
    blk = doc.blocks.new("BASEPLATE")
    blk.add_line((0, 0), (100, 0))
    msp.add_blockref("BASEPLATE", (0, 0, 0))
    arc = msp.add_lwpolyline([(0, 0, 0, 0, 0.5), (1000, 0)], format="xyseb", dxfattribs={"layer": "NOTES"})
    path = os.path.join(OUT, "X-DXF-MM.dxf")
    doc.saveas(path)

    # Expected segments in metres from ezdxf's own OCS handling.
    doc = ezdxf.readfile(path)
    segs = []
    for e in doc.modelspace():
        if e.dxftype() == "LINE":
            segs.append((e.dxf.layer, list(e.dxf.start), list(e.dxf.end)))
        elif e.dxftype() == "LWPOLYLINE":
            if any(p[0] != 0 for p in e.get_points("b")):
                continue
            pts = [list(p) for p in e.vertices_in_wcs()]
            segs += [(e.dxf.layer, pts[k], pts[k + 1]) for k in range(len(pts) - 1)]
        elif e.dxftype() == "POLYLINE":
            pts = [list(p) for p in (e.points_in_wcs() if hasattr(e, "points_in_wcs") else e.points())]
            if not e.is_3d_polyline:
                o = ezdxf.math.OCS(e.dxf.extrusion)
                pts = [list(o.to_wcs(ezdxf.math.Vec3(v.dxf.location.x, v.dxf.location.y, e.dxf.elevation.z))) for v in e.vertices]
            segs += [(e.dxf.layer, pts[k], pts[k + 1]) for k in range(len(pts) - 1)]
    members = []
    seen = set()
    for layer, a, b in segs:
        a, b = [x * 1e-3 for x in a], [x * 1e-3 for x in b]
        if math.dist(a, b) == 0.0:
            continue
        key = tuple(sorted([tuple(round(x, 9) for x in a), tuple(round(x, 9) for x in b)]))
        if key in seen:
            continue
        seen.add(key)
        members.append({"layer": layer, "a": a, "b": b})
    props = {"E": 2.1e11, "nu": 0.3, "density": 7850.0, "A": 0.005, "Iy": 8e-5, "Iz": 6e-6, "J": 2e-7, "cy": 0.075, "cz": 0.15}
    mapping = {"layer:" + l: {"choice": "values", "values": props} for l in ("BEAM", "BRACE", "COLUMN")}
    mapping["nodes:tolerance"] = {"choice": "values", "values": {"tolerance": 1e-6}}
    mapping["supports"] = {"choice": "pinnedLowest"}
    # NOTES has only a curved polyline (not a member), so it has no decision.
    expected_mm = {
        "file": "X-DXF-MM.dxf",
        "description": "ezdxf-authored R2018 drawing in mm: LINEs, an LWPOLYLINE in a mirrored OCS at elevation, a 2D POLYLINE in an arbitrary OCS, a 3D POLYLINE, a zero-length and a duplicate line, text, a circle, a block reference and an arc-segment polyline",
        "mapping": mapping,
        "decisions": sorted(list(mapping.keys())),
        "members": members,
        "supports": 2,
        "ledgerSubjects": ["zero-length segment", "duplicate segment", "TEXT entity", "CIRCLE entity", "block reference (INSERT)", "polyline with arc segments"],
    }

    doc12 = ezdxf.new("R12")
    doc12.header["$INSUNITS"] = 0
    doc12.modelspace().add_line((0, 0, 0), (10, 0, 0), dxfattribs={"layer": "A"})
    path12 = os.path.join(OUT, "X-DXF-NOUNITS.dxf")
    doc12.saveas(path12)
    expected_nounits = {
        "file": "X-DXF-NOUNITS.dxf",
        "description": "an R12 drawing with $INSUNITS = 0: the length unit must be decided",
        "mapping": {
            "units:length": {"choice": "ft"},
            "layer:A": {"choice": "values", "values": props},
            "nodes:tolerance": {"choice": "values", "values": {"tolerance": 1e-3}},
            "supports": {"choice": "none"},
        },
        "decisions": sorted(["units:length", "layer:A", "nodes:tolerance", "supports"]),
        "members": [{"layer": "A", "a": [0.0, 0.0, 0.0], "b": [3.048, 0.0, 0.0]}],
        "supports": 0,
        "ledgerSubjects": [],
    }
    return [(path, expected_mm), (path12, expected_nounits)]


# ------------------------------------------------------- export checks
def ifc_read_back(path):
    """The analysis model of a workbench export, read by IfcOpenShell in SI."""
    f = ifcopenshell.open(path)
    scale = {}
    for t in ("LENGTHUNIT", "FORCEUNIT", "AREAUNIT", "MOMENTOFINERTIAUNIT", "MODULUSOFELASTICITYUNIT", "MASSDENSITYUNIT", "LINEARFORCEUNIT", "TORQUEUNIT"):
        scale[t] = ifcopenshell.util.unit.calculate_unit_scale(f, t) if t in ("LENGTHUNIT", "AREAUNIT") else 1.0
    out = {"nodes": {}, "members": {}, "supports": {}, "loads": 0}
    for c in f.by_type("IfcStructuralPointConnection"):
        ident = ifcopenshell.util.element.get_psets(c).get("Workbench_Identity", {})
        v = c.Representation.Representations[0].Items[0]
        out["nodes"][ident["EntityId"]] = [x * scale["LENGTHUNIT"] for x in v.VertexGeometry.Coordinates]
        cond = c.AppliedCondition
        if cond:
            out["supports"][ident["SupportId"]] = [bool(getattr(cond, a).wrappedValue) for a in ("TranslationalStiffnessX", "TranslationalStiffnessY", "TranslationalStiffnessZ", "RotationalStiffnessX", "RotationalStiffnessY", "RotationalStiffnessZ")]
    for m in f.by_type("IfcStructuralCurveMember"):
        ident = ifcopenshell.util.element.get_psets(m).get("Workbench_Identity", {})
        e = m.Representation.Representations[0].Items[0]
        a, b = e.EdgeStart.VertexGeometry.Coordinates, e.EdgeEnd.VertexGeometry.Coordinates
        xx = unit(sub(b, a))
        ax = list(m.Axis.DirectionRatios)
        z = unit(sub(ax, [xx[i] * dot(ax, xx) for i in range(3)]))
        usage = ifcopenshell.util.element.get_material(m)
        prof = usage.ForProfileSet.MaterialProfiles[0]
        pm = {p.Name: p for p in prof.Profile.HasProperties}["Pset_ProfileMechanical"]
        props = {p.Name: p.NominalValue.wrappedValue for p in pm.Properties}
        mm = {p.Name: p for p in prof.Material.HasProperties}["Pset_MaterialMechanical"]
        mprops = {p.Name: p.NominalValue.wrappedValue for p in mm.Properties}
        releases = {}
        for rel in m.ConnectedBy:
            c = rel.AppliedCondition
            pos = rel.RelatedStructuralConnection.Representation.Representations[0].Items[0].VertexGeometry.Coordinates
            end = "start" if math.dist(pos, a) < 1e-9 else "end"
            releases[end] = [not c.RotationalStiffnessY.wrappedValue, not c.RotationalStiffnessZ.wrappedValue]
        out["members"][ident["EntityId"]] = {
            "localY": cross(z, xx),
            "A": props["CrossSectionArea"],
            "Iy": props["MomentOfInertiaY"],
            "Iz": props["MomentOfInertiaZ"],
            "J": props["TorsionalConstantX"],
            "E": mprops["YoungModulus"],
            "releases": releases,
        }
    out["loads"] = len(f.by_type("IfcStructuralAction"))
    return out


def project_view(p):
    nodes = {n["id"]: n["position"] for n in p["nodes"]}
    out = {"nodes": nodes, "members": {}, "supports": {s["id"]: s["fixed"] for s in p["supports"]}}
    mats = {m["id"]: m for m in p["materials"]}
    secs = {s["id"]: s for s in p["sections"]}
    for m in p["members"]:
        a, b = nodes[m["start"]], nodes[m["end"]]
        xx = unit(sub(b, a))
        y = unit(sub(m["localY"], [xx[i] * dot(m["localY"], xx) for i in range(3)]))
        s, mat = secs[m["section"]], mats[m["material"]]
        out["members"][m["id"]] = {"localY": y, "A": s["A"], "Iy": s["Iy"], "Iz": s["Iz"], "J": s["J"], "E": mat["E"],
                                   "releases": {"start": [m["releaseStart"]["my"], m["releaseStart"]["mz"]], "end": [m["releaseEnd"]["my"], m["releaseEnd"]["mz"]]}}
    return out


def close(a, b, path=""):
    if isinstance(a, dict):
        assert set(a) == set(b), f"{path}: keys {sorted(set(a) ^ set(b))}"
        for k in a:
            close(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        assert len(a) == len(b), path
        for k, (x, y) in enumerate(zip(a, b)):
            close(x, y, f"{path}[{k}]")
    elif isinstance(a, bool) or isinstance(b, bool):
        assert a == b, f"{path}: {a} vs {b}"
    else:
        assert abs(a - b) <= 1e-12 * max(abs(a), abs(b), 1e-300) or abs(a - b) < 1e-15, f"{path}: {a} vs {b}"


def export_checks():
    env = dict(os.environ, SOURCE_DATE_EPOCH="0")
    tmp = os.path.join(ROOT, "target", "exchange-oracle")
    os.makedirs(tmp, exist_ok=True)
    ukr = os.path.join(tmp, "UKR01.json")
    open(ukr, "w").write(subprocess.check_output([CLI, "reference-residential"], text=True))
    checks = []
    for name, src in (("X-FRAME", os.path.join(OUT, "X-FRAME.json")), ("UKR01", ukr)):
        ifc = os.path.join(tmp, name + ".ifc")
        subprocess.check_call([CLI, "exchange", "export", src, ifc], env=env, stdout=subprocess.DEVNULL)
        f, issues = validate(ifc)
        back = ifc_read_back(ifc)
        proj = subprocess.check_output([CLI, "exchange", "read", ifc], text=True)  # smoke: our own reader
        p = json.loads(open(src).read()) if name == "X-FRAME" else json.loads(open(ukr).read())
        if name == "X-FRAME":
            # Canonical ids: the fixture's own.
            view = project_view(p)
            close(view["nodes"], back["nodes"], name + ".nodes")
            close(view["members"], back["members"], name + ".members")
            close(view["supports"], back["supports"], name + ".supports")
        else:
            view = project_view(p)
            close(view["nodes"], back["nodes"], name + ".nodes")
            close(view["members"], back["members"], name + ".members")
        dxf = os.path.join(tmp, name + ".dxf")
        subprocess.check_call([CLI, "exchange", "export", src, dxf], env=env, stdout=subprocess.DEVNULL)
        doc = ezdxf.readfile(dxf)
        auditor = doc.audit()
        lines = [e for e in doc.modelspace() if e.dxftype() == "LINE"]
        assert doc.header.get("$INSUNITS") == 6
        assert len(lines) == len(p["members"])
        pos = {n["id"]: n["position"] for n in p["nodes"]}
        want = sorted(tuple(pos[m["start"]] + pos[m["end"]]) for m in p["members"])
        got = sorted(tuple(list(l.dxf.start) + list(l.dxf.end)) for l in lines)
        close([list(x) for x in want], [list(x) for x in got], name + ".dxf")
        checks.append({
            "project": name,
            "ifcSha256": sha(ifc),
            "ifcValidationIssues": issues,
            "ifcEntities": len(f.by_type("IfcRoot")),
            "ifcReadBack": "IfcOpenShell read nodes, member frames, section and material properties, releases and supports in SI and matched the project within 1e-12",
            "dxfSha256": sha(dxf),
            "dxfAuditErrors": len(auditor.errors),
            "dxfLines": len(lines),
        })
        assert not issues, (name, issues[:5])
        assert not auditor.has_errors, (name, [str(e) for e in auditor.errors][:5])
    return checks


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(CLI):
        sys.exit("build target/release/workbench-cli first")
    corpus = []
    for build in (portal_mm, feet_kip, blocked, planar):
        path, expected = build()
        f, issues = validate(path)
        expected["sha256"] = sha(path)
        expected["validationIssues"] = issues
        assert not issues, (path, issues[:5])
        corpus.append(expected)
    for path, expected in dxf_corpus():
        expected["sha256"] = sha(path)
        corpus.append(expected)
    record = {
        "version": "exchange-v1",
        "generator": "tools/oracles/exchange_oracle.py",
        "generatorSha256": sha(os.path.abspath(__file__)),
        "tools": {"ifcopenshell": ifcopenshell.version, "ezdxf": ezdxf.__version__, "python": sys.version.split()[0]},
        "schema": "IFC4 ADD2 TC1 (ISO 16739-1:2018), buildingSMART IFC4_ADD2_TC1.exp",
        "tolerance": 1e-9,
        "corpus": corpus,
        "exportChecks": export_checks(),
    }
    out = os.path.join(OUT, "exchange-oracle.json")
    with open(out, "w") as fh:
        json.dump(record, fh, indent=2)
        fh.write("\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
