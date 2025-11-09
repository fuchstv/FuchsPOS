import React from 'react';

/**
 * State for the ErrorBoundary component.
 * @property {boolean} hasError - Indicates if an error has been caught.
 * @property {string} [errorMessage] - The message of the caught error.
 */
type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage?: string;
};

/**
 * A React Error Boundary component.
 *
 * This component catches JavaScript errors anywhere in its child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 *
 * @example
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  /**
   * @param {React.PropsWithChildren} props - The component's props.
   */
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  /**
   * A static lifecycle method that is invoked after an error has been thrown by a descendant component.
   * It receives the error that was thrown as a parameter and should return a value to update state.
   * @param {Error} error - The error that was thrown.
   * @returns {ErrorBoundaryState} An object to update the state.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  /**
   * A lifecycle method that is invoked after an error has been thrown by a descendant component.
   * It is used for side effects like logging the error.
   * @param {Error} error - The error that was thrown.
   * @param {React.ErrorInfo} info - An object with a `componentStack` key containing information about which component threw the error.
   */
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled application error', error, info);
  }

  /**
   * Handles the click event for the reload button, forcing a page reload.
   */
  private handleReload = () => {
    window.location.reload();
  };

  /**
   * Renders the component.
   *
   * If an error has been caught, it renders a fallback UI.
   * Otherwise, it renders the child components.
   * @returns {React.ReactNode} The rendered component.
   */
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
          <h1 className="mb-2 text-2xl font-semibold text-white">Etwas ist schief gelaufen</h1>
          <p className="mb-6 max-w-md text-slate-300">
            Bei der Initialisierung der Anwendung ist ein Fehler aufgetreten. Bitte aktualisieren Sie die Seite oder wenden
            Sie sich an den Support, falls das Problem weiterhin besteht.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md bg-indigo-500 px-4 py-2 font-medium text-white shadow transition hover:bg-indigo-400"
          >
            Seite neu laden
          </button>
          {this.state.errorMessage && (
            <p className="mt-4 text-xs text-slate-500">Fehlerdetails: {this.state.errorMessage}</p>
          )}
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}
