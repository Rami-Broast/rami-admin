import React, { useEffect } from 'react';

import { Branch } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../hooks/useAsync';

/**
 * Branch dropdown backed by GET /branches, with an optional "All branches"
 * entry for owner-wide pages. Autoselects the first branch when a specific
 * branch is required.
 */
export function BranchSelect({
  value,
  onChange,
  allowAll = false,
  width = 260,
}: {
  value: string;
  onChange: (branchId: string) => void;
  allowAll?: boolean;
  width?: number;
}): React.JSX.Element {
  const { api } = useAuth();
  const branches = useAsync(() => api.branches(), []);
  const list: Branch[] = branches.data ?? [];

  useEffect(() => {
    if (!allowAll && !value && list.length > 0) {
      onChange(list[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, allowAll]);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width }}>
      {allowAll ? <option value="">All branches</option> : null}
      {list.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
