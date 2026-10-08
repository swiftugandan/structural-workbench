/**
 * Static facts about each design-object kind (ADR 0033): names, grouping and
 * the code profile it runs under. No behaviour and no imports, so identity,
 * the explorer and reports can read it without loading any renderer.
 * Behaviour lives in `registry.js`; the order here is the explorer order.
 */
const EC2 = {
  id: "ec2-uk-na",
  tag: "EC2 UK · DEMONSTRATION",
  label: "EC2 UK · demonstration",
  short: "EC2 UK",
  basis:
    "EC2 UK DEMONSTRATION · EN 1992-1-1:2004+AC:2010 with UK NA (2009); A1:2014 / NA+A2:2014 not reconciled; not a certified design. Draft dimensions do not change frame stiffness.",
};
const AISC = {
  id: "aisc-360-22-lrfd",
  tag: "AISC 360-22 · DEMONSTRATION",
  label: "AISC 360-22 LRFD · demonstration",
  short: "AISC 360-22",
};

export const CATALOGUE = [
  {
    kind: "rcBeam",
    name: "RC beam",
    group: "RC beams",
    family: "concrete",
    profile: EC2,
    binds: "members",
    target: () => "member",
  },
  {
    kind: "rcColumn",
    name: "RC column",
    group: "RC columns",
    family: "concrete",
    profile: EC2,
    binds: "members",
    target: () => "member",
  },
  {
    kind: "slab",
    name: "Slab",
    group: "Slabs",
    family: "concrete",
    profile: EC2,
    binds: null,
    target: () => "member",
  },
  {
    kind: "padFooting",
    name: "Pad footing",
    group: "Foundations",
    family: "concrete",
    profile: EC2,
    binds: "supports",
    target: () => "support",
  },
  {
    kind: "singlePlate",
    name: "Steel connection",
    group: "Steel connections",
    family: "steel",
    profile: AISC,
    binds: "members",
    target: (d) => `beam ${d.connection?.end === "start" ? "start" : "end"} of`,
  },
  {
    kind: "compositeBeam",
    name: "Composite beam",
    group: "Composite beams",
    family: "steel",
    profile: AISC,
    binds: "members",
    target: () => "member",
  },
];

const BY_KIND = new Map(CATALOGUE.map((k) => [k.kind, k]));

/** The catalogue entry of a kind; an unknown kind is a programming error. */
export function kindInfo(kind) {
  const info = BY_KIND.get(kind);
  if (!info) throw new Error(`Unknown design-object kind: ${kind}`);
  return info;
}
