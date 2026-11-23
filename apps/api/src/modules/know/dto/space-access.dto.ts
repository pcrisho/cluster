import { IsEnum, IsUUID } from "class-validator"
import { AccessRole } from "@prisma/client"
import { PrincipalType } from "../../org/principal"

export class AddAccessDto {
  @IsEnum(PrincipalType)
  principalType!: PrincipalType

  @IsUUID()
  principalId!: string

  @IsEnum(AccessRole)
  role!: AccessRole
}

export class UpdateAccessDto {
  @IsEnum(AccessRole)
  role!: AccessRole
}
