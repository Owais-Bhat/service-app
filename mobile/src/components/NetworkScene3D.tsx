import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import type { Group } from 'three';
import { colors } from '../theme';

const NODE_COUNT = 42;
const SPHERE_RADIUS = 2.2;
// Two nodes get a connecting line when closer than this — tuned by hand
// against SPHERE_RADIUS so the mesh reads as a network, not a solid blob.
const LINK_DISTANCE = 1.1;

function fibonacciSpherePoints(count: number, radius: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    pts.push([
      radius * Math.cos(theta) * Math.sin(phi),
      radius * Math.sin(theta) * Math.sin(phi),
      radius * Math.cos(phi),
    ]);
  }
  return pts;
}

function buildLinkSegments(points: [number, number, number][]): Float32Array {
  const segments: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [x1, y1, z1] = points[i];
      const [x2, y2, z2] = points[j];
      const d = Math.hypot(x1 - x2, y1 - y2, z1 - z2);
      if (d < LINK_DISTANCE) {
        segments.push(x1, y1, z1, x2, y2, z2);
      }
    }
  }
  return new Float32Array(segments);
}

function RotatingNetwork() {
  const groupRef = useRef<Group>(null);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.18;
      groupRef.current.rotation.x = Math.sin(Date.now() / 4000) * 0.15;
    }
  });

  const points = useMemo(() => fibonacciSpherePoints(NODE_COUNT, SPHERE_RADIUS), []);
  const linkPositions = useMemo(() => buildLinkSegments(points), [points]);

  return (
    <group ref={groupRef}>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshBasicMaterial color={colors.primary} />
        </mesh>
      ))}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linkPositions, 3]}
            count={linkPositions.length / 3}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={colors.primaryDim} transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

// Rotating sphere of nodes + connecting lines — the "network" in Networking
// Experts, rendered as a genuine live three.js scene (not a static image or
// Lottie loop) via @react-three/fiber's native renderer on top of expo-gl.
export default function NetworkScene3D() {
  return (
    <Canvas camera={{ position: [0, 0, 5.5], fov: 50 }} style={{ flex: 1 }}>
      <ambientLight intensity={1} />
      <RotatingNetwork />
    </Canvas>
  );
}
