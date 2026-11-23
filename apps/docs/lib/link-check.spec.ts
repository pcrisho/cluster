import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { checkOutputLinks } from "./link-check"

describe("checkOutputLinks", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-links-"))
    fs.mkdirSync(path.join(tmpDir, "en/overview"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, "screenshots"), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, "screenshots/demo.png"), "png")
    fs.writeFileSync(
      path.join(tmpDir, "en/overview/index.html"),
      `<!doctype html><html><body>
        <h2 id="intro">Intro</h2>
        <a href="/en/overview/#intro">Valid</a>
        <a href="https://example.com/external">External</a>
        <img src="/screenshots/demo.png" alt="Demo" />
      </body></html>`
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test("passes when all internal links, anchors, and images resolve", () => {
    expect(checkOutputLinks(tmpDir)).toEqual([])
  })

  test("fails when an internal link target is missing", () => {
    fs.writeFileSync(
      path.join(tmpDir, "en/overview/index.html"),
      `<a href="/en/overview/missing/">Missing</a>`
    )
    const errors = checkOutputLinks(tmpDir)
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe("link")
    expect(errors[0].target).toBe("/en/overview/missing/")
  })

  test("fails when an anchor fragment is missing", () => {
    fs.writeFileSync(
      path.join(tmpDir, "en/overview/index.html"),
      `<h2 id="intro">Intro</h2><a href="#does-not-exist">Bad anchor</a>`
    )
    const errors = checkOutputLinks(tmpDir)
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe("anchor")
    expect(errors[0].target).toBe("#does-not-exist")
  })

  test("fails when an image src is missing", () => {
    fs.writeFileSync(
      path.join(tmpDir, "en/overview/index.html"),
      `<img src="/screenshots/missing.png" alt="Missing" />`
    )
    const errors = checkOutputLinks(tmpDir)
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe("image")
    expect(errors[0].target).toBe("/screenshots/missing.png")
  })
})
