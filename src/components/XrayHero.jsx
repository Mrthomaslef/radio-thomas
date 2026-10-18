import { motion } from 'framer-motion';

// Stylised chest radiograph drawn in SVG, with an animated scan line.
const ribs = Array.from({ length: 9 }, (_, i) => i);

export default function XrayHero() {
  return (
    <div className="xray">
      <div className="xray-glow" />
      <svg viewBox="0 0 400 480" className="xray-svg" role="img" aria-label="Animated chest X-ray">
        <defs>
          <radialGradient id="lung" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#7fe9ff" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#7fe9ff" stopOpacity="0.28" />
          </radialGradient>
          <linearGradient id="bone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6fbff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#8fdcf0" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="scanfade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38e1ff" stopOpacity="0" />
            <stop offset="100%" stopColor="#38e1ff" stopOpacity="0.55" />
          </linearGradient>
          <filter id="soft"><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>

        {/* lungs */}
        <ellipse cx="135" cy="250" rx="82" ry="150" fill="url(#lung)" />
        <ellipse cx="265" cy="250" rx="82" ry="150" fill="url(#lung)" />
        {/* heart shadow */}
        <path d="M205 300c-10-45 40-70 70-35 25 30 5 95-35 105-25 6-30-30-35-70Z" fill="#9fe7f7" opacity="0.14" />

        {/* clavicles */}
        <path d="M200 98c-45 4-85 14-130 38" stroke="url(#bone)" strokeWidth="9" strokeLinecap="round" fill="none" filter="url(#soft)" />
        <path d="M200 98c45 4 85 14 130 38" stroke="url(#bone)" strokeWidth="9" strokeLinecap="round" fill="none" filter="url(#soft)" />

        {/* ribs */}
        {ribs.map((i) => {
          const y = 130 + i * 30;
          const w = 70 + Math.sin((i / 8) * Math.PI) * 55;
          return (
            <g key={i} stroke="url(#bone)" strokeWidth="6" strokeLinecap="round" fill="none" filter="url(#soft)">
              <motion.path
                d={`M196 ${y} C ${200 - w * 0.5} ${y - 22}, ${200 - w} ${y - 4}, ${200 - w - 8} ${y + 34}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, delay: 0.25 + i * 0.09 }}
              />
              <motion.path
                d={`M204 ${y} C ${200 + w * 0.5} ${y - 22}, ${200 + w} ${y - 4}, ${200 + w + 8} ${y + 34}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, delay: 0.25 + i * 0.09 }}
              />
            </g>
          );
        })}

        {/* spine */}
        {Array.from({ length: 14 }, (_, i) => (
          <motion.rect
            key={i}
            x="190"
            y={100 + i * 26}
            width="20"
            height="18"
            rx="6"
            fill="url(#bone)"
            filter="url(#soft)"
            initial={{ opacity: 0, scaleX: 0.4 }}
            animate={{ opacity: 0.95, scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.15 + i * 0.05 }}
            style={{ transformOrigin: '200px 0' }}
          />
        ))}

        {/* annotation markers */}
        <g className="marker" transform="translate(95 200)">
          <circle r="5" className="pulse" />
          <circle r="3" />
        </g>
        <g className="marker" transform="translate(305 285)">
          <circle r="5" className="pulse delay" />
          <circle r="3" />
        </g>

        {/* scan line */}
        <g className="scan">
          <rect x="0" y="-70" width="400" height="70" fill="url(#scanfade)" />
          <rect x="0" y="-1" width="400" height="2" fill="#7fefff" />
        </g>
      </svg>

      <motion.div
        className="chip chip-a"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
      >
        <span className="dot" /> PA erect · 120 kVp
      </motion.div>
      <motion.div
        className="chip chip-b"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4 }}
      >
        Finding: spot the abnormality
      </motion.div>
    </div>
  );
}
