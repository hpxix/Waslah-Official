import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Refine
        routerProvider={routerProvider}
        resources={[
          { name: "overview", list: "/" },
          { name: "lead-chat", list: "/lead-chat" },
          { name: "leads", list: "/leads" },
          { name: "insights", list: "/insights" },
          { name: "proposals", list: "/proposals" },
          { name: "email-templates", list: "/email-templates" },
        ]}
      >
        <App />
      </Refine>
    </BrowserRouter>
  </React.StrictMode>,
);
