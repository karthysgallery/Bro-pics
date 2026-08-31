'use client';

interface PersonalizeComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PersonalizeComingSoonModal({ isOpen, onClose }: PersonalizeComingSoonModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative bg-surface rounded-lg max-w-sm w-full p-6 text-center">
        <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 text-charcoal">
          ✕
        </button>
        <h2 className="font-display text-xl mb-2">Personalization Coming Soon</h2>
        <p className="text-sm text-charcoal/70">
          Our live photo editor is almost ready. In the meantime, message us on WhatsApp with your photo and we&apos;ll
          help you get started.
        </p>
      </div>
    </div>
  );
}
