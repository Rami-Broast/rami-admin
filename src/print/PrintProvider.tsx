import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PrintDocument } from './document';
import { PrintDocumentView } from './PrintDocumentView';

interface PrintContextValue {
  /** Renders the document and opens the browser's print dialog. */
  print: (doc: PrintDocument) => void;
  /** The document currently staged for printing, if any. */
  pending: PrintDocument | null;
}

const PrintContext = createContext<PrintContextValue | null>(null);

/**
 * Printing for the admin panel.
 *
 * Prints through the browser rather than through a device driver, because these
 * are A4 documents going to an office printer — the thermal path belongs to the
 * POS, which owns the hardware.
 *
 * The document is rendered into a portal on the same page rather than into a
 * popup window: popups are blocked by default in most browsers, and a print
 * button that silently does nothing is worse than no print button. `print.css`
 * hides the app and shows only this node when printing.
 *
 * The staged document is cleared after printing so a later `Ctrl+P` prints the
 * page the user is actually looking at, not the last report they exported.
 */
export function PrintProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [pending, setPending] = useState<PrintDocument | null>(null);

  const print = useCallback((doc: PrintDocument) => {
    setPending(doc);
  }, []);

  // Print only once the document has actually been painted; calling
  // window.print() in the same tick prints the page without it.
  useEffect(() => {
    if (!pending) {
      return undefined;
    }

    const previousTitle = document.title;
    // The browser's print dialog and any "Save as PDF" default to the document
    // title, so this is what names the saved file.
    document.title = pending.title;

    const frame = requestAnimationFrame(() => {
      window.print();
    });

    const done = (): void => {
      document.title = previousTitle;
      setPending(null);
    };

    window.addEventListener('afterprint', done);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      document.title = previousTitle;
    };
  }, [pending]);

  const value = useMemo(() => ({ print, pending }), [print, pending]);

  return (
    <PrintContext.Provider value={value}>
      {children}
      {pending && typeof document !== 'undefined'
        ? createPortal(
            <div className="print-root">
              <PrintDocumentView doc={pending} />
            </div>,
            document.body,
          )
        : null}
    </PrintContext.Provider>
  );
}

/**
 * Access to printing.
 *
 * Returns a no-op outside a provider rather than throwing: a missing provider
 * should disable a Print button, never blank the page it sits on.
 */
export function usePrint(): PrintContextValue {
  return useContext(PrintContext) ?? { print: () => undefined, pending: null };
}
