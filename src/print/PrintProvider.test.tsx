import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PrintButton } from './PrintButton';
import { PrintProvider } from './PrintProvider';
import type { PrintDocument } from './document';

const doc: PrintDocument = {
  title: 'Sales report',
  meta: [{ label: 'Branch', value: 'Olaya' }],
  sections: [
    {
      kind: 'table',
      heading: 'Orders by status',
      columns: [{ label: 'Status' }, { label: 'Orders', align: 'right' }],
      rows: [['Delivered', '1']],
      totals: ['Total', '1'],
    },
    { kind: 'keyValues', heading: 'Totals', items: [{ label: 'Total', value: 'SAR 225.00', strong: true }] },
    { kind: 'note', text: 'A note.' },
  ],
  footnote: 'Not a tax invoice.',
};

describe('PrintProvider', () => {
  it('renders nothing until something asks to print', () => {
    render(
      <PrintProvider>
        <PrintButton document={doc} />
      </PrintProvider>,
    );

    expect(document.querySelector('.print-root')).toBeNull();
  });

  it('renders the document and opens the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    render(
      <PrintProvider>
        <PrintButton document={doc} />
      </PrintProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));

    await waitFor(() => expect(document.querySelector('.print-root')).not.toBeNull());
    await waitFor(() => expect(print).toHaveBeenCalled());

    const printed = document.querySelector('.print-root')?.textContent ?? '';
    expect(printed).toContain('Sales report');
    expect(printed).toContain('Delivered');
    expect(printed).toContain('SAR 225.00');
    expect(printed).toContain('Not a tax invoice.');

    print.mockRestore();
  });

  it('names the print dialog after the document, then restores the page title', async () => {
    // The title is what a "Save as PDF" file gets called, so a report saved
    // from the browser should not be named after the admin panel.
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    document.title = 'Admin';

    render(
      <PrintProvider>
        <PrintButton document={doc} />
      </PrintProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(document.title).toBe('Sales report'));

    fireEvent(window, new Event('afterprint'));
    await waitFor(() => expect(document.title).toBe('Admin'));

    print.mockRestore();
  });

  it('clears the staged document after printing', async () => {
    // Otherwise a later Ctrl+P prints the last report instead of the page the
    // user is looking at.
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    render(
      <PrintProvider>
        <PrintButton document={doc} />
      </PrintProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(document.querySelector('.print-root')).not.toBeNull());

    fireEvent(window, new Event('afterprint'));
    await waitFor(() => expect(document.querySelector('.print-root')).toBeNull());

    print.mockRestore();
  });

  it('disables the button when there is nothing to print', () => {
    render(
      <PrintProvider>
        <PrintButton document={null} />
      </PrintProvider>,
    );

    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('does not blank the page when used outside a provider', () => {
    // A missing provider should disable a button, never take down the screen
    // the button sits on.
    expect(() => render(<PrintButton document={doc} />)).not.toThrow();
  });
});
