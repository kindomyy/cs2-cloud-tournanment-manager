import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ArenaProvider } from "./arena/ArenaContext";
import "./styles.css";
import "./test.css";
import "./scoreboard.css";
import "./management.css";
import "./duel.css";
import "./operations.css";
import "./roles.css";
import "./layout.css";
import { TournamentProvider } from "./tournament/TournamentContext";
import { StartupGate } from "./components/StartupScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LanguageProvider } from "./i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <ArenaProvider>
          <TournamentProvider>
            <StartupGate><App /></StartupGate>
          </TournamentProvider>
        </ArenaProvider>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
);
