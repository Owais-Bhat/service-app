import { useMemo } from "react";
import { useCurrentFrame, interpolate } from "remotion";

const COLORS = {
  primary: "#2bbf73",
  primaryDim: "#1c8a53",
};

// Deterministic pseudo-random layout (seeded, not Math.random) so every
// render of the same frame produces pixel-identical output — required for
// Remotion's parallel frame rendering to be consistent.
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

interface Node {
  x: number;
  y: number;
  delay: number;
}

const NODE_COUNT = 26;
const LINK_DISTANCE = 22; // in the same 0-100 percentage space as node positions

function buildNodes(): Node[] {
  const nodes: Node[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({
      x: seededRandom(i * 12.9898) * 100,
      y: seededRandom(i * 78.233 + 4) * 100,
      delay: Math.floor(seededRandom(i * 3.7) * 40),
    });
  }
  return nodes;
}

function buildLinks(nodes: Node[]) {
  const links: { a: Node; b: Node; delay: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < LINK_DISTANCE) {
        links.push({ a: nodes[i], b: nodes[j], delay: Math.max(nodes[i].delay, nodes[j].delay) });
      }
    }
  }
  return links;
}

// A softly animated, in-brand network background — nodes and connecting
// lines fade/scale in with a staggered delay, then drift gently. This is the
// video counterpart of the mobile app's live NetworkScene3D: same "network"
// motif, but pre-rendered here since Remotion targets an exported MP4, not a
// live GPU scene.
export function NetworkNodes() {
  const frame = useCurrentFrame();
  const nodes = useMemo(buildNodes, []);
  const links = useMemo(() => buildLinks(nodes), [nodes]);

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      {links.map((link, i) => {
        const opacity = interpolate(frame, [link.delay, link.delay + 20], [0, 0.35], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <line
            key={i}
            x1={link.a.x}
            y1={link.a.y}
            x2={link.b.x}
            y2={link.b.y}
            stroke={COLORS.primaryDim}
            strokeWidth={0.15}
            opacity={opacity}
          />
        );
      })}
      {nodes.map((node, i) => {
        const scale = interpolate(frame, [node.delay, node.delay + 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const drift = Math.sin((frame + node.delay * 5) / 40) * 0.6;
        return (
          <circle
            key={i}
            cx={node.x}
            cy={node.y + drift}
            r={0.55 * scale}
            fill={COLORS.primary}
            opacity={scale}
          />
        );
      })}
    </svg>
  );
}
