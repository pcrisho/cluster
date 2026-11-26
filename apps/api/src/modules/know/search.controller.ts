import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { SearchQueryDto } from "./dto/search-query.dto";
import { SearchService } from "./search.service";

/**
 * Registered before `PagesController` in `KnowModule`: the static `pages/search`
 * must win over `pages/:id`, otherwise `id="search"` is matched.
 */
@RequireModule(ModuleKey.KNOW)
@Controller("know")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Title-only lookup for the editor's `@mention` picker; `GET search` is the full-text search. */
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("pages/search")
  async forMentions(
    @Query("q") q: string,
    @Query("limit") limit: string | undefined,
    @Query("spaceId") spaceId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsedLimit = Math.max(1, Math.min(25, Number(limit) || 10));
    const data = await this.search.forMentions(
      user,
      q ?? "",
      spaceId,
      parsedLimit,
    );
    return { success: true, data };
  }

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("search")
  pages(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.search.pages(user, query.q, query.spaceId);
  }
}
