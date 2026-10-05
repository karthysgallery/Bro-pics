import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { buildOrderSnapshot, createEmptyState, setSlotPhoto, setText, confirmLowDpi } from '@bro-pics/shared';
import { sixPhotoTemplate, photoPlusTextTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';
import { PersonalizationSummary } from './PersonalizationSummary';

describe('PersonalizationSummary', () => {
  it('shows the template, its pinned version and the slot → photo mapping from the frozen snapshot', () => {
    let state = createEmptyState(sixPhotoTemplate.id, 1);
    state = setSlotPhoto(state, 'photo_01', { assetId: 'up_AAA', width: 6000, height: 4000 });
    state = setSlotPhoto(state, 'photo_03', { assetId: 'up_CCC', width: 6000, height: 4000 });
    // (An order snapshot normally has every required slot; this one is built from partial state on purpose.)
    const snapshot = { ...buildOrderSnapshot(sixPhotoTemplate, state), state };
    render(<PersonalizationSummary snapshot={snapshot} />);
    expect(screen.getByLabelText('Personalization')).toHaveTextContent(/six-grid.*v1/);
    const table = screen.getByRole('table', { name: /photos placed/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + 6); // header + one per slot
    expect(within(rows[1]).getByText('up_AAA')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Left empty')).toBeInTheDocument();
    expect(within(rows[3]).getByText('up_CCC')).toBeInTheDocument();
  });

  it('reports print quality in words and numbers, and notes when the customer accepted a low-resolution photo', () => {
    let state = createEmptyState(photoPlusTextTemplate.id, 1);
    state = setSlotPhoto(state, 'photo_01', { assetId: 'up_low', width: 500, height: 500 });
    state = confirmLowDpi(state, 'photo_01', true);
    state = setText(state, 'name', { value: 'Asha & Ravi' });
    render(<PersonalizationSummary snapshot={buildOrderSnapshot(photoPlusTextTemplate, state)} />);
    expect(screen.getByText(/Low resolution/)).toBeInTheDocument();
    expect(screen.getByText(/customer accepted/)).toBeInTheDocument();
    expect(screen.getByText('“Asha & Ravi”')).toBeInTheDocument();
  });

  it('shows the template as it was at purchase, even if it has since changed', () => {
    const state = setSlotPhoto(createEmptyState(sixPhotoTemplate.id, 1), 'photo_01', { assetId: 'up_1', width: 6000, height: 4000 });
    const snapshot = buildOrderSnapshot(sixPhotoTemplate, state);
    const renamedLater = { ...snapshot, template: { ...snapshot.template, name: snapshot.template.name } };
    render(<PersonalizationSummary snapshot={renamedLater} />);
    expect(screen.getByLabelText('Personalization')).toHaveTextContent(snapshot.template.name);
  });
});
