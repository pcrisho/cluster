import { notificationText, type NotificationCatalog } from "./notification-text"

const catalog = (texts: Record<string, string>): NotificationCatalog => ({
  has: (key) => key in texts,
  t: (key, params) =>
    texts[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name])
    ),
})
const es = catalog({
  grow_course_assigned: "Te asignaron {course}",
  connect_celebration_reaction: "{name} reaccionó",
  connect_celebration_reaction_body: "Envió {emoji}",
})

describe("notificationText", () => {
  it("writes a known type in the reader's language from its values", () => {
    const n = {
      type: "grow:course:assigned",
      title: "You were assigned Safety",
      body: null,
      payload: { params: { course: "Safety" } },
    }
    expect(notificationText(n, es)).toEqual({
      title: "Te asignaron Safety",
      body: null,
    })
  })

  it("keeps people's content as the body, and writes the catalog's body when there is one", () => {
    const reaction = {
      type: "connect:celebration:reaction",
      title: "Ana reacted",
      body: "Sent 🎉",
      payload: { params: { name: "Ana", emoji: "🎉" } },
    }
    expect(notificationText(reaction, es)).toEqual({
      title: "Ana reaccionó",
      body: "Envió 🎉",
    })
  })

  it("falls back to the stored English for an unknown type or one without values", () => {
    const unknown = {
      type: "life:new:thing",
      title: "Something",
      body: "b",
      payload: { params: {} },
    }
    expect(notificationText(unknown, es)).toEqual({
      title: "Something",
      body: "b",
    })
    const old = {
      type: "grow:course:assigned",
      title: "You were assigned X",
      body: null,
      payload: null,
    }
    expect(notificationText(old, es).title).toBe("You were assigned X")
  })
})
