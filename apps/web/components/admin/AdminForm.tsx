'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode, type FormEvent } from 'react';

interface SaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
  onReset?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  error?: string | null;
  className?: string;
}

export function SaveBar({
  isDirty,
  isSaving,
  onSave,
  onReset,
  saveLabel = 'Save Changes',
  cancelLabel = 'Discard',
  error,
  className = '',
}: SaveBarProps) {
  if (!isDirty && !isSaving && !error) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-3 rounded-2xl bg-ink text-paper shadow-2xl border border-gold/20 animate-slide-up ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
        <span className="text-xs font-medium">
          {error ? (
            <span className="text-red-300 font-semibold">{error}</span>
          ) : isSaving ? (
            'Saving changes…'
          ) : (
            'Unsaved changes'
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onReset && !isSaving && (
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 text-xs text-paper/70 hover:text-paper hover:bg-paper/10 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-gold hover:bg-gold-deep text-ink transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

const NATIVE_CONTROLS = new Set(['input', 'select', 'textarea']);

export function FormField({
  label,
  required = false,
  hint,
  error,
  children,
  className = '',
}: FormFieldProps) {
  const generatedId = useId();

  // When the child is a plain <input>/<select>/<textarea>, tie the label to it
  // (htmlFor/id) and surface required/invalid/hint state to assistive tech.
  // Custom components and compound children are left untouched — they are
  // responsible for their own labelling.
  let controlId = generatedId;
  let control: ReactNode = children;
  if (isValidElement(children) && typeof children.type === 'string' && NATIVE_CONTROLS.has(children.type)) {
    const existingId = (children.props as { id?: string }).id;
    controlId = existingId ?? generatedId;
    const describedBy = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;
    control = cloneElement(children as ReactElement<Record<string, unknown>>, {
      id: controlId,
      ...(required && { 'aria-required': true }),
      ...(error && { 'aria-invalid': true }),
      ...(describedBy && { 'aria-describedby': describedBy }),
    });
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={controlId} className="text-xs font-semibold text-ink">
          {label} {required && <span className="text-gold" aria-hidden="true">*</span>}
        </label>
        {hint && (
          <span id={`${controlId}-hint`} className="text-2xs text-ink/50">
            {hint}
          </span>
        )}
      </div>
      {control}
      {error && (
        <span id={`${controlId}-error`} role="alert" className="text-2xs text-alert font-medium">
          {error}
        </span>
      )}
    </div>
  );
}
