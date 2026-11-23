import en from "@/messages/en.json"
import es from "@/messages/es.json"
import { errorMessage, type ErrorCatalog } from "./error-message"

/** A minimal stand-in for next-intl's t(): looks up the key and fills simple {placeholders}. */
function catalog(errors: Record<string, unknown>): ErrorCatalog {
  const lookup = (key: string) =>
    key
      .split(".")
      .reduce<unknown>(
        (node, k) => (node as Record<string, unknown> | undefined)?.[k],
        errors
      )
  return {
    has: (key) => typeof lookup(key) === "string",
    t: (key, params) =>
      String(lookup(key)).replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params?.[name] ?? `{${name}}`)
      ),
  }
}

describe("errorMessage", () => {
  const locked = {
    code: "STEP_LOCKED",
    status: 409,
    message: 'Complete "Intro" first',
    params: { title: "Intro" },
  }

  it("translates a known code with its values", () => {
    expect(errorMessage(locked, catalog(es.errors), "es")).toBe(
      "Completa “Intro” primero."
    )
    expect(errorMessage(locked, catalog(en.errors), "en")).toBe(
      "Complete “Intro” first."
    )
  })

  it("in English, shows the API's message for a code the catalog lacks", () => {
    const other = {
      code: "SOMETHING_NEW",
      status: 400,
      message: "Only a draft can be published",
    }
    expect(errorMessage(other, catalog(en.errors), "en")).toBe(
      "Only a draft can be published"
    )
  })

  it("in another language, never shows the API's English text", () => {
    const other = {
      code: "NOT_FOUND",
      status: 404,
      message: "Course not found",
    }
    expect(errorMessage(other, catalog(es.errors), "es")).toBe(
      "Esto ya no existe o no tienes acceso."
    )
    expect(
      errorMessage(
        { code: "X", status: 418, message: "teapot" },
        catalog(es.errors),
        "es"
      )
    ).toBe("Algo salió mal. Inténtalo de nuevo.")
    expect(
      errorMessage(
        { code: "X", status: 502, message: "Bad gateway" },
        catalog(es.errors),
        "es"
      )
    ).toBe("Algo salió mal en el servidor. Inténtalo de nuevo.")
  })
})
