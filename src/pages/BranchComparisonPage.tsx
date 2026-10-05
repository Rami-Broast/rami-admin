import React, { useEffect, useState } from 'react';

import { Branch, SalesReport } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { DatePresets, DateRange, defaultRange } from '../components/DateRange';
import { DataState } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatSar } from '../util/money';

type Row = { branch: Branch; report: SalesReport | null; error?: string };

/**
 * Branch-by-branch comparison over a window (spec §34). Runs the sales report
 * per branch and lays out the results side by side. Backend has no dedicated
 * comparison endpoint — a small N of branches makes the extra requests cheap.
 */
export function BranchComparisonPage(): React.JSX.Element {
  const { api } = useAuth();
  const [{ from, to }, setRange] = useState(defaultRange);
  const branchList = useAsync(() => api.branches(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const branches = branchList.data;
    if (!branches || branches.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const results = await Promise.all(
        branches.map(async (b): Promise<Row> => {
          try {
            const report = await api.salesReport({ from, to, branchId: b.id });
            return { branch: b, report };
          } catch (err) {
            return {
              branch: b,
              report: null,
              error: err instanceof Error ? err.message : 'Failed',
            };
          }
        }),
      );
      if (!cancelled) {
        setRows(results);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, branchList.data, from, to]);

  const cancelledOf = (r: SalesReport | null): number => {
    if (!r) return 0;
    return r.statusBreakdown
      .filter((s) => s.status === 'CANCELLED' || s.status === 'PAYMENT_FAILED')
      .reduce((sum, s) => sum + s.orders, 0);
  };
  const aov = (r: SalesReport | null): number => {
    if (!r || r.realised.orders === 0) return 0;
    return Math.round(r.realised.totalMinor / r.realised.orders);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'end', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Branch comparison</h2>
        <DateRange from={from} to={to} onChange={(f, t) => setRange({ from: f, to: t })} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <DatePresets onPick={setRange} />
      </div>

      <DataState
        loading={(branchList.loading || loading) && rows.length === 0}
        error={branchList.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={branchList.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Branch</th>
                <th style={th}>Orders</th>
                <th style={th}>Revenue</th>
                <th style={th}>Avg order value</th>
                <th style={th}>VAT</th>
                <th style={th}>Discounts</th>
                <th style={th}>Cancelled / failed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ branch, report, error }) => (
                <tr key={branch.id}>
                  <td style={td}>
                    <strong>{branch.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{branch.city}</div>
                  </td>
                  {error ? (
                    <td style={td} colSpan={6}>
                      <span style={{ color: 'var(--danger)' }}>{error}</span>
                    </td>
                  ) : (
                    <>
                      <td style={td}>{report?.realised.orders ?? '—'}</td>
                      <td style={td}>{report ? formatSar(report.realised.totalMinor) : '—'}</td>
                      <td style={td}>{report ? formatSar(aov(report)) : '—'}</td>
                      <td style={td}>{report ? formatSar(report.realised.vatMinor) : '—'}</td>
                      <td style={td}>{report ? formatSar(report.realised.discountMinor) : '—'}</td>
                      <td style={td}>{cancelledOf(report)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          Prep time and delivery time comparisons need a backend aggregate — not built yet.
        </p>
      </DataState>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
