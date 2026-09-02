'use client';

import { useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';
import type Konva from 'konva';
import { fractionRectToCanvasRect, EDITOR_CANVAS_SIZE, type Rect as GeometryRect } from '../../lib/editor-geometry';

const CANVAS_SIZE = EDITOR_CANVAS_SIZE;

interface EditorCanvasProps {
  mockupUrl: string;
  photoUrl: string | null;
  slotRect: GeometryRect;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: 0 | 90 | 180 | 270;
  onTransformChange: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
  // Fires with a fresh stage.toDataURL() PNG data URL whenever the visible
  // canvas actually changes (image loads, or scale/offset/rotation moves),
  // and with null if a capture isn't currently possible (no photo loaded
  // yet, or toDataURL() threw — e.g. a cross-origin canvas-taint
  // SecurityError). The parent stores the latest value per slot and uses
  // it as that slot's preview export on Done — next/dynamic's loadable
  // wrapper (used to keep react-konva, which touches `window` at import
  // time, off the server bundle) does not forward refs to the wrapped
  // component, so exposing the Stage via forwardRef/useImperativeHandle
  // and reading it later from the parent would silently resolve to null.
  // A callback invoked from inside this already-dynamically-loaded
  // component sidesteps that entirely. See Finding 3 in review.
  onCanvasUpdate?: (dataUrl: string | null) => void;
}

export function EditorCanvas({
  mockupUrl,
  photoUrl,
  slotRect,
  scale,
  offsetX,
  offsetY,
  rotationDeg,
  onTransformChange,
  onCanvasUpdate,
}: EditorCanvasProps) {
  const [mockupImage] = useImage(mockupUrl);
  // 'anonymous' is required for photos loaded from a cross-origin signed
  // GCS URL: without it, drawing the image into the canvas taints the
  // canvas and stage.toDataURL() (used for the Task 7 preview-export flow)
  // throws a SecurityError. This requires the Storage bucket to actually
  // send CORS headers permitting the app's origin (see cors.json at the
  // repo root) — but if that isn't configured (or hasn't been applied via
  // `gsutil cors set` yet), the browser doesn't just taint the canvas, it
  // FAILS the image load outright, and the customer would see an empty
  // slot instead of their photo. That's worse than a tainted canvas, so we
  // fall back to a same-URL, non-anonymous load (which taints the canvas
  // but still displays) whenever the anonymous load reports 'failed'. See
  // Finding 1 in the second-round review.
  const [anonymousPhotoImage, anonymousPhotoStatus] = useImage(photoUrl ?? '', 'anonymous');
  const [fallbackPhotoImage] = useImage(anonymousPhotoStatus === 'failed' ? (photoUrl ?? '') : '');
  const photoImage = anonymousPhotoStatus === 'failed' ? fallbackPhotoImage : anonymousPhotoImage;
  const photoNodeRef = useRef<Konva.Image>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const canvasSlotRect = fractionRectToCanvasRect(slotRect, CANVAS_SIZE, CANVAS_SIZE);

  useEffect(() => {
    if (!onCanvasUpdate) return;
    if (!photoImage || !stageRef.current) {
      onCanvasUpdate(null);
      return;
    }
    try {
      onCanvasUpdate(stageRef.current.toDataURL());
    } catch {
      // Canvas-taint SecurityError (missing/misconfigured Storage CORS) or
      // any other export failure — treated as "no preview available",
      // never thrown up into the render path.
      onCanvasUpdate(null);
    }
    // Re-capture whenever anything that changes the rendered pixels
    // changes; deliberately NOT depending on `onCanvasUpdate` itself,
    // which is a fresh closure every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoImage, scale, offsetX, offsetY, rotationDeg]);

  return (
    <Stage ref={stageRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="rounded-lg overflow-hidden bg-cream">
      <Layer clipX={canvasSlotRect.x} clipY={canvasSlotRect.y} clipWidth={canvasSlotRect.width} clipHeight={canvasSlotRect.height}>
        {photoImage && (
          <KonvaImage
            ref={photoNodeRef}
            image={photoImage}
            x={canvasSlotRect.x + offsetX}
            y={canvasSlotRect.y + offsetY}
            scaleX={scale}
            scaleY={scale}
            rotation={rotationDeg}
            draggable
            onDragEnd={(e) => onTransformChange({ scale, offsetX: e.target.x() - canvasSlotRect.x, offsetY: e.target.y() - canvasSlotRect.y })}
          />
        )}
      </Layer>
      <Layer>
        <Rect x={canvasSlotRect.x} y={canvasSlotRect.y} width={canvasSlotRect.width} height={canvasSlotRect.height} stroke="#C1592A" strokeWidth={2} />
        {mockupImage && <KonvaImage image={mockupImage} width={CANVAS_SIZE} height={CANVAS_SIZE} listening={false} />}
      </Layer>
    </Stage>
  );
}
