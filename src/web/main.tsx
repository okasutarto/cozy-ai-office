import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function BootstrapScreen() {
  return <main>Cozy Agent Office</main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <BootstrapScreen />
  </StrictMode>,
);
