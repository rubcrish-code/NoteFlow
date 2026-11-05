import { translate, useInterfaceLanguage } from "./i18n";
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
  useInterfaceLanguage();
  return (
    <LazyFeatureErrorBoundary fallback={errorFallback}>
      <Suspense fallback={loadingFallback}>{children}</Suspense>
    </LazyFeatureErrorBoundary>
  );
}

export function FeatureLoadState({ kind, label }: FeatureLoadStateProps) {
  useInterfaceLanguage();
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
          <b>{failed ? translate("ui.b2d96d3467be", { p0: label }) : translate("ui.a934846414f1", { p0: label })}</b>
          <span>{failed ? translate("ui.62c815f87e65") : translate("ui.b18e53195053")}</span>
        </div>
      ) : null}
    </section>
  );
}
