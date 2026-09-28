'use client';

import { useEffect, useState } from 'react';

interface DeliveryEstimateResponse {
  serviceable: boolean;
  zone?: 'metro' | 'standard' | 'remote';
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  error?: string;
}

interface PincodeCheckerProps {
  /** Pre-fills the input and, when `autoCheck` is true, checks it immediately. */
  initialPincode?: string;
  /** Checks `initialPincode` on mount/change without waiting for a click — used at checkout, where the pincode already comes from the selected address. */
  autoCheck?: boolean;
  className?: string;
}

/**
 * [FE-33] BE-21's `GET /api/delivery-estimate?pincode=` existed, tested,
 * and wired into nothing — this is that missing frontend piece. Every
 * structurally valid Indian pincode is serviceable (the site ships
 * everywhere); the only thing this ever reports is WHICH delivery
 * estimate applies, matching the coarse metro/standard/remote zones the
 * shipping-policy page already publishes.
 */
export function PincodeChecker({ initialPincode = '', autoCheck = false, className }: PincodeCheckerProps) {
  const [pincode, setPincode] = useState(initialPincode);
  const [result, setResult] = useState<DeliveryEstimateResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const check = async (value: string) => {
    if (value.trim().length === 0) return;
    setIsChecking(true);
    try {
      const response = await fetch(`/api/delivery-estimate?pincode=${encodeURIComponent(value.trim())}`);
      const body = await response.json();
      setResult(body);
    } catch {
      setResult({ serviceable: false, error: 'Could not check that pincode. Try again.' });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    setPincode(initialPincode);
    if (autoCheck && initialPincode) {
      check(initialPincode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPincode, autoCheck]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    check(pincode);
  };

  const zoneLabel = { metro: 'metro', standard: 'standard', remote: 'remote' } as const;

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value)}
          aria-label="Pincode"
          className="w-32 rounded-md border border-line px-3 py-1.5 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={isChecking}
          className="text-sm font-medium text-accent hover:text-accent-dark disabled:opacity-50"
        >
          {isChecking ? 'Checking…' : 'Check'}
        </button>
      </form>

      {result && (
        <p className="mt-2 text-sm" role="status">
          {result.serviceable ? (
            <span className="text-accent">
              Delivers in {result.estimatedDaysMin}-{result.estimatedDaysMax} days
              {result.zone && result.zone !== 'metro' ? ` (${zoneLabel[result.zone]} pincode)` : ''}
            </span>
          ) : (
            <span className="text-alert">{result.error ?? 'Enter a valid 6-digit pincode.'}</span>
          )}
        </p>
      )}
    </div>
  );
}
