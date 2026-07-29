import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BilingualText, DataTable, DataTableCell, DataTableRow, Numeric } from '@centresoutien/ui';

describe('DataTable', () => {
  it('renders semantic table markup so rows and columns stay associated', () => {
    render(
      <DataTable columns={['1.3fr', '120px']}>
        <DataTableRow>
          <DataTableCell>Mathématiques</DataTableCell>
          <DataTableCell>Active</DataTableCell>
        </DataTableRow>
      </DataTable>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('cell')).toHaveLength(2);
  });
});

describe('Numeric', () => {
  it('renders monospaced, end-aligned, forced-LTR figures', () => {
    render(<Numeric>1 250 MAD</Numeric>);
    const el = screen.getByText('1 250 MAD');
    expect(el.className).toContain('font-mono');
    expect(el.className).toContain('text-end');
    expect(el).toHaveAttribute('dir', 'ltr');
  });
});

describe('BilingualText', () => {
  it('renders Arabic values RTL inside an LTR page', () => {
    render(<BilingualText value="الرياضيات" script="arabic" />);
    const el = screen.getByText('الرياضيات');
    expect(el).toHaveAttribute('dir', 'rtl');
    expect(el.className).toContain('font-arabic');
  });

  it('leaves Latin values to inherit page direction', () => {
    render(<BilingualText value="Mathématiques" script="latin" />);
    expect(screen.getByText('Mathématiques')).not.toHaveAttribute('dir');
  });
});
