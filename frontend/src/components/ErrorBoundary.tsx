import React from 'react';

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage?: string;
};

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled application error', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

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
