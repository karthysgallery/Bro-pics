'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSafeHref } from '@bro-pics/shared';
import { useAdminApi } from '../../../components/admin/template-builder/use-admin-api';
import { MediaPickerModal } from '../../../components/admin/MediaPickerModal';
import { DEFAULT_FOOTER_LINKS } from '../../../components/layout/Footer';

interface Link {
  label: string;
  href: string;
}
interface Social {
  platform: string;
  url: string;
}
interface HeaderDoc {
  navLinks: Link[];
  showCategories: boolean;
  logoMediaId: string | null;
}
interface FooterDoc {
  links: Link[];
  tagline: string;
  socialLinks: Social[];
}

const DEFAULT_HEADER: HeaderDoc = {
  navLinks: [
    { label: 'Best sellers', href: '/#best-sellers' },
    { label: 'How it works', href: '/how-it-works' },
  ],
  showCategories: true,
  logoMediaId: null,
};
const DEFAULT_TAGLINE = 'Your photos, beautifully framed. Made in India.';
const PLATFORMS = ['Instagram', 'Facebook', 'YouTube', 'WhatsApp', 'Pinterest', 'X', 'LinkedIn'];

const input = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink outline-none focus:border-ink';
const card = 'space-y-4 rounded-2xl border border-line bg-paper p-5';

function linkProblem(l: Link): string | null {
  if (!l.label.trim()) return 'Every link needs a name.';
  if (!isSafeHref(l.href)) return `"${l.label}" needs a link starting with / (a page on this shop) or https://`;
  return null;
}

function LinkList({ links, onChange, max, addLabel, name }: { links: Link[]; onChange: (links: Link[]) => void; max: number; addLabel: string; name: string }) {
  const move = (i: number, d: number) => {
    const next = [...links];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-2">
          <input aria-label={`${name} ${i + 1} name`} value={l.label} placeholder="Name" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={input} />
          <input aria-label={`${name} ${i + 1} address`} value={l.href} placeholder="/how-it-works" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} className={input} />
          <div className="flex gap-1">
            <button type="button" aria-label={`Move ${l.label || 'link'} up`} disabled={i === 0} onClick={() => move(i, -1)} className="h-9 w-8 rounded-lg border border-line text-xs disabled:opacity-30">
              ↑
            </button>
            <button type="button" aria-label={`Move ${l.label || 'link'} down`} disabled={i === links.length - 1} onClick={() => move(i, 1)} className="h-9 w-8 rounded-lg border border-line text-xs disabled:opacity-30">
              ↓
            </button>
            <button type="button" aria-label={`Remove ${l.label || 'link'}`} onClick={() => onChange(links.filter((_, j) => j !== i))} className="h-9 rounded-lg border border-line px-2 text-xs text-alert">
              Remove
            </button>
          </div>
        </div>
      ))}
      {links.length < max && (
        <button type="button" onClick={() => onChange([...links, { label: '', href: '/' }])} className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink hover:text-ink">
          {addLabel}
        </button>
      )}
    </div>
  );
}

export default function HeaderFooterPage() {
  const api = useAdminApi();
  const [header, setHeader] = useState<HeaderDoc | null>(null);
  const [footer, setFooter] = useState<FooterDoc | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([
        api<{ value: Partial<HeaderDoc> | null }>('/api/admin/settings/header'),
        api<{ value: { columns?: { links: Link[] }[]; socialLinks?: Social[]; tagline?: string } | null }>('/api/admin/settings/footer'),
      ]);
      const nextHeader: HeaderDoc = h.value
        ? { navLinks: h.value.navLinks ?? [], showCategories: h.value.showCategories !== false, logoMediaId: h.value.logoMediaId ?? null }
        : DEFAULT_HEADER;
      const footerLinks = f.value?.columns?.flatMap((c) => c.links) ?? [];
      const nextFooter: FooterDoc = {
        links: footerLinks.length > 0 ? footerLinks : DEFAULT_FOOTER_LINKS,
        tagline: f.value?.tagline ?? DEFAULT_TAGLINE,
        socialLinks: f.value?.socialLinks ?? [],
      };
      setHeader(nextHeader);
      setFooter(nextFooter);
      setSaved(JSON.stringify([nextHeader, nextFooter]));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Settings could not be loaded.' });
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify([header, footer]) !== saved, [header, footer, saved]);
  const problems = useMemo(() => {
    if (!header || !footer) return [];
    const list = [...header.navLinks, ...footer.links].map(linkProblem).filter((p): p is string => p !== null);
    for (const s of footer.socialLinks) if (!/^https:\/\//i.test(s.url.trim())) list.push(`The ${s.platform} profile needs a full address starting with https://`);
    return [...new Set(list)];
  }, [header, footer]);

  if (!header || !footer) {
    return <div className="mx-auto max-w-5xl p-6 md:p-8">{message ? <p className="text-sm text-alert">{message.text}</p> : <div className="h-96 animate-pulse rounded-2xl bg-field" />}</div>;
  }

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const clean = (l: Link) => ({ label: l.label.trim(), href: l.href.trim() });
      await Promise.all([
        api('/api/admin/settings/header', {
          method: 'PUT',
          body: JSON.stringify({ navLinks: header.navLinks.map(clean), showCategories: header.showCategories, logoMediaId: header.logoMediaId }),
        }),
        api('/api/admin/settings/footer', {
          method: 'PUT',
          body: JSON.stringify({
            columns: [{ title: 'Links', links: footer.links.map(clean) }],
            socialLinks: footer.socialLinks.map((s) => ({ platform: s.platform, url: s.url.trim() })),
            tagline: footer.tagline.trim(),
          }),
        }),
      ]);
      setSaved(JSON.stringify([header, footer]));
      setMessage({ ok: true, text: 'Saved. The shop’s header and footer are updated.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'The changes could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 pb-28 md:p-8">
      <div className="space-y-1 border-b border-line pb-4">
        <h1 className="font-display text-xl font-bold text-ink md:text-2xl">Header & footer</h1>
        <p className="text-xs text-ink/60">The menu, logo and footer every shop page shows.</p>
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-xs font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-alert'}`}>
          {message.text}
        </p>
      )}

      <section className={card} aria-labelledby="logo">
        <h2 id="logo" className="text-sm font-semibold text-ink">
          Logo
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 min-w-[180px] items-center justify-center rounded-xl border border-line bg-field px-4">
            {header.logoMediaId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${encodeURIComponent(header.logoMediaId)}/image?w=480`} alt="Logo" className="h-10 w-auto max-w-[200px] object-contain" />
            ) : (
              <span className="font-display text-lg font-bold text-ink">
                Karthys<span className="text-gold">Gallery</span>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicker(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink">
              {header.logoMediaId ? 'Change logo' : 'Use a logo image'}
            </button>
            {header.logoMediaId && (
              <button type="button" onClick={() => setHeader({ ...header, logoMediaId: null })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink/70">
                Use the text logo
              </button>
            )}
          </div>
        </div>
        <p className="text-2xs text-ink/50">A transparent PNG works best. It shows about 40 px tall.</p>
      </section>

      <section className={card} aria-labelledby="menu">
        <div>
          <h2 id="menu" className="text-sm font-semibold text-ink">
            Menu
          </h2>
          <p className="text-2xs text-ink/55">“Shop all” always comes first.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={header.showCategories} onChange={(e) => setHeader({ ...header, showCategories: e.target.checked })} className="h-4 w-4 accent-[#14213D]" />
          List each main category in the menu automatically
        </label>
        <LinkList name="Menu link" links={header.navLinks} max={12} addLabel="Add menu link" onChange={(navLinks) => setHeader({ ...header, navLinks })} />
      </section>

      <section className={card} aria-labelledby="footer">
        <h2 id="footer" className="text-sm font-semibold text-ink">
          Footer
        </h2>
        <label className="block space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Line under the shop name</span>
          <input value={footer.tagline} maxLength={160} onChange={(e) => setFooter({ ...footer, tagline: e.target.value })} className={input} />
        </label>
        <div className="space-y-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Footer links</span>
          <LinkList name="Footer link" links={footer.links} max={20} addLabel="Add footer link" onChange={(links) => setFooter({ ...footer, links })} />
        </div>
        <div className="space-y-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink/55">Social profiles</span>
          {footer.socialLinks.map((s, i) => (
            <div key={i} className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-2">
              <select aria-label={`Profile ${i + 1} platform`} value={s.platform} onChange={(e) => setFooter({ ...footer, socialLinks: footer.socialLinks.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)) })} className={input}>
                {PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <input aria-label={`${s.platform} address`} value={s.url} placeholder="https://instagram.com/karthysgallery" onChange={(e) => setFooter({ ...footer, socialLinks: footer.socialLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className={input} />
              <button type="button" onClick={() => setFooter({ ...footer, socialLinks: footer.socialLinks.filter((_, j) => j !== i) })} className="h-9 rounded-lg border border-line px-2 text-xs text-alert">
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFooter({ ...footer, socialLinks: [...footer.socialLinks, { platform: PLATFORMS.find((p) => !footer.socialLinks.some((s) => s.platform === p)) ?? 'Instagram', url: '' }] })}
            className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink hover:text-ink"
          >
            Add social profile
          </button>
        </div>
      </section>

      {(dirty || busy) && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-gold/20 bg-ink px-5 py-3 text-paper shadow-2xl">
          <span className="max-w-[340px] text-xs">{problems.length > 0 ? <span className="font-semibold text-red-300">{problems[0]}</span> : 'Unsaved changes'}</span>
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl px-3 py-1.5 text-xs text-paper/70 hover:bg-paper/10 hover:text-paper">
            Discard
          </button>
          <button type="button" onClick={save} disabled={busy || problems.length > 0} className="rounded-xl bg-gold px-4 py-1.5 text-xs font-semibold text-ink hover:bg-gold-deep disabled:opacity-50">
            {busy ? 'Saving…' : 'Save & publish'}
          </button>
        </div>
      )}

      <MediaPickerModal
        isOpen={picker}
        onClose={() => setPicker(false)}
        allowedTypes={['image']}
        title="Choose the logo"
        onSelect={(asset) => {
          setHeader({ ...header, logoMediaId: asset.id });
          setPicker(false);
        }}
      />
    </div>
  );
}
