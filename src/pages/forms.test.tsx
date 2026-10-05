import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/http';

// `PromotionForm` renders `ImageField`, which uploads through the API and so
// reads the auth context. Nothing here exercises the upload; the form's body is
// what these tests are about.
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ api: { uploadAsset: vi.fn() } }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
import type { Branch, Payment, RefundRequest } from '../api/types';
import { CreateForm } from './UsersPage';
import { RefundForm } from './PaymentsPage';
import { DecisionForm, RecordPayoutForm } from './RefundsPage';
import { PromotionForm } from './PromotionsPage';

/**
 * The two writes in this app with consequences that cannot be undone from the
 * UI: issuing a refund, and creating a staff account.
 *
 * Mounting a page proves it does not blank. It does not prove the Save button
 * sends the right body — and a form that sends the wrong body fails silently,
 * because the backend rejects the request and the user sees a generic error
 * about something they cannot see. These assert the payload.
 */

/** The body a mocked submit handler received on its nth call. */
function body(fn: ReturnType<typeof vi.fn>, n = 0): Record<string, unknown> {
  const call = fn.mock.calls[n];
  if (!call) {
    throw new Error(`No call ${n} was made.`);
  }
  return call[0] as Record<string, unknown>;
}

const PAYMENT: Payment = {
  id: 'pay1',
  orderId: 'o1',
  status: 'PAID',
  method: 'CARD',
  gatewayName: 'mock',
  amountMinor: 11_500,
  capturedAmountMinor: 11_500,
  refundedAmountMinor: 1_500,
  createdAt: '2026-09-04T00:00:00.000Z',
  order: { id: 'o1', orderNumber: '1000000', referenceId: '123456789012' },
} as unknown as Payment;

/** Captured 115.00, already refunded 15.00 — so 100.00 remains. */
const REMAINING_MINOR = 10_000;

describe('RefundForm', () => {
  it('sends no amount for a full refund, so the server decides what is left', async () => {
    // The client must not compute the refundable amount and send it as fact:
    // another refund may have landed since this page loaded. Omitting
    // `amountMinor` asks the backend to refund the remainder as it sees it.
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<RefundForm payment={PAYMENT} onSubmit={onSubmit} onDone={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'duplicate charge' } });
    fireEvent.click(screen.getByRole('button', { name: /issue refund/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(body(onSubmit, 0)).toMatchObject({
      paymentId: 'pay1',
      amountMinor: undefined,
      reason: 'duplicate charge',
    });
  });

  it('refuses a partial refund larger than what is left, without calling the API', async () => {
    // The backend refuses this too, and is the authority. Catching it here is
    // what turns "REFUND_EXCEEDS_REFUNDABLE" into a sentence naming the actual
    // figure, in front of someone deciding how much to give back.
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<RefundForm payment={PAYMENT} onSubmit={onSubmit} onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /partial/i }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '250.00' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'too much' } });
    fireEvent.click(screen.getByRole('button', { name: /issue refund/i }));

    await waitFor(() => expect(screen.getByText(/must be between/i)).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends a valid partial refund in minor units', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<RefundForm payment={PAYMENT} onSubmit={onSubmit} onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /partial/i }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '25.50' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'missing item' } });
    fireEvent.click(screen.getByRole('button', { name: /issue refund/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Halalas, never floating point — 25.50 SAR is 2550, not 25.5.
    expect(body(onSubmit, 0).amountMinor).toBe(2_550);
    expect(body(onSubmit, 0).amountMinor).toBeLessThanOrEqual(REMAINING_MINOR);
  });

  it('reuses one idempotency key when a failed refund is retried', async () => {
    // This is the one that matters most. A refund request that fails at the
    // client has still very possibly been accepted by the gateway — a timeout
    // proves nothing about what the server did. Retrying under a *new* key
    // issues a second real refund and the money leaves twice. The key used to
    // carry `Date.now()`, so every press generated a new one.
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ statusCode: 0, code: 'NETWORK', message: 'timeout' }))
      .mockResolvedValueOnce({});
    render(<RefundForm payment={PAYMENT} onSubmit={onSubmit} onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'retry me' } });
    fireEvent.click(screen.getByRole('button', { name: /issue refund/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /issue refund/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    const first = body(onSubmit, 0).idempotencyKey;
    const second = body(onSubmit, 1).idempotencyKey;
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('will not submit without a reason, which is audited', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<RefundForm payment={PAYMENT} onSubmit={onSubmit} onDone={vi.fn()} />);

    expect(screen.getByRole('button', { name: /issue refund/i })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

const BRANCHES: Branch[] = [
  { id: 'b1', code: 'OLA', name: 'Olaya', status: 'OPEN' } as unknown as Branch,
];

describe('CreateForm (staff user)', () => {
  it('omits the role and branch entirely when no role was chosen', async () => {
    // `forbidNonWhitelisted` is on server-side and the DTO treats these as
    // optional — sending `role: ''` is a validation failure, which surfaces as
    // a Save button that silently never works.
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CreateForm branches={BRANCHES} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: '  Sara  ' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: ' sara@example.test ' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'a-long-enough-password' } });
    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(body(onSave, 0)).toEqual({
      // Trimmed: a trailing space in an email is a sign-in nobody can debug.
      fullName: 'Sara',
      email: 'sara@example.test',
      password: 'a-long-enough-password',
      role: undefined,
      branchId: undefined,
    });
  });

  it('sends a branch for a branch-scoped role and none for an owner', async () => {
    // The backend requires a branch for every role except OWNER, and refuses
    // one for OWNER. Getting this backwards is a 400 on the last click.
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<CreateForm branches={BRANCHES} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Cook' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'cook@example.test' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'a-long-enough-password' } });
    fireEvent.change(screen.getByLabelText(/^role/i), { target: { value: 'KITCHEN' } });
    fireEvent.change(screen.getByLabelText(/branch/i), { target: { value: 'b1' } });
    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(body(onSave, 0)).toMatchObject({ role: 'KITCHEN', branchId: 'b1' });

    rerender(<CreateForm branches={BRANCHES} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/^role/i), { target: { value: 'OWNER' } });
    // An owner is org-wide, so no branch picker is offered at all.
    expect(screen.queryByLabelText(/branch/i)).toBeNull();
  });

  it('shows the server message when creation is refused', async () => {
    // "Email already in use" is actionable; "Failed to create" is not.
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new ApiError({ statusCode: 409, code: 'CONFLICT', message: 'That email is already in use.' }),
      );
    render(<CreateForm branches={BRANCHES} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'dup@example.test' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'a-long-enough-password' } });
    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);

    await waitFor(() => expect(screen.getByText(/already in use/i)).toBeTruthy());
  });
});

describe('PromotionForm', () => {
  /**
   * A promotion is money off every qualifying order, with no code and no
   * per-customer limit, so a wrong body here is not a failed save — it is a
   * discount quietly running at the wrong size, at branches nobody chose,
   * until someone reads a report.
   */
  const BRANCHES = [
    { id: 'b1', code: 'CEN', name: 'Central' },
    { id: 'b2', code: 'NOR', name: 'North' },
  ] as unknown as Parameters<typeof PromotionForm>[0]['branches'];

  const PRODUCTS = [
    { id: 'p1', name: 'Shawarma' },
    { id: 'p2', name: 'Cola' },
  ] as unknown as Parameters<typeof PromotionForm>[0]['products'];

  function mount(onSave: ReturnType<typeof vi.fn>) {
    return render(
      <PromotionForm branches={BRANCHES} products={PRODUCTS} onSave={onSave} />,
    );
  }

  it('sends empty branch and product lists rather than omitting them', async () => {
    // Both empties are load-bearing on the server: no branches means *every*
    // branch, no products means the *whole basket*. Sending them explicitly is
    // what makes the create body say what the screen showed.
    const onSave = vi.fn().mockResolvedValue({});
    mount(onSave);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Weekend 10%' } });
    fireEvent.click(screen.getByRole('button', { name: /create promotion/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(body(onSave, 0)).toMatchObject({
      name: 'Weekend 10%',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      branchIds: [],
      productIds: [],
    });
  });

  it('sends the branches and products that were ticked', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    mount(onSave);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Shawarma Tuesday' } });
    fireEvent.click(screen.getByLabelText('Central (CEN)'));
    fireEvent.click(screen.getByLabelText('Shawarma'));
    fireEvent.click(screen.getByRole('button', { name: /create promotion/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(body(onSave, 0)).toMatchObject({
      branchIds: ['b1'],
      productIds: ['p1'],
    });
  });

  it('sends the discount as a number, not the string in the box', async () => {
    // `discountValue` is held as a string so a half-typed field cannot become
    // a zero; the DTO wants a number. A string here is a 400 the owner reads
    // as "saving failed" with nothing naming the field.
    const onSave = vi.fn().mockResolvedValue({});
    mount(onSave);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Quarter off' } });
    fireEvent.change(screen.getByLabelText('Value (%)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/most it can take off/i), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create promotion/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const sent = body(onSave, 0);
    expect(sent.discountValue).toBe(25);
    // SAR in the box, halalas on the wire — the app's one money rule.
    expect(sent.maxDiscountMinor).toBe(3000);
  });

  it('refuses a window that ends before it starts, without calling the API', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    mount(onSave);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Backwards' } });
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: /create promotion/i }));

    await waitFor(() => expect(screen.getByText(/must be after/i)).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends zero for a free-delivery promotion instead of whatever was typed', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    mount(onSave);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Free delivery week' } });
    fireEvent.change(screen.getByLabelText('Discount type'), {
      target: { value: 'FREE_DELIVERY' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create promotion/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(body(onSave, 0)).toMatchObject({ discountType: 'FREE_DELIVERY', discountValue: 0 });
  });
});

const REQUEST: RefundRequest = {
  id: 'rr1',
  orderId: 'o1',
  customerId: 'c1',
  branchId: 'b1',
  type: 'CANCELLATION',
  status: 'PENDING',
  reason: 'Ordered from the wrong branch',
  resolutionNote: null,
  reviewedByUserId: null,
  reviewedAt: null,
  refundId: null,
  orderCancelled: false,
  approvedAmountMinor: null,
  refundIssuedAt: null,
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  order: {
    orderNumber: '1000000',
    referenceId: '123456789012',
    status: 'PREPARING',
    paymentStatus: 'PAID',
    totalMinor: 11_500,
    currency: 'SAR',
    placedAt: '2026-09-07T00:00:00.000Z',
    deliveredAt: null,
  },
  customer: { id: 'c1', fullName: 'Fatimah', phone: '+966500000000' },
  reviewedByUser: null,
  refund: null,
};

/**
 * Approving a refund request cancels an order *and* pays money out. Neither is
 * visible from a mounted page — the body is the whole behaviour — and both are
 * irreversible from this UI.
 */
describe('DecisionForm', () => {
  it('sends no amount for a full refund, so the server decides what is left', async () => {
    // Same rule as the refund form: the page's idea of the order total is a
    // snapshot, and another refund may have landed since it loaded. Omitting
    // the amount asks the backend to refund the remainder as it sees it.
    const onApprove = vi.fn().mockResolvedValue({ outcome: 'AWAITING_PAYOUT' });
    render(
      <DecisionForm
        request={REQUEST}
        onApprove={onApprove}
        onReject={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    expect(body(onApprove, 0)).toMatchObject({ amountMinor: undefined, cancelOrder: true });
  });

  it('defaults to not cancelling when the customer asked for money back', () => {
    // A delivered order cannot legally be cancelled, and the server refuses it.
    // Defaulting the box on would make every refund on a delivered order a
    // rejected request the branch cannot explain.
    render(
      <DecisionForm
        request={{ ...REQUEST, type: 'REFUND' }}
        onApprove={vi.fn().mockResolvedValue({ outcome: 'AWAITING_PAYOUT' })}
        onReject={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /cancel the order/i })).not.toBeChecked();
  });

  it('refuses a partial amount larger than the order, without calling the API', async () => {
    const onApprove = vi.fn().mockResolvedValue({ outcome: 'AWAITING_PAYOUT' });
    render(
      <DecisionForm request={REQUEST} onApprove={onApprove} onReject={vi.fn()} onDone={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /part of it/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount/i }), {
      target: { value: '999.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('will not decline without telling the customer why', async () => {
    // The customer reads this note. "No" with no reason is what turns one
    // refusal into three phone calls — and the backend requires it anyway, so
    // without this the branch gets a validation error about a field they were
    // never asked to fill in.
    const onReject = vi.fn().mockResolvedValue({});
    render(
      <DecisionForm
        request={REQUEST}
        onApprove={vi.fn()}
        onReject={onReject}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onReject).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: /note to the customer/i }), {
      target: { value: 'The order matched what was ordered.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));

    await waitFor(() => expect(onReject).toHaveBeenCalled());
    expect(body(onReject, 0)).toMatchObject({ note: 'The order matched what was ordered.' });
  });

  it('reports a cash approval as money still to hand back, not as a refund', async () => {
    // MANUAL_SETTLEMENT means nothing moved online and somebody at the branch
    // owes the customer cash. Calling that "refunded" would close a job nobody
    // has done.
    const onDone = vi.fn();
    render(
      <DecisionForm
        request={REQUEST}
        onApprove={vi.fn().mockResolvedValue({ outcome: 'MANUAL_SETTLEMENT' })}
        onReject={vi.fn()}
        onDone={onDone}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(String(body(onDone, 0))).toMatch(/in person/i);
  });

  it('never tells the branch an approval sent any money', async () => {
    // The whole shape of this flow: the branch agrees, the owner pays out in
    // Tap. An approval that reads as "refunded" is how a customer gets told
    // their money is on its way before anyone has sent it.
    const onDone = vi.fn();
    render(
      <DecisionForm
        request={REQUEST}
        onApprove={vi.fn().mockResolvedValue({ outcome: 'AWAITING_PAYOUT' })}
        onReject={vi.fn()}
        onDone={onDone}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const message = String(body(onDone, 0));
    expect(message).toMatch(/waiting to be paid out/i);
    expect(message).not.toMatch(/\brefunded\b/i);
  });
});

/**
 * The owner recording a refund already sent in the Tap dashboard. This is the
 * write that marks an order refunded and tells the customer their money has
 * gone — so what it sends, and what it refuses to send, is the whole behaviour.
 */
describe('RecordPayoutForm', () => {
  const APPROVED: RefundRequest = {
    ...REQUEST,
    status: 'APPROVED',
    approvedAmountMinor: 11_500,
    reviewedAt: '2026-09-07T01:00:00.000Z',
  };

  it('will not record a refund with no gateway reference', async () => {
    // A refund recorded with nothing to match it against cannot be tied to a
    // payout line at reconciliation, and whoever could have pasted it is long
    // gone by the time anyone notices.
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<RecordPayoutForm request={APPROVED} onSubmit={onSubmit} onDone={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /record refund/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends no amount when the owner paid what the branch approved', async () => {
    // The figure is already agreed and stored. Re-sending a retyped copy of it
    // is how the branch's promise and the customer's refund drift apart.
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<RecordPayoutForm request={APPROVED} onSubmit={onSubmit} onDone={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: /tap reference/i }), {
      target: { value: 're_TS0123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /record refund/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(body(onSubmit, 0)).toMatchObject({
      gatewayReference: 're_TS0123',
      amountMinor: undefined,
    });
  });

  it('sends the real amount when the owner refunded something different', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<RecordPayoutForm request={APPROVED} onSubmit={onSubmit} onDone={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: /tap reference/i }), {
      target: { value: 're_TS9' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /different amount/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount actually refunded/i }), {
      target: { value: '50.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /record refund/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(body(onSubmit, 0)).toMatchObject({ gatewayReference: 're_TS9', amountMinor: 5_000 });
  });
});
