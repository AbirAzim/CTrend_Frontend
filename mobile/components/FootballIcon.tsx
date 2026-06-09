import Svg, { Circle, ClipPath, Defs, G, Line, Polygon } from "react-native-svg";

/** A clean classic football (soccer ball) — crisp at any size. */
export function FootballIcon({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id="wc-ball">
          <Circle cx="50" cy="50" r="46" />
        </ClipPath>
      </Defs>
      <Circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#111111" strokeWidth={3} />
      <G clipPath="url(#wc-ball)">
        {/* centre pentagon */}
        <Polygon points="50,31 65,42 59,60 41,60 35,42" fill="#111111" />
        {/* rim pentagons (clipped to the ball edge → partial, like a real ball) */}
        <Polygon points="50,-2 60,6 56,18 44,18 40,6" fill="#111111" />
        <Polygon points="92,30 100,42 92,52 82,46 84,34" fill="#111111" />
        <Polygon points="78,86 66,92 58,82 66,72 78,74" fill="#111111" />
        <Polygon points="22,86 34,74 42,82 34,92 22,86" fill="#111111" />
        <Polygon points="8,30 16,34 18,46 8,52 0,42" fill="#111111" />
        {/* seams */}
        <Line x1="50" y1="31" x2="50" y2="12" stroke="#111111" strokeWidth={3} />
        <Line x1="65" y1="42" x2="85" y2="40" stroke="#111111" strokeWidth={3} />
        <Line x1="59" y1="60" x2="68" y2="78" stroke="#111111" strokeWidth={3} />
        <Line x1="41" y1="60" x2="32" y2="78" stroke="#111111" strokeWidth={3} />
        <Line x1="35" y1="42" x2="15" y2="40" stroke="#111111" strokeWidth={3} />
      </G>
    </Svg>
  );
}
