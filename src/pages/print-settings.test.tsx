import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Branch } from '../api/types';
import { DEFAULT_DOCKET_TEMPLATE } from '../print/docket/docket';
import { authState, makeApi, renderPage } from '../test/harness';

/**
 * The receipt template editor, and the one property that makes it worth having:
 * **the preview is the document**.
 *
 * It renders through the same `buildDocket` the Branch POS prints with, so an
 * assertion here is an assertion about what comes off the roll. The failure this
 * guards against is the ordinary one for editors — a preview drawn by a second,
 * prettier implementation of the layout, which agrees with the printer until
 * exactly the case somebody needed to check.
 */

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    api: authState.api,
    actor: authState.actor,
    isAuthenticated: true,
    isOwner: true,
    isBranchAdmin: false,
    hasRole: () => true,
    hasPermission: () => true,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { PrintSettingsPage } = await import('./PrintSettingsPage');

const BRANCH = { id: 'b1', code: 'OLY', name: 'Olaya', status: 'ACTIVE' } as unknown as Branch;

function mount(overrides: Record<string, unknown> = {}) {
  const api = makeApi({
    branches: [BRANCH],
    receiptTemplateDefault: { template: DEFAULT_DOCKET_TEMPLATE, updatedAt: null },
    receiptTemplateForBranch: {
      resolved: DEFAULT_DOCKET_TEMPLATE,
      organisationDefault: DEFAULT_DOCKET_TEMPLATE,
      override: {},
    },
    ...overrides,
  });
  renderPage(<PrintSettingsPage />, { api });
  return api;
}

async function preview(): Promise<HTMLElement> {
  return await screen.findByLabelText('Docket preview');
}

describe('the receipt template editor', () => {
  it('previews the real document, not a sketch of it', async () => {
    mount();

    const paper = await preview();
    expect(paper.textContent).toContain('Rami Broast');
    expect(paper.textContent).toContain('DELIVERY');
    expect(paper.textContent).toContain('TOTAL PAID');
    // The sample order is deliberately awkward: a first-time customer and both
    // kinds of discount, so an owner previews what most receipts look like
    // rather than the tidiest possible one.
    expect(paper.textContent).toContain('New customer');
    expect(paper.textContent).toContain('Promotion - 10% off wraps');
    expect(paper.textContent).toContain('Coupon WELCOME5');
    expect(paper.textContent).toContain('Not a tax invoice');
  });

  it('redraws as the owner types, before anything is saved', async () => {
    const api = mount();
    await preview();

    const thankYou = screen.getByLabelText('Thank-you', { selector: 'textarea' });
    fireEvent.change(thankYou, { target: { value: 'Shukran jazeelan' } });

    await waitFor(() => expect((screen.getByLabelText('Docket preview')).textContent).toContain('Shukran jazeelan'));
    // Typing is not saving. This is the screen where being sure matters: the
    // template is printed on every order after it.
    expect(api.saveReceiptTemplateDefault).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('previews the logo, because the text builder cannot express one', async () => {
    // The printing path sends the logo as its own job entry, so a preview that
    // only rendered the text would show the owner a document with a hole in it
    // exactly where their brand goes.
    mount();
    await preview();

    const logo = await screen.findByAltText('The logo as it will print');
    expect(logo.getAttribute('src')).toBe('/logo.jpeg');
  });

  it('takes the logo off the preview when it is switched off', async () => {
    mount();
    await preview();

    fireEvent.click(screen.getByRole('switch', { name: 'Print the logo at the top' }));

    await waitFor(() => expect(screen.queryByAltText('The logo as it will print')).toBeNull());
  });

  it('lets the owner set the logo size, and sends it', async () => {
    // A share of the paper rather than pixels: the same choice has to mean the
    // same thing on an 80mm and a 58mm roll.
    const api = mount();
    await preview();

    fireEvent.change(screen.getByLabelText('Logo size'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save for every branch' }));

    await waitFor(() => expect(api.saveReceiptTemplateDefault).toHaveBeenCalled());
    expect(api.saveReceiptTemplateDefault?.mock.calls[0]?.[0].logoWidthPercent).toBe(30);
  });

  it('previews the logo at the size it will print, not at one fixed width', async () => {
    // A preview that showed every size the same width would answer nothing —
    // the question an owner is asking is exactly "how big will this be?".
    mount();
    await preview();

    const before = (await screen.findByAltText('The logo as it will print')).style.width;
    fireEvent.change(screen.getByLabelText('Logo size'), { target: { value: '30' } });

    await waitFor(() =>
      expect(screen.getByAltText('The logo as it will print').style.width).not.toBe(before),
    );
  });

  it('takes a section off the paper when it is switched off', async () => {
    mount();
    await preview();

    fireEvent.click(screen.getByLabelText('Print Reference number'));

    await waitFor(() =>
      expect(screen.getByLabelText('Docket preview').textContent).not.toContain('Ref 481903772651'),
    );
  });

  it('sends what is on screen when Save is pressed', async () => {
    const api = mount();
    await preview();

    fireEvent.change(screen.getByLabelText('Thank-you', { selector: 'textarea' }), {
      target: { value: 'Shukran' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save for every branch' }));

    await waitFor(() => expect(api.saveReceiptTemplateDefault).toHaveBeenCalled());
    const sent = api.saveReceiptTemplateDefault?.mock.calls[0]?.[0];
    expect(sent.thankYouLines).toEqual(['Shukran']);
    // And the rest of the template goes with it: this is a PUT, so a partial
    // body would delete every field it omitted.
    expect(sent.sections).toEqual(DEFAULT_DOCKET_TEMPLATE.sections);
    expect(sent.footerLines).toEqual(DEFAULT_DOCKET_TEMPLATE.footerLines);
  });

  it('says a refusal out loud and keeps the edit', async () => {
    const api = mount({
      saveReceiptTemplateDefault: vi.fn().mockRejectedValue(new Error('the server refused it.')),
    });
    await preview();

    fireEvent.change(screen.getByLabelText('Thank-you', { selector: 'textarea' }), {
      target: { value: 'Shukran' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save for every branch' }));

    // "Nothing happened" used to cover a save that worked and one that did not.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Not saved');
    // The typed value stays: a refusal must not also lose the owner's work.
    expect(screen.getByLabelText('Docket preview').textContent).toContain('Shukran');
    expect(api.saveReceiptTemplateDefault).toHaveBeenCalled();
  });

  it('sends only the fields a branch is allowed to set', async () => {
    const api = mount();
    await preview();

    fireEvent.change(screen.getByLabelText('Thank-you for this branch', { selector: 'textarea' }), {
      target: { value: 'See you in Olaya' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save for this branch' }));

    await waitFor(() => expect(api.saveReceiptTemplateForBranch).toHaveBeenCalled());
    const [branchId, body] = api.saveReceiptTemplateForBranch?.mock.calls[0] ?? [];
    expect(branchId).toBe('b1');
    expect(body).toEqual({ thankYouLines: ['See you in Olaya'] });
    // Not the layout, the brand or the footer: the server refuses those, and a
    // control that offers them is a control that produces a 400.
    expect(Object.keys(body as object)).toEqual(['thankYouLines']);
  });
});
