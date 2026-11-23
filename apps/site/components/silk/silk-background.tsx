"use client"

import * as React from "react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { checkWebGL, readToken } from "@/lib/css-color"
import { SilkFallback } from "./silk-fallback"

const SilkCanvas = dynamic(
  () => import("./silk-canvas").then((m) => m.SilkCanvas),
  {
    ssr: false,
    loading: () => <SilkFallback />,
  }
)

function subscribeMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  mq.addEventListener("change", callback)
  return () => mq.removeEventListener("change", callback)
}

function getMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getMotionServerSnapshot() {
  return false
}

const BRAND_CHANGE_EVENT = "cluster:brand-change"
let brandVersion = 0

function subscribeBrand(callback: () => void) {
  const onChange = () => {
    brandVersion += 1
    callback()
  }
  window.addEventListener(BRAND_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(BRAND_CHANGE_EVENT, onChange)
}

function getBrandVersion() {
  return brandVersion
}

function subscribeNoop() {
  return () => {}
}

export function SilkBackground() {
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getMotionSnapshot,
    getMotionServerSnapshot
  )
  const hasWebGL = useSyncExternalStore(subscribeNoop, checkWebGL, () => false)
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isDocVisible, setIsDocVisible] = useState(true)

  // The brand colour, re-read when the theme changes or the brand picker re-themes the page.
  const brandVersion = useSyncExternalStore(
    subscribeBrand,
    getBrandVersion,
    () => 0
  )
  const color = useMemo(() => {
    return readToken("--primary")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, brandVersion])

  // Pause Silk animation when the wrapper is not in the viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry?.isIntersecting ?? false)
      },
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
    // The wrapper mounts only after the WebGL/motion checks pass (the first render is the fallback).
  }, [hasWebGL, reducedMotion])

  // Pause when the browser tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      setIsDocVisible(!document.hidden)
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility)
  }, [])

  const dark = resolvedTheme === "dark"
  const paused = !isVisible || !isDocVisible

  if (reducedMotion || !hasWebGL) {
    return <SilkFallback />
  }

  return (
    <motion.div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.6, ease: "easeOut", delay: 0.15 }}
    >
      <SilkCanvas
        speed={5}
        scale={1}
        color={color}
        noiseIntensity={dark ? 1.5 : 0.8}
        rotation={0}
        opacity={dark ? 0.55 : 0.22}
        paused={paused}
      />
    </motion.div>
  )
}
