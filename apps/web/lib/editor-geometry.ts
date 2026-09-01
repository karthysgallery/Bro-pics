export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts a FrameTemplate.printableRects entry (fractions of the mockup
 * image's own width/height, 0-1) into canvas-pixel coordinates for a
 * canvas rendered at canvasWidthPx x canvasHeightPx.
 */
export function fractionRectToCanvasRect(rect: Rect, canvasWidthPx: number, canvasHeightPx: number): Rect {
  return {
    x: Math.round(rect.x * canvasWidthPx),
    y: Math.round(rect.y * canvasHeightPx),
    width: Math.round(rect.width * canvasWidthPx),
    height: Math.round(rect.height * canvasHeightPx),
  };
}
