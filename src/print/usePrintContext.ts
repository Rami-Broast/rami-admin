import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../hooks/useAsync';
import type { DocumentContext } from './document';

/**
 * The header facts every printed document carries: which branch it covers and
 * who ran it.
 *
 * Attribution matters more than it looks. A printed report with no branch and
 * no name is a page of numbers nobody can place a week later — and a
 * branch-scoped report that does not say which branch reads as an
 * organisation-wide one.
 */
export function usePrintContext(branchId: string): DocumentContext {
  const { api, actor } = useAuth();
  const branches = useAsync(() => api.branches(), []);

  const branchLabel = branchId
    ? branches.data?.find((b) => b.id === branchId)?.name ?? 'Selected branch'
    : 'All branches';

  return {
    branchLabel,
    printedBy: actor?.fullName ?? actor?.email ?? undefined,
  };
}
