import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// No <StrictMode>: its double-run effects would push/pop the history entries
// that let the phone's Back gesture close sheets.
createRoot(document.getElementById("root")!).render(<App />);
