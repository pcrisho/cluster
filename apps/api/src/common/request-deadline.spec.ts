import { createServer, type Server } from "http";
import { connect, type Socket } from "net";
import type { AddressInfo } from "net";
import { requestDeadline } from "./request-deadline";

describe("requestDeadline", () => {
  let server: Server;
  let socket: Socket;
  const handled: string[] = [];

  const start = (
    ms: number,
    exempt: (url: string) => boolean,
    answerAtOnce = false,
  ) =>
    new Promise<number>((resolve) => {
      server = createServer((req, res) => {
        const deadline = requestDeadline(ms, (r) => exempt(r.url ?? ""));
        deadline(req as never, res as never, () => {
          handled.push(req.url ?? "");
          if (answerAtOnce) return res.writeHead(401).end();
          req.resume();
          req.on("end", () => res.end("ok"));
        });
      });
      server.listen(0, "127.0.0.1", () =>
        resolve((server.address() as AddressInfo).port),
      );
    });

  // Sends the head of a request announcing a 100-byte body and then goes quiet.
  const stall = (port: number, url: string) =>
    new Promise<{ status: string; closedAfterMs: number }>((resolve) => {
      const t0 = Date.now();
      let status = "";
      socket = connect(port, "127.0.0.1");
      socket.write(
        `PUT ${url} HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n{`,
      );
      socket.on("data", (d) => (status ||= d.toString().split("\r\n")[0]));
      const current = socket;
      // The exempt route is not cut: give up waiting and report that it was still open.
      const giveUp = setTimeout(() => current.destroy(), 1200);
      current.on("close", () => {
        clearTimeout(giveUp);
        resolve({ status, closedAfterMs: Date.now() - t0 });
      });
    });

  afterEach(async () => {
    socket?.destroy();
    await new Promise((r) => server.close(r));
    handled.length = 0;
  });

  it("answers 408 and closes when a body does not finish in time", async () => {
    const port = await start(300, () => false);
    const result = await stall(port, "/api/v1/auth/login");
    expect(result.status).toContain("408");
    expect(result.closedAfterMs).toBeLessThan(1000);
  });

  it("leaves exempt requests (the video upload) waiting for their body", async () => {
    const port = await start(300, (url) => url.endsWith("/video"));
    const result = await stall(port, "/api/v1/grow/steps/1/video");
    expect(result.status).toBe("");
    expect(result.closedAfterMs).toBeGreaterThanOrEqual(1100);
  });

  it("does not cut a request whose body arrived, however long the answer takes", async () => {
    const port = await start(200, () => false);
    const result = await new Promise<string>((resolve) => {
      socket = connect(port, "127.0.0.1");
      socket.write("GET /slow HTTP/1.1\r\nHost: x\r\n\r\n");
      let seen = "";
      socket.on("data", (d) => (seen += d.toString()));
      setTimeout(() => resolve(seen), 600);
    });
    expect(handled).toEqual(["/slow"]);
    expect(result).not.toContain("408");
  });

  // An answer sent while the body is unread must not leave the socket to a trickling client.
  it.each([
    ["a route under the deadline", "/api/v1/grow/steps/1", () => false],
    [
      "an exempt route (the video upload)",
      "/api/v1/grow/steps/1/video",
      () => true,
    ],
  ])(
    "closes the socket after answering %s without reading the body",
    async (_n, url, exempt) => {
      const port = await start(60_000, exempt, true);
      const result = await stall(port, url);
      expect(result.status).toContain("401");
      expect(result.closedAfterMs).toBeLessThan(1000);
    },
  );
});
