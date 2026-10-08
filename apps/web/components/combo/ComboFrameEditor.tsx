'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Combo, FrameTemplate, PersonalizationTemplate, Product, ProductMedia, Variant } from '@bro-pics/shared';
import { draftProgress, loadComboDraft, newComboDraft, saveComboDraft, withSavedFrame, type ComboDraft, type SavedFrame } from '../../lib/combo-draft';
import { ComboFrameProvider, type ComboFrameInfo } from '../../lib/combo-frame-context';
import { ProductDetailClient } from '../product/ProductDetailClient';

interface ComboFrameEditorProps {
  combo: Combo;
  frameKey: string;
  frameLabel: string;
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
  templatesByVariant: Record<string, FrameTemplate>;
  personalizationTemplatesByVariant: Record<string, PersonalizationTemplate>;
}

/**
 * One frame of a combo, personalized in the product's own editor. The editor is the same one a
 * single product uses; this only provides where the finished frame goes (the combo's draft)
 * and the frame-to-frame navigation around it.
 */
export function ComboFrameEditor({ combo, frameKey, frameLabel, product, variants, media, templatesByVariant, personalizationTemplatesByVariant }: ComboFrameEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<ComboDraft | null>(null);
  const draftRef = useRef<ComboDraft | null>(null);

  useEffect(() => {
    const loaded = loadComboDraft(combo) ?? newComboDraft(combo);
    draftRef.current = loaded;
    setDraft(loaded);
  }, [combo]);

  const variant = variants[0]!;
  const saved = draft?.frames[frameKey] ?? null;
  const progress = draftProgress(combo, draft);

  const onSave = useCallback(
    (frame: SavedFrame) => {
      const base = draftRef.current ?? newComboDraft(combo);
      const next = withSavedFrame(base, frameKey, { ...frame, productSlug: frame.productSlug ?? product.slug });
      draftRef.current = next;
      saveComboDraft(next);
      setDraft(next);
      // On to the next frame that still needs photos; the combo page once every frame is done.
      const following = draftProgress(combo, next).frames.find((f) => !f.done && f.frame.key !== frameKey);
      router.push(following ? `/combo/${combo.slug}/frame/${following.frame.key}` : `/combo/${combo.slug}#summary`);
    },
    [combo, frameKey, product.slug, router]
  );

  const info = useMemo<ComboFrameInfo>(
    () => ({ label: frameLabel, comboName: combo.name, draftScope: `${combo.id}:${frameKey}`, saved, variantId: variant.id, onSave }),
    [frameLabel, combo.name, combo.id, frameKey, saved, variant.id, onSave]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/combo/${combo.slug}`} className="text-sm font-medium text-accent hover:text-accent-dark">
          <span aria-hidden="true">&lsaquo;</span> Back to {combo.name}
        </Link>
        <p className="text-sm font-semibold text-ink" aria-live="polite">
          {progress.doneCount} of {progress.total} frames done
        </p>
      </div>

      <nav aria-label="Frames in this combo" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2">
          {progress.frames.map(({ frame, done }) => {
            const current = frame.key === frameKey;
            return (
              <li key={frame.key} className="shrink-0">
                <Link
                  href={`/combo/${combo.slug}/frame/${frame.key}`}
                  aria-current={current ? 'step' : undefined}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${current ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-gold'}`}
                >
                  <span aria-hidden="true">{done ? '✓' : '⚠'}</span>
                  <span>{frame.label}</span>
                  <span className="sr-only">{done ? 'completed' : 'needs photos'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {draft && (
        <ComboFrameProvider info={info}>
          <ProductDetailClient
            key={`${frameKey}:${saved?.personalizationId ?? 'new'}`}
            product={product}
            variants={variants}
            media={media}
            initialTemplatesByVariant={templatesByVariant}
            personalizationTemplatesByVariant={personalizationTemplatesByVariant}
            editPersonalizationId={saved?.personalizationId}
            initialVariantId={saved ? variant.id : undefined}
          />
        </ComboFrameProvider>
      )}
    </div>
  );
}
