import React from 'react';

import type { PrintDocument } from './document';
import { usePrint } from './PrintProvider';

/**
 * Prints a document. Disabled until the data it needs has loaded, because a
 * Print button that produces an empty page is worse than one that waits.
 */
export function PrintButton({
  document: doc,
  label = 'Print',
}: {
  document: PrintDocument | null;
  label?: string;
}): React.JSX.Element {
  const { print } = usePrint();

  return (
    <button
      className="btn btn-ghost"
      disabled={!doc}
      title={doc ? undefined : 'Nothing to print yet'}
      onClick={() => doc && print(doc)}
    >
      {label}
    </button>
  );
}
