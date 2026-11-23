import type { NextFunction, Request, Response } from "express";

/**
 * Two guards on a request body that has not fully arrived.
 * 1. `ms` after the request started it is cut (408), except the ones `exempt` names. Node's
 *    `requestTimeout` is one number for the whole server and the lesson video upload needs it at
 *    an hour; this keeps every other route at the few minutes it was before.
 * 2. For every request, exempt or not: once the answer is out and the body is still unread (a 401
 *    before a 1 GB upload, a 404, a rejected size), the connection is closed. Otherwise Node leaves
 *    the socket to the client, which can trickle the body for as long as the timeout allows. A real
 *    upload reads its body before answering, so it is not touched.
 */
export function requestDeadline(ms: number, exempt: (req: Request) => boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.once("finish", () => {
      if (!req.complete) req.socket.destroySoon();
    });
    if (exempt(req)) return next();
    const timer = setTimeout(() => {
      if (req.complete) return;
      if (!res.headersSent) res.writeHead(408, { Connection: "close" });
      res.end();
      req.socket.destroySoon();
    }, ms);
    timer.unref();
    res.once("close", () => clearTimeout(timer));
    next();
  };
}
