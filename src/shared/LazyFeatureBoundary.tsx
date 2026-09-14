import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

interface LazyFeatureBoundaryProps {
  children: ReactNode;
  errorFallback: ReactNode;
  loadingFallback: ReactNode;
}

interface LazyFeatureErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface LazyFeatureErrorBoundaryState {
  failed: boolean;
}

export interface FeatureLoadStateProps {
  kind: "error" | "loading";
  label: string;
}

class LazyFeatureErrorBoundary extends Component<LazyFeatureErrorBoundaryProps, LazyFeatureErrorBoundaryState> {
  state: LazyFeatureErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazyFeatureErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Chunk errors are intentionally not logged because URLs may contain local paths.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function LazyFeatureBoundary({ children, errorFallback, loadingFallback }: LazyFeatureBoundaryProps) {
  return (
    <LazyFeatureErrorBoundary fallback={errorFallback}>
      <Suspense fallback={loadingFallback}>{children}</Suspense>
    </LazyFeatureErrorBoundary>
  );
}

export function FeatureLoadState({ kind, label }: FeatureLoadStateProps) {
  const failed = kind === "error";
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoading(true), 150);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section aria-live={failed ? "assertive" : "polite"} className={`feature-load-state ${failed ? "is-error" : ""}`} role={failed ? "alert" : "status"}>
      {!failed && showLoading ? <span aria-hidden="true" className="button-spinner" /> : null}
      {failed || showLoading ? (
        <div>
          <b>{failed ? `Не удалось открыть ${label}` : `Открываем ${label}…`}</b>
          <span>{failed ? "Перезапустите NoteFlow и попробуйте ещё раз." : "Рабочая область останется на месте."}</span>
        </div>
      ) : null}
    </section>
  );
}
