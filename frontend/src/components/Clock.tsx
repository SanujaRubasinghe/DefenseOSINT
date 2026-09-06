import { useEffect, useState } from "react";

function formatUtc(d: Date): string {
  return d.toISOString().slice(11, 19) + "Z";
}

export default function Clock() {
  const [now, setNow] = useState(() => formatUtc(new Date()));

  useEffect(() => {
    const id = setInterval(() => setNow(formatUtc(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="clock">{now}</span>;
}
