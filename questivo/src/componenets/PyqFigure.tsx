/**
 * A crop from a question paper, drawn through its window.
 *
 * Every screen that shows a PYQ figure goes through this — the player, the
 * review, and the admin bank — for the same reason they all share `renderMode`:
 * the admin's claim is that it shows what the candidate will get, and a second
 * implementation of the window arithmetic would eventually disagree with the
 * player's.
 *
 * With no window it renders the plain <img> it replaced, attribute for
 * attribute. That is the case on essentially every row in the archive, and it
 * is deliberately not routed through any of the code below.
 */

import { useState } from "react";
import type { CropWindow } from "../lib/pyqPapers";

type Props = {
  src: string;
  /** Insets in percent of the stored file, or null to draw it whole. */
  crop?: CropWindow | null;
  alt: string;
  /** Applied to whichever element defines the drawn box — see below. */
  className?: string;
  /** Cap on the drawn height, in px. */
  maxHeight?: number;
  loading?: "lazy" | "eager";
};

export default function PyqFigure({ src, crop, alt, className, maxHeight, loading }: Props) {
  /**
   * The file's own pixel size, which the window is a percentage OF.
   *
   * It has to be measured. A crop is two independent insets and CSS cannot
   * express the vertical one without it: a percentage margin or padding
   * resolves against the containing block's WIDTH on both axes, so a
   * "bottom: 62%" written that way crops by 62% of the width and is wrong by
   * whatever the aspect ratio is.
   *
   * Until it arrives the image is drawn whole. That is one frame — the browser
   * fires load before paint for anything already in cache, which after the
   * first question is all of them — and the failure mode is an image briefly
   * too tall rather than a box with nothing in it.
   */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  if (!crop) {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={className}
        style={maxHeight ? { maxHeight } : undefined}
      />
    );
  }

  const measure = (el: HTMLImageElement) => {
    if (el.naturalWidth && el.naturalHeight) {
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    }
  };

  if (!natural) {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={className}
        style={maxHeight ? { maxHeight } : undefined}
        onLoad={(e) => measure(e.currentTarget)}
        // A cached image can be complete before React attaches onLoad, and then
        // the event never fires and the crop is never applied. Braced because a
        // React 19 ref callback may only return a cleanup function.
        ref={(el) => {
          if (el?.complete) measure(el);
        }}
      />
    );
  }

  // The visible fraction of each axis, and the pixel size that leaves.
  const vw = (100 - crop.left - crop.right) / 100;
  const vh = (100 - crop.top - crop.bottom) / 100;
  const cropW = natural.w * vw;
  const cropH = natural.h * vh;

  // A height cap is applied as a WIDTH, so the box keeps its ratio. Setting
  // max-height beside aspect-ratio instead clamps the height while the width
  // stays, which stretches the crop.
  const drawW = maxHeight && cropH > maxHeight ? cropW * (maxHeight / cropH) : cropW;

  return (
    <span
      className={className}
      style={{
        display: "block",
        position: "relative",
        overflow: "hidden",
        width: drawW,
        maxWidth: "100%",
        // Height follows from this, so a narrow container scales the whole
        // window down instead of showing more of it.
        aspectRatio: `${cropW} / ${cropH}`,
      }}
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        style={{
          position: "absolute",
          width: `${100 / vw}%`,
          height: `${100 / vh}%`,
          left: `${-crop.left / vw}%`,
          top: `${-crop.top / vh}%`,
          // Tailwind's preflight sets `img { max-width: 100% }`, which would
          // clamp the oversized image back to the window and show the whole
          // file squeezed into it.
          maxWidth: "none",
        }}
      />
    </span>
  );
}
