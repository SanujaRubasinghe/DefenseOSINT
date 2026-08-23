import { useEffect, useState } from "react";
import { getHealth } from "./api/client";

export default function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    getHealth()
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("gateway unreachable"));
  }, []);

  return (
    <main className="app">
      <h1>DefenseOSINT</h1>
      <p className="muted">Multi-agent open-source intelligence platform</p>
      <p>Gateway: <strong>{status}</strong></p>
      {/* TODO: investigation form, agent trace, evidence list,
          entity graph, critic warnings, final brief */}
    </main>
  );
}
