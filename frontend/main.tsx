import { createRoot } from "react-dom/client";
import { SettingsApp } from "./settings-app";
import "./styles.css";

createRoot(document.getElementById("settings-root")!).render(<SettingsApp />);
