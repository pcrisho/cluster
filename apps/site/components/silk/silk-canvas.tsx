"use client"

import * as React from "react"
import { forwardRef, useRef, useMemo, useLayoutEffect, useEffect } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { toThreeColor } from "@/lib/css-color"

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;
uniform float uOpacity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd        = noise(gl_FragCoord.xy);
  vec2  uv         = rotateUvs(vUv * uScale, uRotation);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = uOpacity;
  gl_FragColor = col;
}
`

// The shader writes uColor straight to the sRGB canvas, so keep the token's sRGB values as they are
// (THREE.Color would convert them to linear and the silk would come out nearly black).
function tokenColor(value: string) {
  return new THREE.Color().setStyle(
    toThreeColor(value),
    THREE.LinearSRGBColorSpace
  )
}

interface SilkPlaneProps {
  color: string
  speed: number
  scale: number
  noiseIntensity: number
  rotation: number
  opacity: number
}

const SilkPlane = forwardRef<THREE.Mesh, SilkPlaneProps>(function SilkPlane(
  { color, speed, scale, noiseIntensity, rotation, opacity },
  ref
) {
  const { viewport } = useThree()
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => {
    return {
      uSpeed: { value: speed },
      uScale: { value: scale },
      uNoiseIntensity: { value: noiseIntensity },
      uColor: { value: tokenColor(color) },
      uRotation: { value: rotation },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
    }
  }, [speed, scale, noiseIntensity, color, rotation, opacity])

  useLayoutEffect(() => {
    const mesh = (ref as React.MutableRefObject<THREE.Mesh | null>)?.current
    if (mesh) {
      mesh.scale.set(viewport.width, viewport.height, 1)
    }
  }, [ref, viewport])

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uColor.value.copy(tokenColor(color))
      materialRef.current.uniforms.uOpacity.value = opacity
    }
  }, [color, opacity])

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += 0.1 * delta
    }
  })

  return (
    <mesh ref={ref}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
      />
    </mesh>
  )
})
SilkPlane.displayName = "SilkPlane"

export interface SilkCanvasProps {
  speed?: number
  scale?: number
  color?: string
  noiseIntensity?: number
  rotation?: number
  opacity?: number
  paused?: boolean
}

export function SilkCanvas({
  speed = 5,
  scale = 1,
  color = "",
  noiseIntensity = 1.5,
  rotation = 0,
  opacity = 0.5,
  paused = false,
}: SilkCanvasProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={paused ? "never" : "always"}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => {
        gl.setClearAlpha(0)
      }}
    >
      <SilkPlane
        ref={meshRef}
        color={color}
        speed={speed}
        scale={scale}
        noiseIntensity={noiseIntensity}
        rotation={rotation}
        opacity={opacity}
      />
    </Canvas>
  )
}
