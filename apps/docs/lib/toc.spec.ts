import { extractToc } from "./toc"

describe("extractToc", () => {
  it("lists h2 and h3 with the same ids the page renders", () => {
    const body = "# Title\n\n## Set up the **server**\n\n### Step [one](/x/)\n\n## Set up the server\n"
    expect(extractToc(body)).toEqual([
      { depth: 2, text: "Set up the server", id: "set-up-the-server" },
      { depth: 3, text: "Step one", id: "step-one" },
      { depth: 2, text: "Set up the server", id: "set-up-the-server-2" },
    ])
  })

  it("ignores headings inside code fences", () => {
    expect(extractToc("```\n## not a heading\n```\n## Real\n")).toEqual([
      { depth: 2, text: "Real", id: "real" },
    ])
  })

  it("keeps accented headings readable as ids", () => {
    expect(extractToc("## Configuración y español")[0].id).toBe("configuracion-y-espanol")
  })
})
