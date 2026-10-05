import type { CSSProperties, FC } from 'react';

export interface FlexCarouselItem {
  /** Image URL, or the poster shown while `video` loads. */
  src: string;
  /** When set, the card is drawn as this looping, muted video. */
  video?: string;
  alt?: string;
  title?: string;
  subtitle?: string;
}

export interface FlexCarouselProps {
  items?: FlexCarouselItem[];
  preset?: 'liquid' | 'ribbon' | 'vortex' | 'arch';
  intro?: 'rise' | 'bloom' | 'spin' | 'deal' | 'none';
  fit?: 'natural' | 'portrait' | 'square' | 'landscape';
  cardHeight?: number;
  gap?: number;
  radius?: number;
  lensWidth?: number;
  lensHeight?: number;
  tilt?: number;
  roundness?: number;
  bend?: number;
  reach?: number;
  curl?: 'twist' | 'rise' | 'fall';
  dispersion?: number;
  liquid?: number;
  followCursor?: boolean;
  squeeze?: number;
  /** Card scale at the edges relative to the centre card (0 to 1). */
  sideScale?: number;
  focusOnClick?: boolean;
  autoplay?: boolean;
  interval?: number;
  captions?: boolean;
  captureWheel?: boolean;
  onChange?: (index: number, item: FlexCarouselItem) => void;
  onSelect?: (index: number, item: FlexCarouselItem) => void;
  /** Called when none of the items could be loaded. */
  onFail?: () => void;
  className?: string;
  style?: CSSProperties;
}

declare const FlexCarousel: FC<FlexCarouselProps>;
export default FlexCarousel;
