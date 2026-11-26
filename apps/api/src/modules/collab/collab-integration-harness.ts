import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { INestApplication } from "@nestjs/common";
import { AuthTokens } from "../auth/auth-tokens";
import request from "supertest";
import WebSocket from "ws";
import * as Y from "yjs";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp } from "../../test-helpers";
// The collab service is imported from its source: no workspace dependency, so docker/Dockerfile.api is unaffected.
import {
  createCollabServer,
  fieldsToYdoc,
  ydocToFields,
} from "../../../../collab/src/index";

export const SECRET = "test-collab-secret-".repeat(4);
const ORIGIN = "http://localhost:3000";

export const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
export const normalized = (body: object, title: string) =>
  ydocToFields(fieldsToYdoc({ body: body as Record<string, unknown>, title }));
export const pause = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
export const until = async (
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 8000,
) => {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};
export const appendParagraph = (ydoc: Y.Doc, text: string) => {
  const paragraph = new Y.XmlElement("paragraph");
  const run = new Y.XmlText();
  run.insert(0, text);
  paragraph.insert(0, [run]);
  ydoc.getXmlFragment("body").push([paragraph]);
};
export const texts = (ydoc: Y.Doc) =>
  (ydocToFields(ydoc).body.content as { content?: { text: string }[] }[]).map(
    (block) => block.content?.map((n) => n.text).join("") ?? "",
  );
export const validFields = (ydoc: Y.Doc) => {
  try {
    return ydocToFields(ydoc);
  } catch {
    return undefined;
  }
};

class OriginWebSocket extends WebSocket {
  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols, { headers: { Origin: ORIGIN } });
  }
}

/**
 * The real API listening on a port, the real collab service in the same process (talking to the
 * API over HTTP, and the API talking back through COLLAB_URL) and real Hocuspocus clients.
 */
export async function startHarness() {
  const previous = {
    secret: process.env.COLLAB_INTERNAL_SECRET,
    url: process.env.COLLAB_URL,
  };
  process.env.COLLAB_INTERNAL_SECRET = SECRET;
  const app: INestApplication = await createTestApp();
  await app.listen(0);
  const prisma = app.get(SystemPrismaService);
  const tokens = app.get(AuthTokens);
  const http = request(app.getHttpServer());
  const apiPort = (app.getHttpServer().address() as { port: number }).port;
  const server = createCollabServer(
    {
      port: 0,
      secret: SECRET,
      allowedOrigins: [ORIGIN],
      apiUrl: `http://127.0.0.1:${apiPort}/api/v1`,
      maxDocBytes: 10485760,
    },
    {
      debounceMs: 100,
      maxDebounceMs: 300,
      retryDelaysMs: [50, 50],
      log: () => {},
    },
  );
  await server.listen();
  const wsUrl = `ws://127.0.0.1:${server.address.port}`;
  process.env.COLLAB_URL = `http://127.0.0.1:${server.address.port}`;

  const providers: HocuspocusProvider[] = [];
  const sockets: HocuspocusProviderWebsocket[] = [];

  /** A client of `<kind>:<id>`; KNOW pages unless another kind is given. */
  const connect = (token: string, id: string, kind = "know.page") => {
    const ydoc = new Y.Doc();
    const events = {
      synced: false,
      failed: undefined as string | undefined,
      closes: [] as string[],
      stateless: [] as string[],
    };
    const socket = new HocuspocusProviderWebsocket({
      url: wsUrl,
      WebSocketPolyfill: OriginWebSocket as never,
    });
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: `${kind}:${id}`,
      document: ydoc,
      token,
      onSynced: () => (events.synced = true),
      onAuthenticationFailed: ({ reason }) => (events.failed = reason),
      // A closed document session reaches the client only as its reason.
      onClose: ({ event }) => events.closes.push(event.reason),
      onStateless: ({ payload }) => events.stateless.push(payload),
    });
    provider.attach();
    sockets.push(socket);
    providers.push(provider);
    return { ydoc, provider, socket, events };
  };
  type Client = ReturnType<typeof connect>;

  /** A fresh organization: ADMIN, an EDITOR and a VIEWER of a restricted space, and someone without an entry. */
  const world = async () => {
    const admin = await createActor(app, "it-admin", "ADMIN");
    const editor = await createActor(
      app,
      "it-editor",
      "COLLABORATOR",
      admin.orgId,
    );
    const viewer = await createActor(
      app,
      "it-viewer",
      "COLLABORATOR",
      admin.orgId,
    );
    const outsider = await createActor(
      app,
      "it-out",
      "COLLABORATOR",
      admin.orgId,
    );
    const space = await prisma.space.create({
      data: {
        name: "Integration",
        restricted: true,
        organizationId: admin.orgId,
        createdBy: admin.id,
      },
    });
    const entries: Record<string, string> = {};
    for (const [user, role] of [
      [editor, "EDITOR"],
      [viewer, "VIEWER"],
    ] as const)
      entries[user.id] = (
        await prisma.spaceAccess.create({
          data: {
            spaceId: space.id,
            userId: user.id,
            role,
            createdById: admin.id,
          },
        })
      ).id;
    const mkPage = (
      over: {
        title?: string;
        text?: string;
        status?: "PUBLISHED" | "DRAFT" | "ARCHIVED";
        spaceId?: string;
      } = {},
    ) =>
      prisma.page
        .create({
          data: {
            spaceId: over.spaceId ?? space.id,
            title: over.title ?? "Integration page",
            status: over.status ?? "PUBLISHED",
            icon: "file-text",
            authorId: admin.id,
            content: doc(over.text ?? "initial text"),
            searchText: over.text ?? "initial text",
            publishedAt: over.status === "DRAFT" ? null : new Date(),
          },
        })
        .then((p) => p.id);
    return { admin, editor, viewer, outsider, space, entries, mkPage };
  };

  return {
    app,
    prisma,
    tokens,
    http,
    connect,
    world,
    row: (pageId: string) =>
      prisma.page.findUniqueOrThrow({
        where: { id: pageId },
        omit: { ydoc: false },
      }),
    synced: (...clients: Client[]) =>
      until(() => clients.every((c) => c.events.synced), "the clients to sync"),
    /** Disconnects every client opened since the last call. */
    disconnectAll() {
      providers.splice(0).forEach((p) => p.destroy());
      sockets.splice(0).forEach((s) => s.destroy());
    },
    async stop() {
      for (const [key, value] of [
        ["COLLAB_INTERNAL_SECRET", previous.secret],
        ["COLLAB_URL", previous.url],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await server.destroy();
      await app.close();
    },
  };
}
export type Harness = Awaited<ReturnType<typeof startHarness>>;
export type Client = ReturnType<Harness["connect"]>;
