import { IsIn, IsInt, IsString } from "class-validator"

/** An access link or an initial password an ADMIN issues for one member. `lifetime` is in hours. */
export class IssueAccessDto {
  @IsIn(["link", "password"])
  kind!: "link" | "password"

  @IsInt()
  lifetime!: number
}

/** The node whose subtree is queued for invitations. */
export class QueueInvitationsDto {
  @IsString()
  nodeId!: string
}
