import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common"
import { Observable } from "rxjs"
import { runWithContext } from "./request-context"

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest()
    const user = request.user as {
      id?: string
      orgId?: string | null
    } | undefined

    if (user?.id) {
      return new Observable((subscriber) => {
        runWithContext(
          { userId: user.id!, organizationId: user.orgId ?? null },
          () => {
            next.handle().subscribe({
              next: (val) => subscriber.next(val),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            })
          },
        )
      })
    }

    return next.handle()
  }
}
