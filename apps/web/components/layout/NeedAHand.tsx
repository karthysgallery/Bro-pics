'use client';

import { useBusinessContact, whatsappLink } from '../../lib/business-contact';

/** "Need a hand?" line built from the contact details the owner saved. Renders nothing when none are saved. */
export function NeedAHand({ reference }: { reference?: string }) {
  const contact = useBusinessContact();
  const wa = whatsappLink(contact, reference ? `Hi, I ran into an error (ref ${reference}).` : 'Hi, I need help.');
  if (!wa && !contact.supportEmail) return null;
  return (
    <>
      {wa && (
        <a href={wa} className="text-ink underline hover:text-accent">
          WhatsApp us
        </a>
      )}
      {wa && contact.supportEmail && ' or '}
      {contact.supportEmail && (
        <a href={`mailto:${contact.supportEmail}`} className="text-ink underline hover:text-accent">
          {contact.supportEmail}
        </a>
      )}
    </>
  );
}
