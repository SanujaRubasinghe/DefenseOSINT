const RING_RADII = [70, 140, 210, 280, 350];
const TICK_COUNT = 48;

/**
 * Fixed instrument-plate texture behind the console: map graticule, plotting
 * rings, edge graduations and a reticle. Everything sits at very low opacity —
 * it should register as surface, not as decoration competing with the data.
 */
export default function ConsoleBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg
        className="backdrop-svg"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="bd-fine" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0 L0 0 0 10" fill="none" className="bd-line-fine" />
          </pattern>
          <pattern id="bd-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <rect width="80" height="80" fill="url(#bd-fine)" />
            <path d="M80 0 L0 0 0 80" fill="none" className="bd-line-coarse" />
          </pattern>
          <radialGradient id="bd-fade" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#0d1013" stopOpacity="0" />
            <stop offset="100%" stopColor="#0d1013" stopOpacity="0.92" />
          </radialGradient>
        </defs>

        <rect width="1600" height="900" fill="url(#bd-grid)" />

        {/* plotting rings, off-centre so the composition is not symmetrical */}
        <g className="bd-rings" transform="translate(1290 690)">
          {RING_RADII.map((r) => (
            <circle key={r} r={r} />
          ))}
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const angle = (i / TICK_COUNT) * Math.PI * 2;
            const major = i % 4 === 0;
            const inner = major ? 336 : 344;
            return (
              <line
                key={i}
                x1={Math.cos(angle) * inner}
                y1={Math.sin(angle) * inner}
                x2={Math.cos(angle) * 350}
                y2={Math.sin(angle) * 350}
                className={major ? "bd-tick-major" : "bd-tick"}
              />
            );
          })}
          <line x1="-350" y1="0" x2="350" y2="0" className="bd-crosshair" />
          <line x1="0" y1="-350" x2="0" y2="350" className="bd-crosshair" />
        </g>

        {/* secondary bearing arc, upper left */}
        <g className="bd-rings" transform="translate(180 130)">
          <circle r="120" />
          <circle r="200" />
          <path d="M -200 0 A 200 200 0 0 1 0 -200" className="bd-arc" />
        </g>

        {/* reticle */}
        <g className="bd-reticle" transform="translate(1180 210)">
          <circle r="26" />
          <line x1="-44" y1="0" x2="-14" y2="0" />
          <line x1="14" y1="0" x2="44" y2="0" />
          <line x1="0" y1="-44" x2="0" y2="-14" />
          <line x1="0" y1="14" x2="0" y2="44" />
        </g>

        {/* graduations along the top and left margins */}
        <g className="bd-tick">
          {Array.from({ length: 32 }, (_, i) => (
            <line key={`t${i}`} x1={i * 50} y1="0" x2={i * 50} y2={i % 4 === 0 ? 14 : 7} />
          ))}
          {Array.from({ length: 18 }, (_, i) => (
            <line key={`l${i}`} x1="0" y1={i * 50} x2={i % 4 === 0 ? 14 : 7} y2={i * 50} />
          ))}
        </g>

        <rect width="1600" height="900" fill="url(#bd-fade)" />
      </svg>
    </div>
  );
}
