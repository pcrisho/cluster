import { Controller, Get } from "@nestjs/common";
import { LifeService } from "./life.service";

import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../../common/decorators";
@RequireModule(ModuleKey.LIFE)
@Controller("life")
export class LifeController {
  constructor(private readonly lifeService: LifeService) {}

  @Get()
  getStatus() {
    return { module: "life", status: "active" };
  }
}
