import { createBeforeSync } from "./read-only"

const connection = (readOnly: boolean) => ({
  readOnly,
  socketId: "s1",
  context: { userId: "u1" },
})
const NAME = "know.page:00000000-0000-4000-8000-000000000001"

describe("beforeSync hook", () => {
  it("logs a Yjs update sent by a read-only connection", () => {
    const log = jest.fn()
    createBeforeSync(log)({
      connection: connection(true),
      type: 2,
      documentName: NAME,
    } as never)
    expect(log).toHaveBeenCalledWith("readonly-update-ignored", {
      documentName: NAME,
      userId: "u1",
      socketId: "s1",
    })
  })

  it("does not log the normal handshake of a reader (sync step 1 and 2)", () => {
    const log = jest.fn()
    for (const type of [0, 1])
      createBeforeSync(log)({
        connection: connection(true),
        type,
        documentName: NAME,
      } as never)
    expect(log).not.toHaveBeenCalled()
  })

  it("does not log updates from writers", () => {
    const log = jest.fn()
    createBeforeSync(log)({
      connection: connection(false),
      type: 2,
      documentName: NAME,
    } as never)
    expect(log).not.toHaveBeenCalled()
  })
})
