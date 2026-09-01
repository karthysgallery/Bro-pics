'use client';

import { useRef } from 'react';
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
}: EditorCanvasProps) {
  const [mockupImage] = useImage(mockupUrl);
  const [photoImage] = useImage(photoUrl ?? '');
  const photoNodeRef = useRef<Konva.Image>(null);

  const canvasSlotRect = fractionRectToCanvasRect(slotRect, CANVAS_SIZE, CANVAS_SIZE);

  return (
    <Stage width={CANVAS_SIZE} height={CANVAS_SIZE} className="rounded-lg overflow-hidden bg-cream">
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
