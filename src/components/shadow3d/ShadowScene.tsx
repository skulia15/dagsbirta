"use client";

import { Line, OrbitControls, Sky } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { BuiltScene } from "@/lib/shadow/scene-geometry";
import type { Spot, SpotSunlight } from "@/lib/shadow/sunlight";

interface Props {
  scene: BuiltScene;
  spot: Spot;
  origin: THREE.Vector3;
  sunlight: SpotSunlight;
  /** Sun hidden behind distant terrain as seen from the scene centre */
  sceneShadedByHorizon: boolean;
  onPick: (spot: Spot) => void;
  /**
   * Annual sun-hours heatmap (plan-view texture over the detailed grid). When set,
   * ground and roofs show it unlit, so colours mean hours, not lighting.
   */
  heat?: { ground: THREE.Texture; roof: THREE.Texture } | null;
}

const RAY_LENGTH = 400;
const PIN_HEIGHT = 30;
const SHADOW_MAP_SIZE = 4096;

function SunLight({
  direction,
  radius,
  intensity,
}: {
  direction: THREE.Vector3;
  radius: number;
  intensity: number;
}) {
  const distance = radius * 4;
  const position = useMemo(
    () => direction.clone().multiplyScalar(distance),
    [direction, distance],
  );
  const extent = radius * 1.15;
  return (
    <directionalLight
      position={position}
      intensity={intensity}
      castShadow
      shadow-mapSize-width={SHADOW_MAP_SIZE}
      shadow-mapSize-height={SHADOW_MAP_SIZE}
      shadow-camera-left={-extent}
      shadow-camera-right={extent}
      shadow-camera-top={extent}
      shadow-camera-bottom={-extent}
      shadow-camera-near={1}
      shadow-camera-far={distance * 2}
      shadow-bias={-0.0004}
      shadow-normalBias={0.4}
    />
  );
}

export default function ShadowScene({
  scene,
  spot,
  origin,
  sunlight,
  sceneShadedByHorizon,
  onPick,
  heat = null,
}: Props) {
  const radius = scene.data.radius;
  const { direction, altitude, lit, hitPoint } = sunlight;
  const sunUp = altitude > 0;
  const markerColor = lit ? "#ffb000" : "#3b6fd9";

  // Fade the sun in over the first few degrees so sunrise isn't a hard switch
  const sunIntensity =
    sunUp && !sceneShadedByHorizon ? 2.8 * Math.min(1, 0.25 + altitude / 8) : 0;
  const ambient = sunUp ? 0.55 : 0.12;

  const rayEnd = useMemo(
    () =>
      hitPoint
        ? hitPoint.clone()
        : origin.clone().addScaledVector(direction, RAY_LENGTH),
    [hitPoint, origin, direction],
  );
  const skySun = useMemo(
    () => direction.clone().multiplyScalar(1000),
    [direction],
  );
  // Parent remounts this component per scene (key), so this only sets the starting view
  const initialCamera: [number, number, number] = [
    spot.point.x + radius * 0.45,
    spot.point.y + radius * 0.4,
    spot.point.z + radius * 0.75,
  ];

  const handleClick =
    (surface: Spot["surface"] | "auto") => (e: ThreeEvent<MouseEvent>) => {
      // Ignore clicks that were really orbit drags
      if (e.delta > 4) return;
      e.stopPropagation();
      const normal = e.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
      const kind =
        surface === "auto"
          ? Math.abs(normal.y) > 0.5
            ? "roof"
            : "wall"
          : surface;
      onPick({ point: e.point.clone(), normal, surface: kind });
    };

  return (
    <Canvas
      // Pin to the container so the canvas always fills it, whatever the flex layout does
      style={{ position: "absolute", inset: 0 }}
      shadows
      camera={{ position: initialCamera, fov: 45, near: 1, far: 120_000 }}
      gl={{ logarithmicDepthBuffer: true, antialias: true }}
    >
      <Sky
        sunPosition={skySun}
        distance={450_000}
        turbidity={6}
        rayleigh={sunUp ? 1.2 : 0.3}
        mieCoefficient={0.004}
      />
      <hemisphereLight args={["#cfe3ff", "#5b5a4c", ambient]} />
      <SunLight
        direction={direction}
        radius={radius}
        intensity={sunIntensity}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: three.js mesh, not a DOM element */}
      <mesh
        geometry={scene.terrain}
        receiveShadow
        castShadow
        onClick={handleClick("ground")}
      >
        {heat ? (
          <meshBasicMaterial key="heat" map={heat.ground} />
        ) : (
          <meshStandardMaterial key="plain" vertexColors roughness={1} />
        )}
      </mesh>

      <mesh geometry={scene.farTerrain}>
        <meshStandardMaterial
          vertexColors
          color="#d8d8d8"
          roughness={1}
          polygonOffset
          polygonOffsetFactor={4}
          polygonOffsetUnits={4}
        />
      </mesh>

      {scene.buildings && (
        // biome-ignore lint/a11y/noStaticElementInteractions: three.js mesh, not a DOM element
        <mesh
          geometry={scene.buildings}
          castShadow
          receiveShadow
          onClick={handleClick("auto")}
        >
          <meshStandardMaterial color="#e2ddd5" roughness={0.85} />
        </mesh>
      )}

      {heat && scene.roofs && (
        // biome-ignore lint/a11y/noStaticElementInteractions: three.js mesh, not a DOM element
        <mesh
          geometry={scene.roofs}
          onClick={(e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            onPick({
              // Back onto the real roof surface, under the overlay's small lift
              point: e.point.clone().setY(e.point.y - 0.05),
              normal: new THREE.Vector3(0, 1, 0),
              surface: "roof",
            });
          }}
        >
          <meshBasicMaterial map={heat.roof} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Picked spot + ray towards the sun */}
      <mesh position={origin}>
        <sphereGeometry args={[1.6, 24, 16]} />
        <meshBasicMaterial color={markerColor} />
      </mesh>
      {/* Pin so the spot is findable from a distance (visual only, not raycast) */}
      <mesh position={[origin.x, origin.y + PIN_HEIGHT / 2, origin.z]}>
        <cylinderGeometry args={[0.35, 0.35, PIN_HEIGHT, 8]} />
        <meshBasicMaterial color={markerColor} />
      </mesh>
      <mesh position={[origin.x, origin.y + PIN_HEIGHT, origin.z]}>
        <sphereGeometry args={[4, 24, 16]} />
        <meshBasicMaterial color={markerColor} />
      </mesh>
      {sunUp && (
        <Line
          points={[origin, rayEnd]}
          color={lit ? "#ffc23d" : "#ff4d4d"}
          lineWidth={2.5}
          dashed={!lit}
          dashSize={4}
          gapSize={3}
        />
      )}

      <OrbitControls
        target={spot.point}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={20}
        maxDistance={radius * 12}
        enableDamping
      />
    </Canvas>
  );
}
