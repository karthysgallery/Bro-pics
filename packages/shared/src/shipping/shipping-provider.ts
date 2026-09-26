/**
 * [BE-20] Abstraction over "how do we get a tracking link for a courier
 * shipment" — lets a real courier-API-backed implementation swap in later
 * without touching any call site. No real courier API integration exists
 * yet (needs a live account with a specific courier/aggregator — same
 * external-account-blocked bucket as this pass's other logged gaps), so
 * ManualShippingProvider below is the only implementation: staff already
 * enters courier + AWB by hand (existing behavior), and this provider
 * just returns no tracking link for it.
 */
export interface ShippingProvider {
  trackingUrlFor(courier: string, awbNumber: string): string | null;
}

export class ManualShippingProvider implements ShippingProvider {
  trackingUrlFor(_courier: string, _awbNumber: string): string | null {
    return null;
  }
}
