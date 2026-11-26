import { NotFoundException } from "@nestjs/common";
import { CollabRegistry } from "./collab.registry";
import type { CollabDocumentProvider } from "./collab.types";

function provider(kind: string): CollabDocumentProvider {
  return {
    kind,
    authorize: jest.fn(),
    load: jest.fn(),
    seed: jest.fn(),
    store: jest.fn(),
  } as unknown as CollabDocumentProvider;
}

describe("CollabRegistry", () => {
  it("returns a registered provider by kind", () => {
    const registry = new CollabRegistry();
    const know = provider("know.page");
    registry.register(know);
    expect(registry.get("know.page")).toBe(know);
  });

  it("throws on a duplicate kind", () => {
    const registry = new CollabRegistry();
    registry.register(provider("know.page"));
    expect(() => registry.register(provider("know.page"))).toThrow(Error);
  });

  it("throws NotFoundException for an unknown kind", () => {
    const registry = new CollabRegistry();
    expect(() => registry.get("grow.lesson")).toThrow(NotFoundException);
    expect(() => registry.get("grow.lesson")).toThrow("Unknown document kind");
  });
});
