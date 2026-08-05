/**
 * Draw a crop window over a stored figure.
 *
 * The window is metadata, not a new file. The PNGs live in the pyq-figures repo
 * and reach the browser over jsDelivr, so re-cutting one is a commit and a cache
 * wait — and the defect this exists for does not need new pixels anyway.
 * extractFigures runs the last option's rectangle to the bottom of the question
 * band, and the page footer sitting in that band is real ink that defeats the
 * whitespace trim, so the choice is followed by a screenful of blank and a
 * "Page 11 of 25". Everything wanted is already in the file. This says how much
 * of it to show, and clearing it puts the whole file back.
 *
 * Hence "Cut after the first block", which is the button that actually fixes
 * those: an ink bounding box cannot help when the thing to remove IS ink.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Loader2, RotateCcw, Scissors, X } from "lucide-react";
import type { CropWindow } from "../lib/pyqPapers";

/* ------------------------- reading the pixels ------------------------- */

/** Below this grey value a pixel counts as ink. Matches scripts/lib/figures.mjs. */
const INK = 200;
/** A row or column this full of ink is a rule — a table border — not content. */
const RULE_FRACTION = 0.85;
/** Breathing room left around the ink, in image pixels. */
const TRIM_PAD = 6;

type Ink = { w: number; h: number; rows: Int32Array; cols: Int32Array };

/**
 * Ink per row and per column, with table borders discounted.
 *
 * Ported from `trimToInk` rather than reinvented, so a window drawn here lands
 * where the converter would have landed. A blank bordered cell still has two
 * ink pixels in every row, and measured naively that reads as content — what
 * has to be asked of a row is whether anything is in it BESIDES the rules
 * passing through it.
 */
function measureInk(img: HTMLImageElement): Ink | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // The canvas is tainted — the host served the image without CORS headers.
    return null;
  }

  const rawRows = new Int32Array(h);
  const rawCols = new Int32Array(w);
  const isInk = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // These are greyscale PNGs, so any channel would do; the average keeps
      // this honest if a colour scan is ever linked.
      const grey = (data[i] + data[i + 1] + data[i + 2]) / 3;
      // A transparent pixel is page, not ink, whatever colour it claims.
      if (data[i + 3] > 32 && grey < INK) {
        isInk[y * w + x] = 1;
        rawRows[y]++;
        rawCols[x]++;
      }
    }
  }

  const ruleRow = new Uint8Array(h);
  const ruleCol = new Uint8Array(w);
  for (let y = 0; y < h; y++) ruleRow[y] = rawRows[y] >= w * RULE_FRACTION ? 1 : 0;
  for (let x = 0; x < w; x++) ruleCol[x] = rawCols[x] >= h * RULE_FRACTION ? 1 : 0;

  const rows = new Int32Array(h);
  const cols = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    if (ruleRow[y]) continue;
    for (let x = 0; x < w; x++) {
      if (!ruleCol[x] && isInk[y * w + x]) {
        rows[y]++;
        cols[x]++;
      }
    }
  }

  return { w, h, rows, cols };
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * How much of the crop's ink the window would hide, 0..1.
 *
 * Rows only. A question is set in full-width lines, so what a bad window costs
 * is always lines — and the operator needs a number before saving, not a
 * candidate discovering it in a paper.
 */
function hiddenInk(ink: Ink, rect: Rect): number {
  let total = 0;
  let inside = 0;
  const top = Math.round(rect.y);
  const bottom = Math.round(rect.y + rect.h);
  for (let y = 0; y < ink.h; y++) {
    total += ink.rows[y];
    if (y >= top && y < bottom) inside += ink.rows[y];
  }
  return total ? 1 - inside / total : 0;
}

/** The tightest box round every mark on the page, padded. */
function inkBounds(ink: Ink): Rect | null {
  const { w, h, rows, cols } = ink;
  let top = 0;
  while (top < h && rows[top] === 0) top++;
  if (top === h) return null;
  let bottom = h - 1;
  while (bottom > top && rows[bottom] === 0) bottom--;
  let left = 0;
  while (left < w && cols[left] === 0) left++;
  let right = w - 1;
  while (right > left && cols[right] === 0) right--;

  const x = Math.max(0, left - TRIM_PAD);
  const y = Math.max(0, top - TRIM_PAD);
  return {
    x,
    y,
    w: Math.min(w, right + TRIM_PAD + 1) - x,
    h: Math.min(h, bottom + TRIM_PAD + 1) - y,
  };
}

/** A gap this deep, as a share of the crop, is the rest of the page. */
const FOOTER_GAP = 0.25;
/** What is left under it may be this tall — a footer is a line or two. */
const FOOTER_TAIL = 0.1;
/** Where a footer may start, as a share of the crop. It is at the FOOT. */
const FOOTER_ZONE = 0.75;

/**
 * Drop a running footer stranded under a question by a band of blank page.
 *
 * This is the archive's actual defect: extractFigures runs the last option's
 * rectangle to the bottom of the question band, and the page footer sitting in
 * that band is ink, so an ink bounding box keeps the lot. What separates the
 * footer from the choice is a hand's width of nothing.
 *
 * A threshold on the gap ALONE was the first version's mistake. It cut at the
 * first blank run over 24px, and a question that merely has paragraphs is full
 * of those: GATE 2026 Q38 sets its match table with 27-50px between rows, so
 * the rule cut after "Q.38" and threw away 92% of the question — the table and
 * both column headings.
 *
 * Nor can the INK decide it. The obvious guard, "a footer is a rounding error
 * of the ink", is false exactly where this is needed: GATE 2022 Q42's option D
 * is the four glyphs "−4, 0", and "MT … Page 28" under it carries MORE ink
 * than the choice does.
 *
 * What is actually true of a running footer is where it sits. It is one or two
 * lines, in the bottom margin, behind a gap that is the whole rest of the
 * page — a quarter of the crop at the very least, where a paragraph break is a
 * line or so. All three are required, so a question whose parts are merely
 * spaced out is never touched and the worst this can do is nothing.
 */
function trailingFooter(ink: Ink): Rect | null {
  const bounds = inkBounds(ink);
  if (!bounds) return null;

  const end = bounds.y + bounds.h;
  const gapMin = Math.max(60, Math.round(ink.h * FOOTER_GAP));
  const tailMax = Math.max(40, Math.round(ink.h * FOOTER_TAIL));
  const zoneTop = ink.h * FOOTER_ZONE;

  let runStart = -1;
  for (let y = bounds.y; y <= end; y++) {
    if (y < end && ink.rows[y] === 0) {
      if (runStart < 0) runStart = y;
      continue;
    }
    if (runStart >= 0) {
      const deepEnough = y - runStart >= gapMin;
      const atTheFoot = y >= zoneTop;
      const shortEnough = end - y <= tailMax;
      if (deepEnough && atTheFoot && shortEnough) {
        const bottom = Math.min(ink.h, runStart + TRIM_PAD);
        return { ...bounds, h: Math.max(1, bottom - bounds.y) };
      }
      runStart = -1;
    }
  }
  return null;
}

/* ------------------------- window ↔ rectangle ------------------------- */

/** Insets in percent, which is what the column stores. */
function toWindow(rect: Rect, w: number, h: number): CropWindow {
  const round = (n: number) => Math.round(Math.max(0, n) * 100) / 100;
  return {
    top: round((rect.y / h) * 100),
    right: round(((w - rect.x - rect.w) / w) * 100),
    bottom: round(((h - rect.y - rect.h) / h) * 100),
    left: round((rect.x / w) * 100),
  };
}

function toRect(win: CropWindow | null, w: number, h: number): Rect {
  if (!win) return { x: 0, y: 0, w, h };
  return {
    x: (win.left / 100) * w,
    y: (win.top / 100) * h,
    w: ((100 - win.left - win.right) / 100) * w,
    h: ((100 - win.top - win.bottom) / 100) * h,
  };
}

/* --------------------------------- UI --------------------------------- */

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];
type Drag = { mode: Handle | "move" | "new"; startX: number; startY: number; from: Rect };

/** Nothing smaller than this can be dragged back out again. */
const MIN_SIDE = 8;

export default function FigureCropper({
  src,
  label,
  value,
  onApply,
  onClose,
}: {
  src: string;
  label: string;
  value: CropWindow | null;
  onApply: (crop: CropWindow | null) => void;
  onClose: () => void;
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ink, setInk] = useState<Ink | null>(null);
  const [inkBlocked, setInkBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  // The window this dialog opened on, held still. Read inside the load effect,
  // which must not list it as a dependency: the parent builds this object
  // fresh on every render, so depending on it would reload the image and throw
  // away the box mid-drag.
  const opened = useRef(value);

  /**
   * Two loads of the same file, and they are not redundant.
   *
   * The displayed one carries no crossOrigin, so it renders whatever the host
   * sends. The measured one asks for CORS, because a canvas drawn from an
   * image fetched without it cannot be read back — and if that request is the
   * one that fails, only the trim buttons are lost, not the editor.
   */
  useEffect(() => {
    let live = true;
    const shown = new Image();
    shown.onload = () => {
      if (!live) return;
      setNat({ w: shown.naturalWidth, h: shown.naturalHeight });
      setRect(toRect(opened.current, shown.naturalWidth, shown.naturalHeight));
    };
    shown.onerror = () => live && setFailed(true);
    shown.src = src;

    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      if (!live) return;
      const measured = measureInk(probe);
      if (measured) setInk(measured);
      else setInkBlocked(true);
    };
    probe.onerror = () => live && setInkBlocked(true);
    probe.src = src;

    return () => {
      live = false;
    };
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Client pixels → image pixels, through whatever the stage scaled to. */
  const toImage = useCallback(
    (clientX: number, clientY: number) => {
      const box = stage.current?.getBoundingClientRect();
      if (!box || !nat || !box.width) return { x: 0, y: 0 };
      const scale = nat.w / box.width;
      return { x: (clientX - box.left) * scale, y: (clientY - box.top) * scale };
    },
    [nat]
  );

  const clampRect = useCallback(
    (r: Rect): Rect => {
      if (!nat) return r;
      const w = Math.max(MIN_SIDE, Math.min(r.w, nat.w));
      const h = Math.max(MIN_SIDE, Math.min(r.h, nat.h));
      return {
        x: Math.max(0, Math.min(r.x, nat.w - w)),
        y: Math.max(0, Math.min(r.y, nat.h - h)),
        w,
        h,
      };
    },
    [nat]
  );

  const onPointerDown = (mode: Drag["mode"]) => (e: React.PointerEvent) => {
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toImage(e.clientX, e.clientY);
    // A fresh drag starts as a zero-size box at the pointer, so the first move
    // defines it rather than dragging whatever was there before.
    const from = mode === "new" ? { x: p.x, y: p.y, w: 0, h: 0 } : rect;
    setDrag({ mode, startX: p.x, startY: p.y, from });
    if (mode === "new") setRect(from);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !nat) return;
    const p = toImage(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const f = drag.from;

    if (drag.mode === "move") {
      setRect(clampRect({ ...f, x: f.x + dx, y: f.y + dy }));
      return;
    }
    if (drag.mode === "new") {
      setRect(
        clampRect({
          x: Math.min(drag.startX, p.x),
          y: Math.min(drag.startY, p.y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        })
      );
      return;
    }

    // Resize: each letter in the handle name names an edge it moves.
    let { x, y, w, h } = f;
    if (drag.mode.includes("n")) {
      y = f.y + dy;
      h = f.h - dy;
    }
    if (drag.mode.includes("s")) h = f.h + dy;
    if (drag.mode.includes("w")) {
      x = f.x + dx;
      w = f.w - dx;
    }
    if (drag.mode.includes("e")) w = f.w + dx;
    // Dragging an edge past its opposite would give a negative size; the edge
    // stops there instead of flipping, which is what every crop tool does.
    if (w < MIN_SIDE) {
      if (drag.mode.includes("w")) x = f.x + f.w - MIN_SIDE;
      w = MIN_SIDE;
    }
    if (h < MIN_SIDE) {
      if (drag.mode.includes("n")) y = f.y + f.h - MIN_SIDE;
      h = MIN_SIDE;
    }
    setRect(clampRect({ x, y, w, h }));
  };

  const endDrag = () => setDrag(null);

  const nudge = (e: React.KeyboardEvent) => {
    if (!rect) return;
    const step = e.shiftKey ? 10 : 1;
    const by: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const move = by[e.key];
    if (!move) return;
    e.preventDefault();
    setRect(clampRect({ ...rect, x: rect.x + move[0], y: rect.y + move[1] }));
  };

  /** Run one of the automatic trims, and leave the box alone if it finds
   *  nothing — an all-blank crop has no ink to bound and must not collapse. */
  const applyAuto = (find: (ink: Ink) => Rect | null) => {
    if (!ink) return;
    const found = find(ink);
    if (found) setRect(clampRect(found));
  };

  const apply = () => {
    if (!nat || !rect) return onApply(null);
    const win = toWindow(rect, nat.w, nat.h);
    // A window that crops nothing is stored as no window at all, so "drag it
    // back to the edges" and "Reset" leave the row in the same state.
    const cropped = win.top || win.right || win.bottom || win.left;
    onApply(cropped ? win : null);
  };

  const win = nat && rect ? toWindow(rect, nat.w, nat.h) : null;
  const hidden = ink && rect ? hiddenInk(ink, rect) : 0;
  const busy = !nat && !failed;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-3.5">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-800">
              <Crop size={16} /> Crop {label}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Drag a box over what the candidate should see. The stored file is not changed.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-100 p-5">
          {busy ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Loading the figure…
            </div>
          ) : failed || !nat || !rect ? (
            <p className="py-16 text-center text-sm text-rose-600">
              This figure could not be loaded. Check the path on the row behind this dialog.
            </p>
          ) : (
            <div
              ref={stage}
              onPointerDown={onPointerDown("new")}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative mx-auto select-none bg-white"
              style={{ width: nat.w, maxWidth: "100%", aspectRatio: `${nat.w} / ${nat.h}` }}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none block h-full w-full"
              />

              {/* Everything outside the window, dimmed. Four bars rather than a
                  hole punched in one overlay, so the kept area takes no paint
                  at all and the figure under it stays true to what will ship. */}
              {(
                [
                  { top: 0, left: 0, right: 0, height: pc(rect.y, nat.h) },
                  { bottom: 0, left: 0, right: 0, height: pc(nat.h - rect.y - rect.h, nat.h) },
                  { top: pc(rect.y, nat.h), left: 0, width: pc(rect.x, nat.w), height: pc(rect.h, nat.h) },
                  {
                    top: pc(rect.y, nat.h),
                    right: 0,
                    width: pc(nat.w - rect.x - rect.w, nat.w),
                    height: pc(rect.h, nat.h),
                  },
                ] as React.CSSProperties[]
              ).map((style, i) => (
                <div key={i} className="pointer-events-none absolute bg-slate-900/55" style={style} />
              ))}

              {/* The window. Focusable so the arrow keys can nudge it. */}
              <div
                tabIndex={0}
                onKeyDown={nudge}
                onPointerDown={onPointerDown("move")}
                className="absolute cursor-move outline-none ring-2 ring-indigo-500 focus:ring-indigo-400"
                style={{
                  left: pc(rect.x, nat.w),
                  top: pc(rect.y, nat.h),
                  width: pc(rect.w, nat.w),
                  height: pc(rect.h, nat.h),
                }}
              >
                {HANDLES.map((handle) => (
                  <span
                    key={handle}
                    onPointerDown={onPointerDown(handle)}
                    className="absolute h-3 w-3 rounded-sm border border-white bg-indigo-600"
                    style={handleStyle(handle)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyAuto(trailingFooter)}
              disabled={!ink}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              title="Drop a page footer left under the question by a band of blank page. Does nothing when there is real content below the gap."
            >
              <Scissors size={14} /> Drop a trailing footer
            </button>
            <button
              onClick={() => applyAuto(inkBounds)}
              disabled={!ink}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              title="Shrink to the ink, leaving a small margin"
            >
              Trim blank edges
            </button>
            <button
              onClick={() => nat && setRect({ x: 0, y: 0, w: nat.w, h: nat.h })}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw size={14} /> Whole image
            </button>

            <span className="ml-auto font-mono text-xs text-slate-400">
              {win && rect
                ? `${Math.round(rect.w)}×${Math.round(rect.h)}px · top ${win.top}% right ${win.right}% bottom ${win.bottom}% left ${win.left}%`
                : "—"}
            </span>
          </div>

          {/* A window that hides part of the question is the one mistake this
              dialog can make that nobody sees again until a candidate sits the
              paper — the stored file still has the words, and every list still
              reads as fine. So it is counted and said out loud. */}
          {hidden > 0.02 && (
            <p className="mt-2 text-xs font-medium text-rose-700">
              This window hides {Math.round(hidden * 100)}% of what is printed on this crop. Use
              “Whole image” unless you meant to cut the question down.
            </p>
          )}

          {inkBlocked && (
            <p className="mt-2 text-xs text-amber-700">
              The automatic trims need to read the image's pixels, and this host did not send the
              CORS header that allows it. Drag the box by hand.
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-100 bg-slate-50 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!rect}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Use this crop
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Positions in percent, so the overlay tracks the stage at any scale. */
const pc = (n: number, of: number) => `${(n / of) * 100}%`;

/** Each letter in the name puts the grip on that edge; a missing axis centres. */
function handleStyle(handle: Handle): React.CSSProperties {
  const style: React.CSSProperties = { cursor: `${handle}-resize` };

  if (handle.includes("n")) style.top = "-6px";
  else if (handle.includes("s")) style.bottom = "-6px";
  else style.top = "calc(50% - 6px)";

  if (handle.includes("w")) style.left = "-6px";
  else if (handle.includes("e")) style.right = "-6px";
  else style.left = "calc(50% - 6px)";

  return style;
}
