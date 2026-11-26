import { Component, type ErrorInfo, type ReactNode } from "react";
import { getStoredLang } from "../i18n";

type State = { hasError: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Handled gracefully in render fallback without exposing internals. */
  }

  render() {
    if (this.state.hasError) {
      const en = getStoredLang() === "en";
      return (
        <main className="subpage" role="alert">
          <h1>{en ? "An unexpected error occurred." : "Beklenmeyen bir hata oluştu."}</h1>
          <p>
            {en
              ? "Reloading the page will restore the latest tournament data."
              : "Sayfa yenilendiğinde güncel turnuva verileri yeniden yüklenecek."}
          </p>
          <button
            type="button"
            className="button-primary"
            onClick={() => location.reload()}
          >
            {en ? "Reload page" : "Sayfayı yenile"}
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
