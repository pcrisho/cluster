import { IsIn, IsInt, IsString } from "class-validator"

/** A credentials file for a node's subtree. `lifetime` is in hours, from the invitation presets. */
export class ExportAccessDto {
  @IsString()
  nodeId!: string

  @IsIn(["link", "password"])
  kind!: "link" | "password"

  @IsInt()
  lifetime!: number
}
