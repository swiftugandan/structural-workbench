/**
 * Escaping HTML templates (ADR 0033). Every interpolation is escaped unless
 * it is already SafeHtml: another `html` result, or a fragment marked with
 * `raw()` (icons, markup from a trusted renderer). Arrays are joined, and
 * null, undefined and false render nothing, so conditionals and maps compose:
 *
 *     html`<ul>${items.map((i) => html`<li>${i.name}</li>`)}</ul>`
 *     html`${ok && html`<p>Done</p>`}`
 *
 * DOM-free: the result is a value until `render()` places it.
 */
const ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class SafeHtml {
  constructor(text) {
    this.text = text;
  }
  toString() {
    return this.text;
  }
}

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** A trusted fragment. Only for markup this application produced itself. */
export const raw = (text) =>
  text instanceof SafeHtml ? text : new SafeHtml(String(text ?? ""));

function part(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(part).join("");
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++)
    out += part(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Joins SafeHtml fragments (or escapes plain values) with a separator. */
export const join = (items, separator = "") =>
  new SafeHtml(items.map(part).join(part(separator)));

/** Places a SafeHtml value in `host`; plain strings are refused. */
export function render(host, safe) {
  if (!(safe instanceof SafeHtml))
    throw new TypeError("render() takes an html`…` value");
  host.innerHTML = safe.text;
  return host;
}
