export function interactions(view) {
  const canvas = view.canvas;
  let drag = null,
    space = false;
  const location = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (!view.factor) return;
      const [x, y] = location(e),
        before = view.zoom;
      view.zoom = Math.max(
        0.005,
        Math.min(1000, before * Math.exp(-e.deltaY * 0.001)),
      );
      const ratio = view.zoom / before;
      view.pan = [
        x - view.width / 2 - (x - view.width / 2 - view.pan[0]) * ratio,
        y - view.height * 0.53 - (y - view.height * 0.53 - view.pan[1]) * ratio,
      ];
      view.draw();
    },
    { passive: false },
  );
  canvas.addEventListener("pointerdown", (e) => {
    if (!view.origin || !Number.isFinite(view.factor)) return;
    canvas.focus();
    const p = location(e);
    if (
      view.drawing &&
      e.button === 0 &&
      !e.altKey &&
      !space &&
      view.tool !== "pan"
    ) {
      view.onDrawPoint?.(view.pointAt(...p));
      return;
    }
    const orbit =
      view.mode === "3d" &&
      (e.button === 2 || e.altKey || view.tool === "orbit");
    const pan = e.button === 1 || space || view.tool === "pan";
    drag = {
      start: p,
      last: p,
      moved: 0,
      kind: orbit ? "orbit" : pan ? "pan" : "box",
      toggle: e.shiftKey,
      allowed: orbit || pan,
    };
    if (drag.kind === "box") {
      const current = drag;
      Promise.resolve(view.onDragStart?.(p)).then((blank) => {
        if (drag === current) current.allowed = blank;
      });
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = location(e);
    if (!drag) {
      if (view.drawing && view.origin) view.onDrawHover?.(view.pointAt(...p));
      else view.onHover?.(p);
      return;
    }
    const dx = p[0] - drag.last[0],
      dy = p[1] - drag.last[1];
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.kind === "orbit") {
      view.yaw += dx * 0.008;
      view.pitch = Math.max(-1.55, Math.min(1.55, view.pitch + dy * 0.008));
      view.draw();
    } else if (drag.kind === "pan") {
      view.pan[0] += dx;
      view.pan[1] += dy;
      view.draw();
    } else if (drag.moved > 5 && drag.allowed) {
      const box = document.querySelector("#selection-box");
      box.hidden = false;
      box.style.left = Math.min(p[0], drag.start[0]) + "px";
      box.style.top = Math.min(p[1], drag.start[1]) + "px";
      box.style.width = Math.abs(p[0] - drag.start[0]) + "px";
      box.style.height = Math.abs(p[1] - drag.start[1]) + "px";
    }
    drag.last = p;
  });
  canvas.addEventListener("pointerup", (e) => {
    const p = location(e);
    document.querySelector("#selection-box").hidden = true;
    if (drag?.kind === "box") {
      if (drag.moved < 5) view.pick(...p, drag.toggle);
      else if (drag.allowed)
        view.onBoxSelect?.([...drag.start, ...p], drag.toggle);
    }
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => {
    drag = null;
    document.querySelector("#selection-box").hidden = true;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      space = true;
    }
    if (e.key === "Home") {
      e.preventDefault();
      view.fit();
    }
    if (e.key === "Escape") {
      drag = null;
      document.querySelector("#selection-box").hidden = true;
      view.onCancel?.();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      view.onDelete?.();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      document.querySelector(e.shiftKey ? "#redo" : "#undo").click();
    }
  });
  canvas.addEventListener("keyup", (e) => {
    if (e.code === "Space") space = false;
  });
  canvas.addEventListener("blur", () => {
    space = false;
  });
}
