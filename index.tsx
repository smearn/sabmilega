
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n"; // Import i18n config

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
