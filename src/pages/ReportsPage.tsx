import React, { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { DatePresets, DateRange, defaultRange } from '../components/DateRange';
import { DataState } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { PrintButton } from '../print/PrintButton';
import {
  PrintDocument,
  paymentsReportDocument,
  salesReportDocument,
  vatReportDocument,
} from '../print/document';
import { usePrintContext } from '../print/usePrintContext';
import { formatSar } from '../util/money';

type Tab = 'sales' | 'vat' | 'payments';

/** Sales / VAT / payments reports over a chosen window and branch scope. */
export function ReportsPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('sales');
  const [{ from, to }, setRange] = useState(defaultRange);
  const [branchId, setBranchId] = useState('');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'end', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Reports</h2>
        <BranchSelect value={branchId} onChange={setBranchId} allowAll width={220} />
        <DateRange from={from} to={to} onChange={(f, t) => setRange({ from: f, to: t })} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <DatePresets onPick={setRange} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <TabBtn active={tab === 'sales'} onClick={() => setTab('sales')}>Sales</TabBtn>
        <TabBtn active={tab === 'vat'} onClick={() => setTab('vat')}>VAT</TabBtn>
        <TabBtn active={tab === 'payments'} onClick={() => setTab('payments')}>Payments</TabBtn>
      </div>

      {tab === 'sales' ? <SalesReport from={from} to={to} branchId={branchId} /> : null}
      {tab === 'vat' ? <VatReport from={from} to={to} branchId={branchId} /> : null}
      {tab === 'payments' ? <PaymentsReport from={from} to={to} branchId={branchId} /> : null}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <button className={active ? 'btn' : 'btn btn-ghost'} onClick={onClick} style={{ padding: '6px 14px', fontSize: 14 }}>
      {children}
    </button>
  );
}

function SalesReport({ from, to, branchId }: { from: string; to: string; branchId: string }): React.JSX.Element {
  const { api } = useAuth();
  const r = useAsync(() => api.salesReport({ from, to, branchId: branchId || undefined }), [from, to, branchId]);
  const data = r.data;
  const printContext = usePrintContext(branchId);
  return (
    <DataState loading={r.loading && !data} error={r.error?.message ?? null} onRetry={r.reload}>
      {data ? (
        <div>
          <ReportActions document={salesReportDocument(data, printContext)} />
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Realised sales</h3>
            <Grid>
              <Kv k="Orders" v={String(data.realised.orders)} />
              <Kv k="Subtotal" v={formatSar(data.realised.subtotalMinor)} />
              <Kv k="Discounts" v={formatSar(data.realised.discountMinor)} />
              <Kv k="Delivery fees" v={formatSar(data.realised.deliveryFeeMinor)} />
              <Kv k="Charges" v={formatSar(data.realised.chargesMinor)} />
              <Kv k="Taxable base" v={formatSar(data.realised.taxableBaseMinor)} />
              <Kv k="VAT" v={formatSar(data.realised.vatMinor)} />
              <Kv k="Total" v={formatSar(data.realised.totalMinor)} strong />
            </Grid>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Orders by status</h3>
            <SimpleTable
              headers={['Status', 'Orders', 'Total']}
              rows={data.statusBreakdown.map((r) => [r.status, String(r.orders), formatSar(r.totalMinor)])}
            />
          </div>
        </div>
      ) : null}
    </DataState>
  );
}

function VatReport({ from, to, branchId }: { from: string; to: string; branchId: string }): React.JSX.Element {
  const { api } = useAuth();
  const r = useAsync(() => api.vatReport({ from, to, branchId: branchId || undefined }), [from, to, branchId]);
  const data = r.data;
  const printContext = usePrintContext(branchId);
  return (
    <DataState loading={r.loading && !data} error={r.error?.message ?? null} onRetry={r.reload}>
      {data ? (
        <div>
          <ReportActions document={vatReportDocument(data, printContext)} />
          <div className="card">
          <h3 style={{ marginTop: 0 }}>VAT by rate ({data.basis})</h3>
          <p className="muted" style={{ marginTop: -4 }}>{data.note}</p>
          <SimpleTable
            headers={['Rate', 'Orders', 'Taxable base', 'VAT', 'Total']}
            rows={(data.byRate ?? []).map((r) => [
              r.vatRate,
              String(r.orders),
              formatSar(r.taxableBaseMinor),
              formatSar(r.vatMinor),
              formatSar(r.totalMinor),
            ])}
          />
          </div>
        </div>
      ) : null}
    </DataState>
  );
}

function PaymentsReport({ from, to, branchId }: { from: string; to: string; branchId: string }): React.JSX.Element {
  const { api } = useAuth();
  const r = useAsync(() => api.paymentsReport({ from, to, branchId: branchId || undefined }), [from, to, branchId]);
  const data = r.data;
  const printContext = usePrintContext(branchId);
  return (
    <DataState loading={r.loading && !data} error={r.error?.message ?? null} onRetry={r.reload}>
      {data ? (
        <div>
          <ReportActions document={paymentsReportDocument(data, printContext)} />
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Totals</h3>
            <Grid>
              <Kv k="Payments" v={String(data.totals.payments)} />
              <Kv k="Captured" v={formatSar(data.totals.capturedMinor)} />
              <Kv k="Refunded" v={formatSar(data.totals.refundedMinor)} />
              <Kv k="Gateway fees" v={formatSar(data.totals.gatewayFeesMinor)} />
              <Kv k="Net captured" v={formatSar(data.totals.netCapturedMinor)} strong />
            </Grid>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>By status</h3>
            <SimpleTable
              headers={['Status', 'Payments', 'Captured', 'Refunded']}
              rows={data.byStatus.map((r) => [
                r.status,
                String(r.payments),
                formatSar(r.capturedMinor),
                formatSar(r.refundedMinor),
              ])}
            />
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>By method</h3>
            <SimpleTable
              headers={['Method', 'Payments', 'Captured', 'Refunded']}
              rows={data.byMethod.map((r) => [
                r.method ?? '—',
                String(r.payments),
                formatSar(r.capturedMinor),
                formatSar(r.refundedMinor),
              ])}
            />
          </div>
        </div>
      ) : null}
    </DataState>
  );
}

/**
 * The print row above a report. Its own component so all three tabs offer the
 * action in the same place — a Print button that moves between tabs is one
 * people stop looking for.
 */
function ReportActions({ document: doc }: { document: PrintDocument }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
      <PrintButton document={doc} label="Print report" />
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
function Kv({ k, v, strong }: { k: string; v: string; strong?: boolean }): React.JSX.Element {
  return (
    <div>
      <p className="muted" style={{ margin: 0, fontSize: 11, textTransform: 'uppercase' }}>{k}</p>
      <p style={{ margin: 0, fontSize: strong ? 20 : 16, fontWeight: strong ? 700 : 500 }}>{v}</p>
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }): React.JSX.Element {
  if (rows.length === 0) return <p className="muted" style={{ margin: 0 }}>No data.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
          {headers.map((h) => (
            <th key={h} style={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={td}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const th: React.CSSProperties = { padding: '8px 6px', borderBottom: '1px solid var(--border)', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 6px', borderBottom: '1px solid var(--border)' };
