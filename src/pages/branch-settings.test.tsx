import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/http';
import type { Branch, BranchSettings } from '../api/types';
import { authState, makeApi, paged, renderPage } from '../test/harness';

/**
 * Delivery pricing saves on an explicit button, and the outcome is always
 * stated.
 *
 * Getting this wrong is invisible in this app and loud in the customer's: a
 * branch whose maximum distance did not save keeps refusing deliveries at the
 * old limit, and nothing here would say so. So the assertions are about the
 * three things an owner has to be able to trust — that Save sends what is on
 * screen, that nothing is sent until they press it, and that a refusal is
 * announced rather than silently reverted.
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

vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtime: () => ({ status: 'connected', subscribe: () => () => {} }),
  useRealtimeReload: () => 'connected',
  RealtimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { BranchSettingsPage } = await import('./BranchSettingsPage');

const BRANCH = { id: 'b1', code: 'KAK-01', name: 'Kakkiyah', status: 'ACTIVE' } as unknown as Branch;

const SETTINGS: BranchSettings = {
  acceptsDelivery: true,
  acceptsPickup: true,
  isAcceptingOrders: true,
  acceptsCashOnDelivery: true,
  autoAcceptOrders: false,
  deliveryFeeMinor: 500,
  deliveryBaseFeeCoversKm: 5,
  deliveryPerKmFeeMinor: 300,
  deliveryRoadFactor: 1.3,
  deliveryUpliftPercent: 0,
  minOrderMinor: 4000,
  // The value in the owner's screenshot: a limit that refuses a 4.57 km order.
  deliveryRadiusKm: 1,
  prepTimeMinutes: 25,
};

/**
 * The stub is built from `Api.prototype` (see `test/harness.tsx`), so a method
 * this page calls cannot be quietly missing — hand-listing it was how the first
 * version of this test failed on `api.getOpeningHours is not a function`.
 */
/**
 * Mounts the page and waits for the branch settings to actually land in the
 * form before returning.
 *
 * The wait is the whole point. `findByPlaceholderText` resolves as soon as the
 * input *exists*, which is before the settings request has resolved — so a test
 * that typed straight after mounting was racing the load. When it lost, the
 * editor re-derived its draft from the settings that had just arrived and threw
 * the typed value away: the draft then matched the stored value, Save stayed
 * disabled, and the assertion failed as "expected spy to be called at least
 * once". Roughly one run in fifteen, across three different tests in this file.
 *
 * Waiting for the server's own `deliveryRadiusKm` (1) to appear is what makes
 * "the page is ready" observable rather than assumed.
 */
async function mount(updateBranchSettings: ReturnType<typeof vi.fn>) {
  const api = makeApi({
    branches: [BRANCH],
    branchSettings: SETTINGS,
    listUsers: paged([]),
    updateBranchSettings,
  });
  const rendered = renderPage(<BranchSettingsPage />, { api });
  await waitFor(async () => {
    expect((await radiusField()).getAttribute('value')).toBe('1');
  });
  return rendered;
}

async function radiusField() {
  return await screen.findByPlaceholderText('No limit');
}

const saveButton = () => screen.getByRole('button', { name: /save delivery pricing/i });

/**
 * The delivery-pricing card. Other panels on this page carry their own "Saved."
 * text, so the status assertions have to be scoped to this one or they match
 * whichever happens to be first.
 */
const pricingCard = (): HTMLElement => saveButton().closest('.card') as HTMLElement;

describe('Branch settings — delivery pricing', () => {
  it('sends nothing until Save is pressed', async () => {
    // The whole point of the change: an owner types, checks the preview, and
    // decides. Nothing reaches the server on the way past a field.
    const updateBranchSettings = vi.fn().mockResolvedValue(SETTINGS);
    await mount(updateBranchSettings);

    const field = await radiusField();
    fireEvent.change(field, { target: { value: '25' } });
    fireEvent.blur(field);

    expect(updateBranchSettings).not.toHaveBeenCalled();
    expect(within(pricingCard()).getByText('Unsaved changes.')).toBeTruthy();
  });

  it('Save is inert until something actually changes', async () => {
    await mount(vi.fn());
    await radiusField();

    expect(saveButton()).toHaveProperty('disabled', true);
  });

  it('sends the whole pricing block on Save, with the radius the owner typed', async () => {
    const updateBranchSettings = vi
      .fn()
      .mockResolvedValue({ ...SETTINGS, deliveryRadiusKm: 25 });
    await mount(updateBranchSettings);

    fireEvent.change(await radiusField(), { target: { value: '25' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateBranchSettings).toHaveBeenCalled());
    expect(updateBranchSettings).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ deliveryRadiusKm: 25 }),
    );
    expect(await within(pricingCard()).findByText('Saved.')).toBeTruthy();
  });

  it('sends null for a blank maximum distance, never zero', async () => {
    // Blank means "we deliver anywhere". Zero refuses every delivery — the
    // failure the branch wizard once shipped with `|| 0`.
    const updateBranchSettings = vi
      .fn()
      .mockResolvedValue({ ...SETTINGS, deliveryRadiusKm: null });
    await mount(updateBranchSettings);

    fireEvent.change(await radiusField(), { target: { value: '' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateBranchSettings).toHaveBeenCalled());
    expect(updateBranchSettings).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ deliveryRadiusKm: null }),
    );
  });

  it('says so when the save is rejected, instead of looking saved', async () => {
    // The failure this exists for: the panel used to apply the value locally
    // and swallow the rejection, so an owner set 25, saw 25, and customers
    // kept being refused at the old limit.
    const updateBranchSettings = vi.fn().mockRejectedValue(
      new ApiError({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'deliveryRadiusKm must not be greater than 500',
      }),
    );
    await mount(updateBranchSettings);

    fireEvent.change(await radiusField(), { target: { value: '900' } });
    fireEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/Not saved/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/greater than 500/i);
  });

  it('puts the server value back in the box after a rejected save', async () => {
    const updateBranchSettings = vi.fn().mockRejectedValue(new Error('offline'));
    await mount(updateBranchSettings);

    fireEvent.change(await radiusField(), { target: { value: '900' } });
    fireEvent.click(saveButton());

    await screen.findByRole('alert');
    // waitFor, not a bare read. `findBy*` waits for the *element*, and the input
    // already exists — so it resolves without waiting for its value to change.
    // The revert is a second state update behind the alert: the catch sets the
    // error, then restores `settings`, and only then does the editor re-derive
    // its draft from it. Reading the attribute in the same tick as the alert
    // caught the box mid-revert roughly one run in twenty.
    await waitFor(async () => {
      expect((await radiusField()).getAttribute('value')).toBe('1');
    });
  });

  it('Discard puts the form back without touching the server', async () => {
    const updateBranchSettings = vi.fn();
    await mount(updateBranchSettings);

    fireEvent.change(await radiusField(), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));

    // Same reason as the rejected-save test above: the element is already
    // present, so only waiting on its value is meaningful.
    await waitFor(async () => {
      expect((await radiusField()).getAttribute('value')).toBe('1');
    });
    expect(updateBranchSettings).not.toHaveBeenCalled();
  });
});

/**
 * Opening hours.
 *
 * The panel existed and could not be used. `GET /hours` returns only the rows
 * that exist, the editor mapped straight over them, and every branch has none —
 * so it rendered a heading, a Save button and nothing in between. There was no
 * way to add a day, so no branch could ever get a first schedule, which is why
 * the backend's whole opening-hours rule was inert: it had nothing to enforce.
 *
 * These mount the real panel because that is the only place the failure lived.
 * `weekFrom` is unit-tested next door, and it was passing the entire time the
 * screen was blank.
 */
describe('Branch settings — opening hours', () => {
  const mountHours = async (overrides: Record<string, unknown> = {}) => {
    const api = makeApi({
      branches: [BRANCH],
      branchSettings: SETTINGS,
      listUsers: paged([]),
      ...overrides,
    });
    const rendered = renderPage(<BranchSettingsPage />, { api });
    await screen.findByText('Opening hours');
    return { ...rendered, api };
  };

  it('offers all seven days for a branch that has never had hours', async () => {
    await mountHours();

    for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      expect(screen.getByText(day)).toBeTruthy();
      // And each is editable, not a read-only row: the "Open" checkbox is what
      // turns a day on, and without it there is nothing to press.
      expect(screen.getByLabelText(`${day} open`)).toBeTruthy();
    }
  });

  it('warns that an unscheduled branch is currently taking orders at any hour', async () => {
    // Saving this form is the moment a branch starts refusing customers at
    // night, and that is not obvious from a grid full of times.
    await mountHours();
    expect(screen.getByText(/takes orders/i).textContent).toMatch(/at any hour/i);
  });

  it('sends a full week on save, including the days left closed', async () => {
    const setOpeningHours = vi.fn().mockResolvedValue([]);
    await mountHours({ setOpeningHours });

    fireEvent.click(screen.getByLabelText('Monday open'));
    fireEvent.click(screen.getByRole('button', { name: /save hours/i }));

    await waitFor(() => expect(setOpeningHours).toHaveBeenCalled());
    const [, week] = setOpeningHours.mock.calls[0] as [string, { dayOfWeek: number }[]];
    // Seven rows, not one. The endpoint replaces the whole schedule, so a
    // partial payload would silently delete every day it omitted.
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('refuses to save a day that opens and closes at the same time', async () => {
    const setOpeningHours = vi.fn().mockResolvedValue([]);
    await mountHours({ setOpeningHours });

    fireEvent.click(screen.getByLabelText('Tuesday open'));
    fireEvent.change(screen.getByLabelText('Tuesday opens'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Tuesday closes'), { target: { value: '12:00' } });

    // The backend accepts this and then reports the branch closed all day —
    // invisible here, loud in a customer's app.
    expect(screen.getByRole('alert').textContent).toMatch(/Tuesday/);
    fireEvent.click(screen.getByRole('button', { name: /save hours/i }));
    expect(setOpeningHours).not.toHaveBeenCalled();
  });

  it('says so when a save is refused, rather than looking like it worked', async () => {
    const setOpeningHours = vi
      .fn()
      .mockRejectedValue(
        new ApiError({ statusCode: 400, code: 'VALIDATION_FAILED', message: 'Server said no' }),
      );
    await mountHours({ setOpeningHours });

    fireEvent.click(screen.getByRole('button', { name: /save hours/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Server said no');
    });
  });

  it('shows a branch with hours as open now, with when it closes', async () => {
    await mountHours({
      getOpeningHours: {
        hours: [{ dayOfWeek: 0, openMinute: 540, closeMinute: 1380, isClosed: false }],
        overrides: [],
      },
      branchOpenState: {
        configured: true,
        isOpen: true,
        closedReason: null,
        note: null,
        opensAtMinute: null,
        closesAtMinute: 1380,
      },
    });

    expect(screen.getByText(/open until 23:00/i)).toBeTruthy();
  });

  it('does not call a branch with no schedule "open" — that is a different thing', async () => {
    await mountHours({
      branchOpenState: {
        configured: false,
        isOpen: true,
        closedReason: null,
        note: null,
        opensAtMinute: null,
        closesAtMinute: null,
      },
    });

    expect(screen.getByText(/no hours set/i)).toBeTruthy();
  });

  it('lists a holiday override and the note customers will see', async () => {
    await mountHours({
      getOpeningHours: {
        hours: [],
        overrides: [
          {
            id: 'o1',
            branchId: 'b1',
            date: '2026-09-20',
            openMinute: null,
            closeMinute: null,
            isClosed: true,
            note: 'Eid holiday',
          },
        ],
      },
    });

    expect(screen.getByText('2026-09-20')).toBeTruthy();
    // The note is what turns "closed" into an answer. (Scoped to the row: the
    // placeholder on the "add a date" form carries the same words.)
    const row = screen.getByText('2026-09-20').parentElement as HTMLElement;
    expect(within(row).getByText(/Eid holiday/)).toBeTruthy();
  });
});
