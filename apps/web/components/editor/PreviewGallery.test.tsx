import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { PreviewGallery } from './PreviewGallery';

const PRODUCT = '/placeholders/classic-frame.jpg';
const DESIGN = 'data:image/png;base64,DESIGN';

function renderGallery(props: Partial<React.ComponentProps<typeof PreviewGallery>> = {}) {
  return render(
    <PreviewGallery defaultImageUrl={PRODUCT} personalizedImageUrl={null} hasPersonalization={false} alt="Classic frame" {...props}>
      <div data-testid="live-editor" />
    </PreviewGallery>
  );
}

const views = () => screen.getByRole('group', { name: /preview views/i });
const mainPicture = () => screen.getByTestId('preview-main-picture');

describe('PreviewGallery', () => {
  it('opens on the product picture (never a blank frame) with four thumbnails: frame, bedroom, hall, table', () => {
    renderGallery();
    expect(within(views()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Frame view',
      'Bedroom view',
      'Hall view',
      'Table view',
    ]);
    expect(within(views()).getByRole('button', { name: 'Frame view' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(mainPicture()).getByRole('img')).toHaveAttribute('src', PRODUCT);
  });

  it('switches the main view with the thumbnails; the rooms show the same product until a photo is added', () => {
    renderGallery();
    for (const [name, view] of [['Bedroom view', 'bedroom'], ['Hall view', 'hall'], ['Table view', 'table']] as const) {
      fireEvent.click(within(views()).getByRole('button', { name }));
      expect(within(views()).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
      expect(mainPicture()).toHaveAttribute('data-view', view);
      expect(within(mainPicture()).getByAltText(/in the scene/i)).toHaveAttribute('src', PRODUCT);
    }
  });

  it('switches every view to the customer’s design as soon as there is one', () => {
    const { rerender } = renderGallery();
    rerender(
      <PreviewGallery defaultImageUrl={PRODUCT} personalizedImageUrl={DESIGN} hasPersonalization alt="Classic frame">
        <div data-testid="live-editor" />
      </PreviewGallery>
    );
    // Frame view is the live editor; no static product picture remains.
    expect(screen.queryByTestId('preview-main-picture')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-editor').parentElement).toHaveClass('flex');
    for (const name of ['Bedroom view', 'Hall view', 'Table view']) {
      fireEvent.click(within(views()).getByRole('button', { name }));
      expect(within(mainPicture()).getByAltText(/in the scene/i)).toHaveAttribute('src', DESIGN);
    }
  });

  it('keeps the live editor mounted (hidden) while a room is showing, and removing the photo brings the product back', () => {
    const { rerender } = renderGallery({ personalizedImageUrl: DESIGN, hasPersonalization: true });
    fireEvent.click(within(views()).getByRole('button', { name: 'Bedroom view' }));
    expect(screen.getByTestId('live-editor')).toBeInTheDocument();
    expect(screen.getByTestId('live-editor').parentElement).toHaveClass('hidden');
    fireEvent.click(within(views()).getByRole('button', { name: 'Frame view' }));
    rerender(
      <PreviewGallery defaultImageUrl={PRODUCT} personalizedImageUrl={null} hasPersonalization={false} alt="Classic frame">
        <div data-testid="live-editor" />
      </PreviewGallery>
    );
    expect(within(mainPicture()).getByRole('img')).toHaveAttribute('src', PRODUCT);
  });

  it('falls back to the live editor, not a blank, when the product has no picture', () => {
    renderGallery({ defaultImageUrl: null });
    expect(screen.getByTestId('live-editor').parentElement).toHaveClass('flex');
  });

  describe('hover zoom', () => {
    const rect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) };
    const original = HTMLElement.prototype.getBoundingClientRect;
    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = original;
    });

    const pointer = (el: Element, type: string, init: { x?: number; y?: number; pointerType?: string; buttons?: number } = {}) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: init.x ?? 0, clientY: init.y ?? 0, buttons: init.buttons ?? 0 });
      Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
      act(() => {
        el.dispatchEvent(event);
      });
    };

    it('shows a lens and a magnified copy beside the picture for a mouse, and hides them when it leaves', () => {
      HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
      renderGallery();
      const stage = screen.getByTestId('preview-main-picture').parentElement!.parentElement!;
      expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();

      pointer(stage, 'pointermove', { x: 200, y: 200 });
      const lens = screen.getByTestId('zoom-lens');
      expect(lens.style.width).toBe('50%'); // 2x zoom -> the lens covers half
      expect(lens.style.left).toBe('25%'); // centred on the cursor
      const pane = screen.getByTestId('zoom-pane');
      expect(pane.querySelector('img')).toHaveAttribute('src', PRODUCT);

      // Cursor at the far corner: the lens stops at the edge instead of leaving the picture.
      pointer(stage, 'pointermove', { x: 400, y: 400 });
      expect(screen.getByTestId('zoom-lens').style.left).toBe('50%');

      pointer(stage, 'pointerleave');
      expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();
    });

    it('ignores touch and pen, and steps aside while a button is held (dragging a photo)', () => {
      HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
      renderGallery();
      const stage = screen.getByTestId('preview-main-picture').parentElement!.parentElement!;
      pointer(stage, 'pointermove', { x: 100, y: 100, pointerType: 'touch' });
      expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();
      pointer(stage, 'pointermove', { x: 100, y: 100, pointerType: 'pen' });
      expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();

      pointer(stage, 'pointermove', { x: 100, y: 100 });
      expect(screen.getByTestId('zoom-pane')).toBeInTheDocument();
      pointer(stage, 'pointermove', { x: 110, y: 110, buttons: 1 });
      expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();
    });

    it('magnifies the room view too', () => {
      HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
      renderGallery();
      fireEvent.click(within(views()).getByRole('button', { name: 'Hall view' }));
      const stage = screen.getByTestId('preview-main-picture').parentElement!.parentElement!;
      pointer(stage, 'pointermove', { x: 120, y: 80 });
      expect(within(screen.getByTestId('zoom-pane')).getByAltText(/in the scene/i)).toHaveAttribute('src', PRODUCT);
    });
  });
});
