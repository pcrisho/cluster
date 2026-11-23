import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { readBlock } from "@cluster/theme"

describe("token drift guard", () => {
  const webCss = readFileSync(
    resolve(__dirname, "../../web/app/globals.css"),
    "utf8"
  )
  const siteCss = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8")

  it("ensures every :root token in web matches site", () => {
    const webRoot = readBlock(webCss, ":root")
    const siteRoot = readBlock(siteCss, ":root")
    expect(siteRoot).toEqual(webRoot)
  })

  it("ensures every .dark token in web matches site", () => {
    const webDark = readBlock(webCss, ".dark")
    const siteDark = readBlock(siteCss, ".dark")
    expect(siteDark).toEqual(webDark)
  })
})
