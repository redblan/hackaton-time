import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./core/App";
import "./core/styles.css";
import { unlockAudio } from "./core/sound";

unlockAudio();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
