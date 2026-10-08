/**
 * Design-object kinds as plug-ins (ADR 0033). Each kind is its catalogue
 * entry (names, family, profile) merged with a behaviour descriptor:
 *
 *   defaultSource(d)          the action source a draft opens with
 *   sources                   [[value, label]] for the standard inspector
 *   readiness(source)         the readiness sentence for that source
 *   solid(d, focus)           whether the viewport draws the draft solid
 *   caption(d, view)          the line under the design scene
 *   sketch(d, view)           SafeHtml for a 300 × 230 SVG illustration
 *   inspector                 standard-form config, or {render, bind?}
 *   read?(host, d)            kind-specific SetDesignPreview arguments
 *   summaryBasis?(run, d)     extra design-basis lines in the summary
 *   panes                     [{id, label, render?(ctx), load?(gateway)}];
 *                             no render, or render returning undefined,
 *                             falls back to the shared pane of that id
 *   schedule                  CSV format of the run's schedule
 *   report                    {order, html(project, runs, e), accepts?}
 *
 * A new kind is one descriptor file and one line below.
 */
import { CATALOGUE, kindInfo } from "./catalogue.js";
import { boundToResult } from "./kinds/shared.js";
import rcBeam from "./kinds/rc-beam.js";
import rcColumn from "./kinds/rc-column.js";
import slab from "./kinds/slab.js";
import padFooting from "./kinds/pad-footing.js";
import singlePlate from "./kinds/single-plate.js";
import compositeBeam from "./kinds/composite-beam.js";

const BEHAVIOUR = [
  rcBeam,
  rcColumn,
  slab,
  padFooting,
  singlePlate,
  compositeBeam,
];

const KINDS = new Map(
  CATALOGUE.map((info) => {
    const b = BEHAVIOUR.find((b) => b.kind === info.kind);
    if (!b) throw new Error(`No behaviour for design-object kind ${info.kind}`);
    return [
      info.kind,
      Object.freeze({
        ...info,
        ...b,
        report: { accepts: boundToResult, ...b.report },
      }),
    ];
  }),
);

/** The descriptor of a kind; an unknown kind is a programming error. */
export function designKind(kind) {
  kindInfo(kind);
  return KINDS.get(kind);
}

/** Every kind, in catalogue (explorer) order. */
export const designKinds = () => [...KINDS.values()];

/** Report sections of the recorded runs, in report order. */
export function reportSections(project, runs, context, e) {
  return designKinds()
    .slice()
    .sort((a, b) => a.report.order - b.report.order)
    .map((k) =>
      k.report.html(
        project,
        runs.filter((r) => r.kind === k.kind && k.report.accepts(r, context)),
        e,
      ),
    )
    .join("");
}
