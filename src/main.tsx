import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
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
      <Toaster theme="dark" position="top-right" closeButton duration={4500} richColors />
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
