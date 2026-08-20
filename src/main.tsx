import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./styles.css";
import "./experience.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
      <Refine
        routerProvider={routerProvider}
        resources={[
          { name: "overview", list: "/" },
          { name: "leads", list: "/leads" },
          { name: "insights", list: "/insights" },
          { name: "proposals", list: "/proposals" },
          { name: "email-templates", list: "/email-templates" },
        ]}
      >
        <App />
      </Refine>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
