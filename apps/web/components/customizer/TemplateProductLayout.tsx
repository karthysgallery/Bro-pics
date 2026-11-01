'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  PersonalizationStateSchema,
  checkCompleteness,
  deserializeState,
  type PersonalizationState,
  type PersonalizationTemplate,
  type Product,
  type ProductMedia,
  type PublicFrameModel,
  type Variant,
  glitterOffer,
} from '@bro-pics/shared';
import { AuthContext } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { useComboFrame } from '../../lib/combo-frame-context';
import { getOrCreateSessionId } from '../../lib/session-id';
import type { Orientation } from '../../lib/orientation';
import { BuyBox } from '../product/BuyBox';
import { CustomizerPreview } from './CustomizerPreview';
import { CustomizerControls } from './CustomizerControls';
import { LowResDialog, unconfirmedLowRes } from './LowResDialog';
import { useToast } from '../ui/Toast';
import { carryOverState } from './state-carry';
import { useTemplateCustomizer } from './use-template-customizer';

export interface TemplateProductLayoutProps {
  product: Product;
  variants: Variant[];
  selectedVariant: Variant;
  template: PersonalizationTemplate;
  selectedSize: string;
  selectedColour: string;
  selectedOrientation: Orientation | '';
  onSelectSize: (size: string) => void;
  onSelectColour: (colour: string) => void;
  onSelectOrientation: (orientation: Orientation) => void;
  /** From the cart's Edit link: the line whose design is being changed. */
  editPersonalizationId?: string;
  /** Frame models the product offers: the preview wraps the design in the selected size's model. */
  frameModels?: PublicFrameModel[];
  /** Product photos, shown as a strip under the preview. */
  media?: ProductMedia[];
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Product page body for a product with a published personalization template:
 * the template editor on the left, the buy box (with the photo controls) on the
 * right. Switching to a size with another layout keeps the customer's photos.
 */
export function TemplateProductLayout(props: TemplateProductLayoutProps) {
  const carried = useRef<PersonalizationState | null>(null);
  const { template } = props;
  const initialState = carried.current && carried.current.templateId + carried.current.templateVersion !== template.id + template.version
    ? carryOverState(carried.current, template).state
    : carried.current;
  return (
    <TemplateEditorSession
      key={`${template.id}@${template.version}`}
      {...props}
      initialState={initialState}
      onStateChange={(state) => {
        carried.current = state;
      }}
    />
  );
}

interface SessionProps extends TemplateProductLayoutProps {
  initialState: PersonalizationState | null;
  onStateChange: (state: PersonalizationState) => void;
}

function TemplateEditorSession({
  product,
  variants,
  selectedVariant,
  template,
  selectedSize,
  selectedColour,
  selectedOrientation,
  onSelectSize,
  onSelectColour,
  onSelectOrientation,
  editPersonalizationId,
  frameModels = [],
  media = [],
  initialState,
  onStateChange,
}: SessionProps) {
  const auth = useContext(AuthContext);
  const userRef = useRef(auth?.user ?? null);
  userRef.current = auth?.user ?? null;
  const { items, addItem, updateItem, removeItem } = useCart();
  const comboFrame = useComboFrame();
  // Each combo frame keeps its own unsaved design, separate from other frames of the same product.
  const draftProductId = comboFrame ? `${product.id}@${comboFrame.draftScope}` : product.id;

  // Resolved on first use, then fixed for this editing session (signing in rotates the stored id).
  const sessionRef = useRef<string | null>(null);
  const sessionId = useCallback(() => (sessionRef.current ??= getOrCreateSessionId()), []);
  const authToken = useCallback(async () => (userRef.current ? userRef.current.getIdToken() : null), []);
  // The product photos for the gallery, named for what they show (the automatic ones in their order). Photo sets
  // made since the styled shop-card photos carry a `role` on those two; older sets keep their original order.
  const galleryPhotos = useMemo(() => {
    type Shown = { auto?: boolean; role?: string };
    const images = media.filter((m) => m.type === 'image' && (m.variantId === null || m.variantId === selectedVariant.id));
    const styledSet = images.some((m) => (m as Shown).role);
    const AUTO = styledSet
      ? ['In the frame', '', '', 'Sizes', 'Frame details', 'The print', 'Matte vs glitter']
      : ['In the frame', 'Sizes', 'Frame details', 'On the wall', 'The print', 'Matte vs glitter'];
    let auto = 0;
    let own = 0;
    return images.map((m) => {
      const shown = m as Shown;
      const alt = m.alt || product.title;
      let label: string;
      if (shown.role) {
        auto++;
        label = /table/i.test(alt) ? 'On a table' : 'On the wall';
      } else label = shown.auto ? AUTO[auto++] || 'Photo' : `Photo ${++own}`;
      return { url: m.url, alt, label };
    });
  }, [media, selectedVariant.id, product.title]);
  const fixedDesign = template.photoSlots.length === 0 && template.textSlots.length === 0 && !(template.calendarSlots?.length);
  const model = frameModels.find((m) => m.id === selectedVariant.frameModelId);
  const frameLook = model?.image ? { src: model.image.url, borderPx: model.image.borderPx, mouldingWidthIn: model.mouldingWidthIn } : null;
  const printSizeIn = useMemo(() => ({ width: selectedVariant.widthIn, height: selectedVariant.heightIn }), [selectedVariant.widthIn, selectedVariant.heightIn]);

  const customizer = useTemplateCustomizer({
    template,
    productId: draftProductId,
    variantId: selectedVariant.id,
    printSizeIn,
    initialState,
    // A ready-made frame has nothing to save as a draft.
    useDrafts: !editPersonalizationId && !fixedDesign,
    sessionId,
    authToken,
  });

  useEffect(() => onStateChange(customizer.state), [customizer.state, onStateChange]);

  // Editing a cart line: load its design once the cart has it.
  const editingLine = editPersonalizationId ? items.find((i) => i.personalizationId === editPersonalizationId && i.personalization) : undefined;
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (editing || !editingLine?.personalization) return;
    const parsed = deserializeState(editingLine.personalization.state);
    if (!parsed.ok) return;
    customizer.replaceState(carryOverState(parsed.state, template).state);
    setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingLine, editing]);

  // Photo pickers: one for filling many spaces at once, one for a single space.
  const bulkInput = useRef<HTMLInputElement>(null);
  const singleInput = useRef<HTMLInputElement>(null);
  const targetSlot = useRef<string | null>(null);
  const requestPhoto = useCallback(
    (slotId: string) => {
      targetSlot.current = slotId;
      customizer.setActiveSlotId(slotId);
      singleInput.current?.click();
    },
    [customizer]
  );
  const addPhotos = useCallback(() => {
    if (template.photoSlots.length === 1) requestPhoto(template.photoSlots[0].id);
    else bulkInput.current?.click();
  }, [requestPhoto, template.photoSlots]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Glitter printing, when the product offers it (never inside a combo).
  const glitter = comboFrame ? null : glitterOffer(product);
  const [chosenFinish, setChosenFinish] = useState<'glitter' | undefined>(undefined);
  const finish = glitter ? chosenFinish : undefined;
  const finishExtra = glitter && finish ? glitter.extraPrice : 0;
  // Re-editing a glitter line starts with glitter chosen.
  useEffect(() => {
    if (editingLine?.finish === 'glitter') setChosenFinish('glitter');
  }, [editingLine?.finish]);

  const uploadCartPreview = async (personalizationId: string): Promise<string | undefined> => {
    const dataUrl = customizer.exportDesign(900, true);
    if (!dataUrl) return undefined;
    try {
      const res = await fetch('/api/uploads/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId() },
        body: JSON.stringify({ personalizationId, slotIndex: 0, dataUrl }),
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { previewPath?: unknown };
      return typeof body.previewPath === 'string' ? body.previewPath : undefined;
    } catch {
      // The cart shows the product image instead; never block the purchase on a thumbnail.
      return undefined;
    }
  };

  const handleAddToCart = async (quantity: number) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!(await customizer.waitForUploads())) {
        setSubmitError("A photo didn't upload. Add it again, then try once more.");
        return;
      }
      const state = customizer.stateRef.current;
      const check = checkCompleteness(template, state, { printSizeIn });
      if (!check.complete) {
        setSubmitError(check.blockers[0] ?? 'Your design is not complete yet.');
        return;
      }
      const cleanState = JSON.parse(JSON.stringify(PersonalizationStateSchema.parse(state))) as PersonalizationState;
      const personalizationId = editingLine?.personalizationId ?? crypto.randomUUID();
      const previewPath = await uploadCartPreview(personalizationId);
      const line = {
        title: `${product.title} — ${selectedVariant.sizeLabel}`,
        unitPriceSnapshot: selectedVariant.price + finishExtra,
        ...(previewPath && { previewPath }),
        ...(finish && { finish, finishExtra }),
        personalization: { templateId: template.id, templateVersion: template.version, state: cleanState },
      };
      if (editing && editingLine) {
        if (editingLine.variantId === selectedVariant.id) {
          updateItem(selectedVariant.id, personalizationId, { ...line, finish, finishExtra: finish ? finishExtra : undefined });
        } else {
          removeItem(editingLine.variantId, personalizationId);
          addItem({ ...line, variantId: selectedVariant.id, personalizationId, qty: editingLine.qty, productSlug: product.slug });
        }
      } else {
        addItem({ ...line, variantId: selectedVariant.id, personalizationId, qty: quantity, productSlug: product.slug });
        customizer.resetDesign();
      }
      window.dispatchEvent(new CustomEvent('karthys:open-cart'));
    } catch {
      setSubmitError("This couldn't be added to your cart. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const { completeness, unavailableSlots } = customizer;
  const ready = completeness.complete && unavailableSlots.length === 0;
  const reason =
    unavailableSlots.length > 0
      ? "A saved photo couldn't be loaded. Replace it to continue."
      : completeness.blockers.length > 1 && completeness.blockers.every((b) => b.startsWith('Add a photo'))
        ? `Add ${completeness.blockers.length} more photos to finish your design.`
        : completeness.blockers[0];

  // "Add to cart" on an unfinished design shows what is left instead of doing nothing: low-resolution photos are
  // listed together in a dialog; anything else scrolls to the photos and text, highlighted, with the reason.
  const { showToast } = useToast();
  const [lowResOpen, setLowResOpen] = useState(false);
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const [highlightControls, setHighlightControls] = useState(false);
  const explainBlocked = (quantity: number) => {
    if (unconfirmedLowRes(customizer).length > 0) {
      setPendingQuantity(quantity);
      setLowResOpen(true);
      return;
    }
    const missing = template.photoSlots.find((s) => s.required && !customizer.state.slots[s.id]);
    if (missing) customizer.setActiveSlotId(missing.id);
    document.getElementById('your-photos')?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightControls(true);
    window.setTimeout(() => setHighlightControls(false), 2200);
    if (reason) showToast(reason, 'error');
  };
  const continueAfterLowRes = () => {
    setLowResOpen(false);
    const quantity = pendingQuantity;
    setPendingQuantity(null);
    if (quantity === null) return;
    if (ready) void handleAddToCart(quantity);
    else explainBlocked(quantity);
  };

  return (
    <div className="flex flex-col gap-3">
      {customizer.draftOffer && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-tint px-4 py-3">
          <p className="text-sm text-ink">Continue where you left off? Your last design for this frame is saved on this device.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={customizer.discardDraft} className="h-9 rounded-full border border-line px-4 text-sm text-ink transition-colors hover:border-ink">
              Start fresh
            </button>
            <button type="button" onClick={customizer.restoreDraft} className="h-9 rounded-full bg-gold px-4 text-sm font-semibold text-ink transition-colors hover:bg-gold-deep">
              Restore my design
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
        <CustomizerPreview customizer={customizer} variant={selectedVariant} onRequestPhoto={requestPhoto} defaultImageUrl={product.primaryImageUrl || null} productTitle={product.title} frameLook={frameLook} photos={galleryPhotos} glitter={finish === 'glitter'} samples={product.samplePhotos} />
        <BuyBox
          product={product}
          variants={variants}
          selectedVariant={selectedVariant}
          selectedSize={selectedSize}
          selectedColour={selectedColour}
          selectedOrientation={selectedOrientation}
          onSelectSize={onSelectSize}
          onSelectColour={onSelectColour}
          onSelectOrientation={onSelectOrientation}
          personalizationReady={ready}
          personalizationReason={ready ? undefined : reason}
          onBlockedAddToCart={fixedDesign ? undefined : explainBlocked}
          submitting={submitting}
          submitError={submitError}
          onAddToCart={(quantity) => void handleAddToCart(quantity)}
          isEditingCartLine={editing}
          frameModels={frameModels}
          finish={finish}
          onFinishChange={setChosenFinish}
        >
          {!fixedDesign && (
            <div className={`rounded-2xl transition-shadow duration-300 ${highlightControls ? 'shadow-[0_0_0_3px_rgb(var(--color-gold))]' : ''}`}>
              <CustomizerControls customizer={customizer} onAddPhotos={addPhotos} onRequestPhoto={requestPhoto} />
            </div>
          )}
        </BuyBox>
      </div>
      <LowResDialog
        customizer={customizer}
        open={lowResOpen}
        onClose={() => {
          setLowResOpen(false);
          setPendingQuantity(null);
        }}
        onAllAccepted={continueAfterLowRes}
        onReplace={(slotId) => {
          setLowResOpen(false);
          setPendingQuantity(null);
          requestPhoto(slotId);
        }}
      />
      <input
        ref={bulkInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        data-testid="customizer-bulk-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) customizer.addPhotos(files);
        }}
      />
      <input
        ref={singleInput}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="customizer-single-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) customizer.addPhotos([file], targetSlot.current);
        }}
      />
    </div>
  );
}
