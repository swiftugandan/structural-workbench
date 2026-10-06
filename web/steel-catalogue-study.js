import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";

export function steelCatalogueStudy({
  gateway,
  context,
  command,
  onRunning,
  onError,
  download,
  onRender,
  isCurrent,
}) {
  let catPromise,
    study = null,
    query = "",
    choices = null,
    generation = 0,
    running = false;
  const valid = (c) =>
    !c.locked &&
    !c.dirty &&
    !c.failed &&
    c.result?.modelHash === c.modelHash &&
    c.result?.analysisType !== "envelope";
  const current = (c) =>
    study &&
    valid(c) &&
    study.modelHash === c.modelHash &&
    study.resultId === c.result?.resultId &&
    study.memberId === c.memberId;
  async function render(host, screen) {
    if (!isCurrent(screen)) return;
    const token = ++generation,
      c = context();
    try {
      catPromise ||= gateway.send("steelCatalogue").catch((e) => {
        catPromise = null;
        throw e;
      });
      const cat = await catPromise;
      if (token !== generation || !isCurrent(screen)) return;
      const member = c.project?.members.find((m) => m.id === c.memberId);
      const ready = member
        ? await gateway.send("steelReadiness", { memberId: member.id })
        : null;
      if (
        token !== generation ||
        !isCurrent(screen) ||
        context().modelHash !== c.modelHash
      )
        return;
      // A study compares at most five candidates (Rust budget); the first five
      // records are preselected.
      choices ||= new Set(
        cat.shapes.slice(0, 5).map((s) => `${cat.id}:${s.designation}`),
      );
      const active = current(c),
        canStudy = valid(c) && ready?.status === "ready" && !running;
      const shapes = cat.shapes.filter((s) =>
        s.designation.toLowerCase().includes(query.toLowerCase()),
      );
      host.innerHTML = `<section class="steel-overview catalogue-study" data-testid="catalogue-study"><header><div><h3>${screen === "catalogue" ? "Section catalogue" : "Candidate section study"}</h3><p>${member ? esc(entityLabel(c.project, member.id)) : "Select one analytical member"} · ${screen === "catalogue" ? `${cat.shapes.length} verified W records` : "selected-member mass · current case only"}</p></div>${screen === "study" ? `<button id="candidate-run" class="primary" ${canStudy && choices.size && choices.size <= 5 ? "" : "disabled"}>${running ? "Reanalysing candidates…" : "Compare selected sections"}</button><button id="candidate-download" ${study ? "" : "disabled"}>Download study</button>` : ""}</header><p class="notice-small">${screen === "study" ? "Every candidate is reanalysed. Candidate results do not replace the live model. " : "Verified catalogue subset, not the complete AISC database. "}AISC S2 only; no whole-building compliance or global optimum claim.</p>${screen === "study" && !canStudy ? `<p>${esc(ready?.missing.concat(ready.unsupported).join("; ") || "Save inputs and analyse one current case before comparing.")}</p>` : ""}${screen === "study" ? `<details class="candidate-pool" ${study ? "" : "open"}><summary>Candidate pool · ${choices.size} selected${choices.size > 5 ? " · at most five per study" : ""}</summary>` : ""}<label>Search catalogue <input id="catalogue-search" value="${esc(query)}" placeholder="e.g. W18"></label><table><thead><tr>${screen === "study" ? "<th>Compare</th>" : ""}<th>Section</th><th>Depth (in)</th><th>Flange (in)</th><th>Area (in²)</th><th>Material / action</th></tr></thead><tbody>${shapes
        .map((s) => {
          const ref = `${cat.id}:${s.designation}`;
          return `<tr data-catalogue-row="${esc(s.designation)}">${screen === "study" ? `<td><input type="checkbox" data-candidate-ref="${esc(ref)}" aria-label="Compare ${esc(s.designation)}" ${choices.has(ref) ? "checked" : ""} ${running ? "disabled" : ""}></td>` : ""}<th>${esc(s.designation)}</th><td>${s.d}</td><td>${s.bf}</td><td>${s.A}</td><td>${screen === "catalogue" ? `<button data-assign-ref="${esc(ref)}" ${member && !c.locked && !c.dirty ? "" : "disabled"}>Assign ASTM A992</button>` : "ASTM A992"}</td></tr>`;
        })
        .join(
          "",
        )}</tbody></table><details><summary>Catalogue provenance and applicability</summary><p>${esc(cat.source)}<br>Version ${esc(cat.id)}<br>SHA-256 ${esc(cat.sourceSha256)}</p><p>US customary source values. Individual applicability checks may remain UNSUPPORTED; catalogue membership alone is not a design pass.</p></details>${screen === "study" ? "</details>" : ""}${screen === "study" && study ? `<section data-testid="candidate-results"><h3>${active ? "Candidate results" : "STALE candidate results"} · ${esc(study.memberId)}</h3><p>${esc(study.scope)}<br>All ${study.candidates.length} selected candidates evaluated. Objective: selected member mass only.</p><table><thead><tr><th>Section</th><th>Mass (kg)</th><th>Status</th><th>Governing check</th><th>Review / apply</th></tr></thead><tbody>${study.candidates.map((r, i) => `<tr data-candidate-result="${esc(r.designation)}"><th>${esc(r.designation)}</th><td>${r.massKg.toFixed(2)}</td><td>${active ? r.run.overall.toUpperCase() : "STALE"}</td><td>${esc(r.run.governingAction?.clause || "No nonzero design action")}</td><td><button data-candidate-record="${i}">Exact record</button><button data-apply-candidate="${i}" ${active ? "" : "disabled"}>Apply section</button></td></tr>`).join("")}</tbody></table><p>Baseline model ${esc(study.modelHash)}<br>Baseline result ${esc(study.resultId)}<br>Study ${esc(study.studyId)}</p></section>` : ""}</section>`;
      onRender(host);
      const repaint = () => render(host, screen);
      host.querySelector("#catalogue-search").onchange = (e) => {
        query = e.target.value;
        void repaint();
      };
      for (const el of host.querySelectorAll("[data-candidate-ref]"))
        el.onchange = () => {
          el.checked
            ? choices.add(el.dataset.candidateRef)
            : choices.delete(el.dataset.candidateRef);
          void repaint();
        };
      const assign = async (ref) => {
        try {
          const now = context();
          if (now.locked || now.dirty || now.memberId !== member?.id)
            throw Error("Selection or inputs changed; refresh first");
          await command("AssignSteelCatalogue", {
            id: member.id,
            sectionRef: ref,
            materialRef: cat.material.id,
          });
        } catch (e) {
          onError(e.message);
        } finally {
          void repaint();
        }
      };
      for (const el of host.querySelectorAll("[data-assign-ref]"))
        el.onclick = () => assign(el.dataset.assignRef);
      for (const el of host.querySelectorAll("[data-apply-candidate]"))
        el.onclick = () => {
          if (!current(context()))
            return onError("Study is stale; reanalyse and compare again.");
          void assign(
            study.candidates[Number(el.dataset.applyCandidate)].sectionRef,
          );
        };
      for (const el of host.querySelectorAll("[data-candidate-record]"))
        el.onclick = () =>
          download(
            "candidate-record.json",
            JSON.stringify(
              {
                ...study.candidates[Number(el.dataset.candidateRecord)],
                baselineModelHash: study.modelHash,
                currentState: current(context()) ? "current" : "stale",
              },
              null,
              2,
            ),
            "application/json",
          );
      host.querySelector("#candidate-download")?.addEventListener("click", () =>
        download(
          "steel-study.json",
          JSON.stringify(
            {
              ...study,
              currentState: current(context()) ? "current" : "stale",
            },
            null,
            2,
          ),
          "application/json",
        ),
      );
      host
        .querySelector("#candidate-run")
        ?.addEventListener("click", async () => {
          const now = context();
          if (
            !canStudy ||
            !valid(now) ||
            now.modelHash !== c.modelHash ||
            now.memberId !== c.memberId
          )
            return;
          running = true;
          onRunning(true);
          void repaint();
          try {
            const r = await gateway.send("studySteelCatalogue", {
              memberId: member.id,
              modelHash: c.modelHash,
              resultId: c.result.resultId,
              caseId: c.result.caseId,
              sectionRefs: [...choices],
            });
            if (
              context().modelHash !== c.modelHash ||
              context().result?.resultId !== c.result.resultId
            )
              throw Error("Study baseline changed");
            study = r;
          } catch (e) {
            onError(e.message);
          } finally {
            running = false;
            onRunning(false);
            void repaint();
          }
        });
    } catch (e) {
      if (token === generation) onError(e.message);
    }
  }
  return {
    render,
    cancelRender() {
      generation++;
    },
    reset() {
      generation++;
      study = null;
      query = "";
      choices = null;
    },
  };
}
