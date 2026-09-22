'use client';

import {
  TEXT_FONT_OPTIONS,
  TEXT_COLOR_OPTIONS,
  MAX_TEXT_FIELD_LENGTH,
  fontFamilyForKey,
} from '../../lib/text-personalization-options';

export interface TextFieldValue {
  value: string;
  fontKey: string;
  color: string;
}

interface TextFieldEditorProps {
  fieldKey: string;
  label: string;
  field: TextFieldValue;
  onChange: (field: TextFieldValue) => void;
  // Per-template zone limit (FrameTemplate.textZones[].maxLength) — falls
  // back to the global default for callers that don't have a template zone
  // to read one from.
  maxLength?: number;
}

// One instance per text field (e.g. "Name", "Date") — a labelled input with
// a character counter, plus its own font and colour pickers, matching the
// reference site's per-field (not shared) font/colour selection.
export function TextFieldEditor({ fieldKey, label, field, onChange, maxLength = MAX_TEXT_FIELD_LENGTH }: TextFieldEditorProps) {
  const inputId = `text-field-${fieldKey}`;

  return (
    // The rule is a separator BETWEEN fields, so the first one in the
    // column does not get one — a line above the topmost label reads as the
    // bottom edge of something that is not there.
    <div className="mt-4 pt-4 first:mt-0 first:pt-0 border-t border-line first:border-t-0">
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-xs text-ink/50">
          {field.value.length}/{maxLength}
        </span>
      </div>
      <input
        id={inputId}
        type="text"
        maxLength={maxLength}
        value={field.value}
        placeholder={`Enter ${label.toLowerCase()} (optional)`}
        onChange={(event) => onChange({ ...field, value: event.target.value })}
        style={{ fontFamily: fontFamilyForKey(field.fontKey), color: field.color }}
        className="w-full rounded-md border border-line px-3 py-2 text-lg bg-paper"
      />

      <div className="mt-2">
        <span className="block text-xs text-ink/70 mb-1.5">Font</span>
        <div className="flex flex-wrap gap-2.5" role="group" aria-label={`${label} font`}>
          {TEXT_FONT_OPTIONS.map((font) => (
            <button
              key={font.key}
              type="button"
              aria-pressed={field.fontKey === font.key}
              onClick={() => onChange({ ...field, fontKey: font.key })}
              style={{ fontFamily: `var(${font.cssVariable})` }}
              className={`rounded-md border px-2.5 py-1.5 text-sm ${
                field.fontKey === font.key
                  ? 'border-accent bg-tint text-accent-dark'
                  : 'border-line text-ink'
              }`}
            >
              Abc
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2">
        <span className="block text-xs text-ink/70 mb-1.5">Colour</span>
        <div className="flex items-center gap-2.5" role="group" aria-label={`${label} colour`}>
          {TEXT_COLOR_OPTIONS.map((color) => (
            <button
              key={color.key}
              type="button"
              aria-label={color.label}
              aria-pressed={field.color === color.value}
              onClick={() => onChange({ ...field, color: color.value })}
              style={{ backgroundColor: color.value }}
              className={`w-6 h-6 rounded-full border-2 ${
                field.color === color.value ? 'border-accent' : 'border-line'
              }`}
            />
          ))}
          <input
            type="color"
            aria-label={`${label} custom colour`}
            value={field.color}
            onChange={(event) => onChange({ ...field, color: event.target.value })}
            className="w-6 h-6 rounded-full border border-line p-0 overflow-hidden"
          />
        </div>
      </div>
    </div>
  );
}
