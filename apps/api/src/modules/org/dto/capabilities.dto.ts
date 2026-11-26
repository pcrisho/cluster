import { IsArray, IsEnum } from "class-validator"
import { Capability } from "@prisma/client"

export class SetCapabilitiesDto {
  @IsArray()
  @IsEnum(Capability, { each: true })
  capabilities!: Capability[]
}
