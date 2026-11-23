import { ArgumentsHost, Catch, HttpException } from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import type { Response } from "express"

/** Codes for errors thrown without one: the web shows the translated message of the status. */
const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE",
  429: "TOO_MANY_REQUESTS",
  503: "UNAVAILABLE",
}

export type ErrorBody = {
  statusCode: number
  /** Stable: the web picks its translated message by it. */
  code: string
  /** English, for logs and API clients; never shown in another language. */
  message: string | string[]
  /** Values the translated message needs (a step title, a limit). */
  params?: Record<string, string | number>
  [key: string]: unknown
}

/** The body of every HTTP error: what the exception carried, plus a `code`. */
export function errorBody(status: number, response: string | object): ErrorBody {
  const fallback = STATUS_CODES[status] ?? (status >= 500 ? "INTERNAL" : "ERROR")
  if (typeof response === "string") return { statusCode: status, code: fallback, message: response }
  const body = response as Partial<ErrorBody>
  const code =
    typeof body.code === "string"
      ? body.code
      : status === 400 && Array.isArray(body.message)
        ? "VALIDATION_FAILED" // ValidationPipe: one message per invalid field
        : fallback
  return { ...body, statusCode: status, code, message: body.message ?? fallback }
}

/** Adds a stable `code` to every HTTP error (common/http-exception.filter.ts); anything else keeps Nest's handling. */
@Catch(HttpException)
export class HttpExceptionFilter extends BaseExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    if (host.getType() !== "http") return super.catch(exception, host)
    const status = exception.getStatus()
    host.switchToHttp().getResponse<Response>().status(status).json(errorBody(status, exception.getResponse()))
  }
}
