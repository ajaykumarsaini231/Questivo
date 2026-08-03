// SVG sanitizer for model-generated question diagrams.
//
// Why diagrams are SVG and not images: no provider on this account generates
// images, and diffusion models are the wrong tool for exam figures anyway —
// they produce unreadable axis labels, invented circuit symbols and
// geometrically wrong constructions. SVG emitted as text is deterministic,
// scales cleanly, and flows through the existing text pipeline.
//
// The cost of that choice is that a model is now writing markup which the
// browser will execute in the user's origin. SVG is a full XML document format:
// it can carry <script>, event handlers, <foreignObject> with HTML inside,
// external entity references and javascript: URLs. Everything below assumes the
// model output is untrusted, because a prompt-injected question source could
// make it hostile.

const ALLOWED_TAGS = new Set([
  "svg", "g", "defs", "title", "desc", "style",
  "path", "line", "polyline", "polygon", "rect", "circle", "ellipse",
  "text", "tspan", "marker", "symbol", "use",
  "linearGradient", "radialGradient", "stop", "pattern", "clipPath", "mask",
]);

const ALLOWED_ATTRS = new Set([
  "viewbox", "width", "height", "xmlns", "version", "preserveaspectratio",
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "points", "transform", "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-opacity", "opacity",
  "font-family", "font-size", "font-weight", "font-style",
  "text-anchor", "dominant-baseline", "alignment-baseline", "dx", "dy",
  "id", "class", "offset", "stop-color", "stop-opacity",
  "gradientunits", "gradienttransform", "patternunits",
  "marker-end", "marker-start", "marker-mid", "orient", "refx", "refy",
  "markerwidth", "markerheight", "clip-path", "mask",
]);

const MAX_LENGTH = 20_000;

/**
 * SVG attribute names are case-sensitive, and several are camelCase. Matching
 * is done in lowercase, so the canonical spelling has to be restored on the way
 * out. The HTML parser happens to fix these itself for inline SVG, but that
 * only applies to HTML parsing — emit correct casing so the markup is also
 * valid standalone (in an <img src="...svg">, or parsed as XML).
 */
const ATTR_CASE = Object.fromEntries(
  [
    "viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform",
    "patternUnits", "patternTransform", "clipPath", "clipPathUnits",
    "markerWidth", "markerHeight", "markerUnits", "refX", "refY",
    "stdDeviation", "textLength", "lengthAdjust", "spreadMethod",
    "maskUnits", "maskContentUnits", "startOffset",
  ].map((n) => [n.toLowerCase(), n])
);

/**
 * @param {string} raw model-emitted SVG
 * @returns {string|null} safe SVG, or null if it cannot be made safe
 */
export function sanitizeSvg(raw) {
  if (!raw || typeof raw !== "string") return null;

  let svg = raw.trim();

  // Strip code fences the model may wrap around it.
  svg = svg.replace(/^```(?:svg|xml|html)?\s*/i, "").replace(/```$/, "").trim();

  const start = svg.indexOf("<svg");
  const end = svg.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  svg = svg.slice(start, end + 6);

  // A diagram this large is either an attack or a runaway generation.
  if (svg.length > MAX_LENGTH) return null;

  // Drop whole dangerous elements including their content.
  svg = svg.replace(/<\s*(script|foreignObject|iframe|object|embed|animate|set|handler)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // ...and their self-closing forms.
  svg = svg.replace(/<\s*(script|foreignObject|iframe|object|embed|animate|set|handler)\b[^>]*\/?>/gi, "");
  // XML plumbing that can pull in external content.
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  svg = svg.replace(/<!ENTITY[\s\S]*?>/gi, "");
  svg = svg.replace(/<\?[\s\S]*?\?>/g, "");
  svg = svg.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // Rebuild every tag from an allow-list rather than blacklisting attributes,
  // so an attribute we have never thought of cannot survive.
  svg = svg.replace(/<\s*(\/?)\s*([a-zA-Z0-9:-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, slash, tagRaw, attrsRaw) => {
    const tag = tagRaw.replace(/^svg:/i, "");
    const known = [...ALLOWED_TAGS].find((t) => t.toLowerCase() === tag.toLowerCase());
    if (!known) return "";
    if (slash) return `</${known}>`;

    const kept = [];
    const attrRe = /([a-zA-Z0-9:_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = attrRe.exec(attrsRaw)) !== null) {
      const name = m[1].toLowerCase();
      const value = m[3] !== undefined ? m[3] : m[4] || "";

      // Every on* handler, regardless of allow-list membership.
      if (name.startsWith("on")) continue;
      if (!ALLOWED_ATTRS.has(name)) continue;

      // No script or remote fetch through a URL-bearing value.
      const v = value.toLowerCase().replace(/\s|&#x?[0-9a-f]+;?/gi, "");
      if (v.includes("javascript:") || v.includes("data:text/html") || v.includes("vbscript:")) continue;
      if ((name === "clip-path" || name === "mask" || name.startsWith("marker")) && v.includes("url(http")) continue;

      kept.push(`${ATTR_CASE[name] || name}="${value.replace(/"/g, "&quot;")}"`);
    }
    const selfClosing = /\/\s*$/.test(attrsRaw) ? " /" : "";
    return `<${known}${kept.length ? " " + kept.join(" ") : ""}${selfClosing}>`;
  });

  // <use href> can reference external documents; only local fragments are safe.
  svg = svg.replace(/(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, attr, _q, dq, sq) => {
    const val = (dq ?? sq ?? "").trim();
    return val.startsWith("#") ? `${attr}="${val}"` : "";
  });

  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>$/i.test(svg)) return null;

  // A diagram with no drawing primitives is decoration at best.
  if (!/<(path|line|polyline|polygon|rect|circle|ellipse|text)\b/i.test(svg)) return null;

  // Guarantee a viewBox so the frontend can scale it responsively.
  if (!/viewbox\s*=/i.test(svg)) {
    svg = svg.replace(/^<svg/i, '<svg viewBox="0 0 400 300"');
  }

  return svg;
}
