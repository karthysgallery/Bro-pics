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
  LOW_RES_CONFIRMATION_REQUIRED,
} from '@bro-pics/shared';
import { AuthContext } from '../../lib/auth-context';
import { useCart } from '../../lib/cart-context';
import { useComboFrame } from '../../lib/combo-frame-context';
import { getOrCreateSessionId } from '../../lib/session-id';
import type { Orientation } from '../../lib/orientation';
import { BuyBox } from '../product/BuyBox';
import { CustomizerPreview } from './CustomizerPreview';
import { DISPLAY_FRAME } from './frame-moulding';
import { CustomizerControls } from './CustomizerControls';
import { LowResDialog, unconfirmedLowRes } from './LowResDialog';
import { PhotoEditDialog } from './PhotoEditDialog';
import { frameConstructionImage } from '../product/frame-construction';
import { sizeGuideImage } from '../product/size-guide-image';
import { trackMeta } from '../../lib/meta-pixel';
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
  // The standard gallery, the same for every frame: 1 the frame, 2 on a table, 3 on the wall above a sofa, 4 the size
  // guide, 5 how it is made — then the product's video. Pictures 2–5 are made automatically from this product; the
  // owner can replace any of them with their own photo (Admin → product → photo "Use as").
  const owned = useMemo(() => {
    type Shown = { role?: string };
    const byRole = (role: string) => media.find((m) => m.type === 'image' && (m as Shown).role === role) ?? null;
    return { table: byRole('gallery-table'), hall: byRole('gallery-hall'), size: byRole('gallery-size'), construction: byRole('gallery-construction') };
  }, [media]);
  const video = useMemo(() => media.find((m) => m.type === 'video') ?? null, [media]);
  // The picture printed inside the drawn frames: a ready-made frame's own artwork; for a photo or collage frame the
  // automatic "The print" shop photo (the design filled with sample photos), else a sample photo, else the main photo.
  const autoPrint = useMemo(() => {
    type Shown = { auto?: boolean; role?: string };
    const images = media.filter((m) => m.type === 'image' && m.variantId === null);
    const styledSet = images.some((m) => (m as Shown).role === 'listing' || (m as Shown).role === 'listing-hover');
    const AUTO = styledSet ? ['In the frame', '', '', 'Sizes', 'Frame details', 'The print'] : ['In the frame', 'Sizes', 'Frame details', 'On the wall', 'The print'];
    let n = 0;
    for (const m of images) {
      const s = m as Shown;
      const label = s.role === 'listing' || s.role === 'listing-hover' ? (n++, '') : s.auto ? (AUTO[n++] ?? '') : '';
      if (label === 'The print') return m.url;
    }
    return null;
  }, [media]);
  const printPicture = product.artwork?.url || autoPrint || (template.photoSlots.length > 1 ? product.primaryImageUrl : null) || product.samplePhotos?.[0] || product.primaryImageUrl || null;
  const portraitDesign = template.canvas.height >= template.canvas.width;
  // "Premium Quality. Crafted Layer by Layer.": drawn with this product's own picture as the print.
  const [construction, setConstruction] = useState<string | null>(null);
  useEffect(() => {
    if (owned.construction) return;
    let alive = true;
    void frameConstructionImage(printPicture, portraitDesign).then((url) => alive && setConstruction(url));
    return () => {
      alive = false;
    };
  }, [printPicture, portraitDesign, owned.construction]);
  // Size guide from this product's own sizes, in the chosen orientation, with the chosen size shown big.
  const guideModel = frameModels.find((m) => m.id === selectedVariant.frameModelId);
  const guideSizes = useMemo(() => {
    const landscape = selectedVariant.widthIn > selectedVariant.heightIn;
    return variants.filter((v) => v.isActive !== false && v.widthIn > 0 && v.heightIn > 0 && v.widthIn > v.heightIn === landscape).map((v) => ({ widthIn: v.widthIn, heightIn: v.heightIn }));
  }, [variants, selectedVariant.widthIn, selectedVariant.heightIn]);
  const guideKey = `${JSON.stringify(guideSizes)}|${selectedVariant.widthIn}x${selectedVariant.heightIn}|${guideModel?.mouldingWidthIn ?? 1}|${printPicture}`;
  const [sizeGuide, setSizeGuide] = useState<string | null>(null);
  useEffect(() => {
    if (owned.size || guideSizes.length === 0 || !(selectedVariant.widthIn > 0)) return;
    let alive = true;
    void sizeGuideImage({ printUrl: printPicture, sizes: guideSizes, selected: { widthIn: selectedVariant.widthIn, heightIn: selectedVariant.heightIn }, mouldingIn: guideModel?.mouldingWidthIn ?? 1 }).then(
      (url) => alive && setSizeGuide(url)
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideKey, owned.size]);
  const isFixed = template.photoSlots.length === 0 && template.textSlots.length === 0 && !(template.calendarSlots?.length);
  // A ready-made frame shows the owner's own table/hall photos when they set them; a personalized frame always shows
  // the live room views, because those carry the customer's own photo.
  const ownRooms = isFixed && Boolean(owned.table || owned.hall);
  const galleryViews: Array<'plain' | 'table' | 'hall'> = ownRooms ? ['plain', ...(owned.table ? [] : (['table'] as const)), ...(owned.hall ? [] : (['hall'] as const))] : ['plain', 'table', 'hall'];
  const galleryPhotos = useMemo(
    () => [
      ...(ownRooms && owned.table ? [{ url: owned.table.url, alt: owned.table.alt || `${product.title} on a table`, label: 'Table' }] : []),
      ...(ownRooms && owned.hall ? [{ url: owned.hall.url, alt: owned.hall.alt || `${product.title} on the wall`, label: 'Hall' }] : []),
      ...(owned.size ? [{ url: owned.size.url, alt: owned.size.alt || `${product.title} size guide`, label: 'Size guide' }] : sizeGuide ? [{ url: sizeGuide, alt: `${product.title} size guide`, label: 'Size guide' }] : []),
      ...(owned.construction
        ? [{ url: owned.construction.url, alt: owned.construction.alt || `How the ${product.title} is made`, label: 'How it is made' }]
        : construction
          ? [{ url: construction, alt: `How the ${product.title} is made`, label: 'How it is made' }]
          : []),
      ...(video ? [{ url: video.url, alt: video.alt || `${product.title} video`, label: 'Video', video: true }] : []),
    ],
    [ownRooms, owned, sizeGuide, construction, video, product.title]
  );
  const fixedDesign = template.photoSlots.length === 0 && template.textSlots.length === 0 && !(template.calendarSlots?.length);
  const model = frameModels.find((m) => m.id === selectedVariant.frameModelId);
  // Every product is shown in the shop's premium black display frame (the moulding's real width is kept).
  const frameLook = { ...DISPLAY_FRAME, mouldingWidthIn: model?.mouldingWidthIn ?? DISPLAY_FRAME.mouldingWidthIn };
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
  // Meta: the customer started making it their own (first photo added) — once per page visit.
  const customizedRef = useRef(false);
  const hasPhoto = Object.keys(customizer.state.slots ?? {}).length > 0;
  useEffect(() => {
    if (!hasPhoto || customizedRef.current) return;
    customizedRef.current = true;
    trackMeta('CustomizeProduct', { content_ids: [product.id], content_name: product.title, content_type: 'product_group' });
  }, [hasPhoto, product.id, product.title]);

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
  // "Edit Image" under a space: select its photo and bring the editor (the big preview) into view.
  const controlsRef = useRef<HTMLDivElement>(null);
  // "Edit Image" opens that photo in its own window (PhotoEditDialog).
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const editPhoto = useCallback(
    (slotId: string) => {
      customizer.setActiveSlotId(slotId);
      setEditingSlot(slotId);
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

  // Blocks a second press at once; `submitting` (state) only takes effect after the next render, so quick double
  // taps used to add the frame twice.
  const submittingRef = useRef(false);
  const handleAddToCart = async (quantity: number) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
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
      // Photos coming on WhatsApp: the cart shows the product's own picture rather than an empty design.
      const previewPath = cleanState.photosVia === 'whatsapp' ? undefined : await uploadCartPreview(personalizationId);
      const line = {
        title: `${product.title} — ${selectedVariant.sizeLabel}${cleanState.photosVia === 'whatsapp' ? ' (photos on WhatsApp)' : ''}`,
        unitPriceSnapshot: selectedVariant.price + finishExtra,
        ...(previewPath && { previewPath }),
        ...(finish && { finish, finishExtra }),
        personalization: { templateId: template.id, templateVersion: template.version, state: cleanState },
      };
      // Waits until the cart has saved the line: the button stays on "Adding…" (no second press), and Buy now only
      // leaves for checkout once the line is really in the cart.
      if (editing && editingLine) {
        if (editingLine.variantId === selectedVariant.id) {
          await updateItem(selectedVariant.id, personalizationId, { ...line, finish, finishExtra: finish ? finishExtra : undefined });
        } else {
          await removeItem(editingLine.variantId, personalizationId);
          await addItem({ ...line, variantId: selectedVariant.id, personalizationId, qty: editingLine.qty, productSlug: product.slug });
        }
      } else {
        await addItem({ ...line, variantId: selectedVariant.id, personalizationId, qty: quantity, productSlug: product.slug });
        customizer.resetDesign();
      }
      window.dispatchEvent(new CustomEvent('karthys:open-cart'));
    } catch {
      setSubmitError("This couldn't be added to your cart. Check your internet connection and try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // After choosing photos, take the customer up to the frame preview so they see their photo in the frame at once
  // (the photo buttons sit further down, especially on phones). Skipped when the preview is already in view.
  const previewRef = useRef<HTMLDivElement>(null);
  // Runs on the frame after the photo is placed (the layout then includes it). A direct jump, not a smooth scroll:
  // phones returning from the gallery picker resize and re-lay out the page, which cancels a smooth scroll halfway.
  const showPreview = () => {
    window.requestAnimationFrame(() => {
      const el = previewRef.current;
      if (!el) return;
      const bar = document.querySelector<HTMLElement>('[data-site-header]')?.getBoundingClientRect().bottom ?? 0;
      const top = el.getBoundingClientRect().top;
      if (top >= bar && top < window.innerHeight * 0.4) return;
      window.scrollTo({ top: Math.max(0, window.scrollY + top - bar - 8) });
    });
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
    // The low-resolution popup is switched off for now (LOW_RES_CONFIRMATION_REQUIRED); the notice by the buttons replaces it.
    if (LOW_RES_CONFIRMATION_REQUIRED && unconfirmedLowRes(customizer).length > 0) {
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
        <div ref={previewRef} className="min-w-0 lg:self-stretch">
        <CustomizerPreview customizer={customizer} variant={selectedVariant} onRequestPhoto={requestPhoto} defaultImageUrl={product.primaryImageUrl || null} productTitle={product.title} frameLook={frameLook} photos={galleryPhotos} views={galleryViews} glitter={finish === 'glitter'} samples={product.samplePhotos} />
        </div>
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
          printQualityNotice={!fixedDesign && template.photoSlots.length > 0}
        >
          {!fixedDesign && (
            <div ref={controlsRef} className={`scroll-mt-28 rounded-2xl transition-shadow duration-300 ${highlightControls ? 'shadow-[0_0_0_3px_rgb(var(--color-gold))]' : ''}`}>
              <CustomizerControls customizer={customizer} onAddPhotos={addPhotos} onRequestPhoto={requestPhoto} onEditPhoto={editPhoto} />
            </div>
          )}
        </BuyBox>
      </div>
      {editingSlot && <PhotoEditDialog customizer={customizer} slotId={editingSlot} onClose={() => setEditingSlot(null)} />}
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
          if (files.length) {
            customizer.addPhotos(files);
            showPreview();
          }
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
          if (file) {
            customizer.addPhotos([file], targetSlot.current);
            showPreview();
          }
        }}
      />
    </div>
  );
}
