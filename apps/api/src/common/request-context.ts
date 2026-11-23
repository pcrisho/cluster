import { AsyncLocalStorage } from "async_hooks"

export interface RequestContext {
  userId: string | null
  organizationId: string | null
}

const storage = new AsyncLocalStorage<RequestContext>()

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

export function runWithContext(ctx: RequestContext, fn: () => unknown): unknown {
  return storage.run(ctx, fn)
}

/**
 * Runs fn for an organization found without a request user (login, collab): `userId` stays null.
 * Await the queries inside fn: a Prisma promise is lazy and takes the context where it is awaited.
 */
export function withOrg<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId: null, organizationId }, fn)
}
