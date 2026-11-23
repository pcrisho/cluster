import * as THREE from "three"
import { isHexOrRgb, toThreeColor } from "./css-color"

describe("css-color pure helpers", () => {
  describe("isHexOrRgb", () => {
    it("recognizes standard 6-digit hex", () => {
      expect(isHexOrRgb("#4c33e1")).toBe(true)
      expect(isHexOrRgb("#000000")).toBe(true)
    })

    it("recognizes 3-digit hex", () => {
      expect(isHexOrRgb("#fff")).toBe(true)
      expect(isHexOrRgb("#123")).toBe(true)
    })

    it("recognizes 8-digit hex with alpha", () => {
      expect(isHexOrRgb("#ffffff1a")).toBe(true)
    })

    it("recognizes 4-digit hex with alpha", () => {
      expect(isHexOrRgb("#fff8")).toBe(true)
    })

    it("recognizes rgb and rgba notation", () => {
      expect(isHexOrRgb("rgb(76, 51, 225)")).toBe(true)
      expect(isHexOrRgb("rgba(76, 51, 225, 0.5)")).toBe(true)
    })

    it("rejects non-color values or empty strings", () => {
      expect(isHexOrRgb("")).toBe(false)
      expect(isHexOrRgb(null)).toBe(false)
      expect(isHexOrRgb(undefined)).toBe(false)
      expect(isHexOrRgb("transparent")).toBe(false)
      expect(isHexOrRgb("var(--primary)")).toBe(false)
      expect(isHexOrRgb("not-a-color")).toBe(false)
    })
  })

  describe("toThreeColor", () => {
    it("preserves 6-digit hex", () => {
      const color = toThreeColor("#4c33e1")
      expect(color).toBe("#4c33e1")
      expect(new THREE.Color(color).getHexString()).toBe("4c33e1")
    })

    it("preserves 3-digit hex", () => {
      const color = toThreeColor("#fff")
      expect(color).toBe("#fff")
      expect(new THREE.Color(color).getHexString()).toBe("ffffff")
    })

    it("strips alpha from 8-digit hex so THREE.Color does not fail", () => {
      const color = toThreeColor("#ffffff1a")
      expect(color).toBe("#ffffff")
      expect(new THREE.Color(color).getHexString()).toBe("ffffff")
    })

    it("strips alpha from 4-digit hex", () => {
      const color = toThreeColor("#abc4")
      expect(color).toBe("#abc")
      expect(new THREE.Color(color).getHexString()).toBe("aabbcc")
    })

    it("normalizes rgba to rgb so THREE.Color accepts it without alpha warning", () => {
      const color = toThreeColor("rgba(100, 150, 200, 0.8)")
      expect(color).toBe("rgb(100, 150, 200)")
      expect(new THREE.Color(color).getStyle()).toBe("rgb(100,150,200)")
    })

    it("falls back to the secondary color when primary is invalid or empty", () => {
      expect(toThreeColor("", "#2a80e2")).toBe("#2a80e2")
      expect(toThreeColor(undefined, "#2a80e2")).toBe("#2a80e2")
      expect(toThreeColor("invalid", "#2a80e2")).toBe("#2a80e2")
      expect(toThreeColor("var(--muted)", "#ffffff1a")).toBe("#ffffff")
    })

    it("falls back to #ffffff when both value and fallback are invalid", () => {
      expect(toThreeColor("invalid", "also-invalid")).toBe("#ffffff")
      expect(
        new THREE.Color(toThreeColor("invalid", "also-invalid")).getHexString()
      ).toBe("ffffff")
    })
  })
})
