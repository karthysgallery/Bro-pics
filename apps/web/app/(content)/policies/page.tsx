import { redirect } from 'next/navigation';

/**
 * Retired. This page used to be a second copy of the shop's policies with fixed wording (claim windows,
 * dispatch times, an "updated" date) that nobody had approved. The real policy pages (/shipping-policy,
 * /return-refund-policy, /privacy, /terms) are the only source, so this address just forwards to them.
 */
export default function PoliciesPage(): never {
  redirect('/shipping-policy');
}
