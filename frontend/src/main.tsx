import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./pwa";
import { clearLegacyDemoStorage } from "./lib/clearLegacyDemoStorage";

clearLegacyDemoStorage();

createRoot(document.getElementById("root")!).render(<App />);
