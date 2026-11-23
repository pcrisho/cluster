import { errorBody } from "./http-exception.filter"

describe("errorBody", () => {
  it("keeps the code and params an exception carries", () => {
    expect(
      errorBody(409, { code: "STEP_LOCKED", message: 'Complete "Intro" first', params: { title: "Intro" } }),
    ).toEqual({ statusCode: 409, code: "STEP_LOCKED", message: 'Complete "Intro" first', params: { title: "Intro" } })
  })

  it("names validation errors", () => {
    expect(errorBody(400, { statusCode: 400, message: ["name must be a string"], error: "Bad Request" })).toEqual({
      statusCode: 400,
      code: "VALIDATION_FAILED",
      message: ["name must be a string"],
      error: "Bad Request",
    })
  })

  it("falls back to a code per status", () => {
    expect(errorBody(404, { statusCode: 404, message: "Course not found", error: "Not Found" }).code).toBe("NOT_FOUND")
    expect(errorBody(429, "ThrottlerException: Too Many Requests")).toEqual({
      statusCode: 429,
      code: "TOO_MANY_REQUESTS",
      message: "ThrottlerException: Too Many Requests",
    })
    expect(errorBody(502, {}).code).toBe("INTERNAL")
    expect(errorBody(418, {}).code).toBe("ERROR")
  })
})
