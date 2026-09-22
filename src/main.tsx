import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { Toast } from "@heroui/react";
import { BrowserRouter } from "react-router";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/instrument-sans";
import App from "./App";
import { LanguageProvider } from "./i18n";
import "./styles.css";
import "./experience.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
      <Toast.Provider className="wasla-toast-region" placement="top end" width={460} maxVisibleToasts={4} />
      <Refine
        routerProvider={routerProvider}
        resources={[
          { name: "overview", list: "/" },
          { name: "leads", list: "/leads" },
          { name: "insights", list: "/insights" },
          { name: "proposals", list: "/proposals" },
        ]}
      >
        <App />
      </Refine>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
