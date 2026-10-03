'use client';

import { useState, useId } from 'react';
import { useAuth } from '../../lib/auth-context';
import { AdminModal } from './AdminModal';
import { FormField } from './AdminForm';
import { useToast } from '../ui/Toast';

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNo: string;
  orderTotal: number;
  alreadyRefunded?: number;
  onSuccess: () => void;
}

export function RefundModal({
  isOpen,
  onClose,
  orderId,
  orderNo,
  orderTotal,
  alreadyRefunded = 0,
  onSuccess,
}: RefundModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const idempotencyKey = useId();

  const maxRefundable = Math.max(0, orderTotal - alreadyRefunded);

  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState<number>(maxRefundable);
  const [reason, setReason] = useState('Customer Request');
  const [typedConfirm, setTypedConfirm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const amountToRefund = refundType === 'full' ? maxRefundable : Number(partialAmount) || 0;
  const expectedTypedText = `REFUND-${amountToRefund}`;
  const isFormValid =
    amountToRefund > 0 &&
    amountToRefund <= maxRefundable &&
    typedConfirm.trim() === expectedTypedText;

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isFormValid) return;

    setIsProcessing(true);
    setErrorDetails(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${orderId}-${idempotencyKey}-${Date.now()}`,
        },
        body: JSON.stringify({
          amount: amountToRefund,
          reason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Failed to process refund via Razorpay');
      }

      showToast(`Successfully processed refund of ₹${amountToRefund}!`, 'success');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Refund processing failed';
      setErrorDetails(msg);
      showToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Issue Refund for Order #${orderNo}`}
      description="Direct Razorpay gateway refund processing"
    >
      <form onSubmit={handleSubmitRefund} className="space-y-4 text-xs">
        {/* Balance Breakdown */}
        <div className="p-3 rounded-xl border border-line bg-field space-y-1 text-2xs text-ink/70">
          <div className="flex justify-between">
            <span>Order Total:</span>
            <span className="font-bold text-ink">₹{orderTotal}</span>
          </div>
          <div className="flex justify-between">
            <span>Already Refunded:</span>
            <span className="font-mono text-red-600">₹{alreadyRefunded}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-line font-bold text-ink text-xs">
            <span>Max Refundable:</span>
            <span className="text-emerald-700">₹{maxRefundable}</span>
          </div>
        </div>

        {/* Refund Type */}
        <div className="space-y-2">
          <label className="text-2xs font-bold text-ink uppercase tracking-wider block">
            Refund Amount Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setRefundType('full');
                setPartialAmount(maxRefundable);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                refundType === 'full'
                  ? 'border-gold bg-gold/10 text-ink font-bold'
                  : 'border-line bg-paper text-ink/70 hover:bg-field'
              }`}
            >
              <span className="block text-xs">Full Refund</span>
              <span className="text-2xs text-ink/60">₹{maxRefundable}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRefundType('partial');
                setPartialAmount(Math.round(maxRefundable / 2));
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                refundType === 'partial'
                  ? 'border-gold bg-gold/10 text-ink font-bold'
                  : 'border-line bg-paper text-ink/70 hover:bg-field'
              }`}
            >
              <span className="block text-xs">Partial Refund</span>
              <span className="text-2xs text-ink/60">Custom amount</span>
            </button>
          </div>
        </div>

        {refundType === 'partial' && (
          <FormField label="Partial Refund Amount (₹)" required>
            <input
              type="number"
              min={1}
              max={maxRefundable}
              value={partialAmount}
              onChange={(e) => setPartialAmount(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-bold focus:outline-none focus:border-gold"
            />
          </FormField>
        )}

        {/* Reason */}
        <FormField label="Reason for Refund" required>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:outline-none focus:border-gold"
          >
            <option value="Customer Cancellation">Customer Cancellation</option>
            <option value="Damaged in Transit">Damaged in Transit</option>
            <option value="Defective Print / Framing">Defective Print / Framing</option>
            <option value="Delivery Delay">Delivery Delay / Unfulfilled</option>
            <option value="Goodwill Gesture">Goodwill Gesture / Discount</option>
            <option value="Other">Other</option>
          </select>
        </FormField>

        {/* Typed Confirmation */}
        <div className="p-3 rounded-xl border border-red-200 bg-red-50/50 space-y-2">
          <span className="text-2xs text-red-800 font-semibold block">
            Type <strong className="font-mono underline">{expectedTypedText}</strong> below to confirm refund authorization:
          </span>
          <input
            type="text"
            value={typedConfirm}
            onChange={(e) => setTypedConfirm(e.target.value)}
            placeholder={expectedTypedText}
            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-red-300 bg-paper text-ink focus:outline-none focus:border-red-500"
          />
        </div>

        {errorDetails && (
          <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-800 text-2xs space-y-1">
            <span className="font-bold block">Gateway Error:</span>
            <p>{errorDetails}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-line text-xs font-semibold hover:bg-field"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isFormValid || isProcessing}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors disabled:opacity-40"
          >
            {isProcessing ? 'Processing with Razorpay...' : `Authorize ₹${amountToRefund} Refund`}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
