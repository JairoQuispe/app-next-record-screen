import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauriRuntime } from "@shared/lib/runtime";

if (isTauriRuntime()) {
  document.documentElement.dataset.tauri = "true";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
