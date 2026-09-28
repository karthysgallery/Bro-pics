import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { TextFieldEditor, type TextFieldValue } from './TextFieldEditor';

const baseField: TextFieldValue = { value: '', fontKey: 'dancing-script', color: '#2b2420' };

describe('[FE-44] TextFieldEditor accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <TextFieldEditor fieldKey="name" label="Name" field={baseField} onChange={vi.fn()} required />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
