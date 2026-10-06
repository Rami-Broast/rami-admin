import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Shown above the message, so a boundary around one page can name it. */
  title?: string;
  /**
   * Called when the user asks to try again. A boundary wrapping one route can
   * use this to send them somewhere safe; without it, "Try again" just clears
   * the error and re-renders the same subtree.
   */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time exception and shows something recoverable.
 *
 * React unmounts the **entire tree** when a render throws and nothing catches
 * it: the page goes blank, with no message and no way back except a manual
 * refresh. That is the white screen. One undefined field from an API response —
 * `order.customer.phone` where the customer is null, a `.toUpperCase()` on a
 * missing status — is enough to cause it.
 *
 * So this is a floor, not a substitute for handling those cases: it keeps the
 * failure to the part of the app that broke, tells the user what happened, and
 * offers a way out. Boundaries are placed both around the whole app (so nothing
 * can blank the page) and inside the layout around the routed page (so one
 * broken screen leaves the navigation usable).
 *
 * It must be a class: `componentDidCatch` / `getDerivedStateFromError` have no
 * hook equivalent.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Kept in the console rather than sent anywhere: no error reporting service
    // is configured, and inventing one is not this component's decision. The
    // component stack is what makes the trace usable.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="card" style={{ margin: 16, borderColor: 'var(--danger)' }} role="alert">
        <h3 style={{ marginTop: 0 }}>{this.props.title ?? 'Something went wrong'}</h3>
        <p className="muted">
          This part of the app failed to display. Nothing you have saved is affected — the failure
          is in showing the page, not in your data.
        </p>
        <p className="muted" style={{ fontSize: 12, wordBreak: 'break-word' }}>
          {error.message}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={this.reset}>
            Try again
          </button>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
