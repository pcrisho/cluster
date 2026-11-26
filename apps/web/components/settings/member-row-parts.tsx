"use client"

import {
  KeyRoundIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UserXIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import type { Member } from "@/lib/admin-api"
import type { UserRole } from "@/lib/api"
import { getImageUrl } from "@/lib/images"
import { ROLES } from "@/components/settings/invite-member-dialog"
import { useTranslations } from "next-intl"

export function MemberIdentity({ member }: { member: Member }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={getImageUrl(member.avatarUrl) || undefined} alt="" />
        <AvatarFallback className="text-xs">
          {`${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {member.firstName} {member.lastName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {member.email}
        </div>
      </div>
    </div>
  )
}

export function MemberStatus({ member }: { member: Member }) {
  const t = useTranslations("settings.members")
  const status = !member.isActive ? (
    <StatusBadge tone="neutral">{t("deactivated")}</StatusBadge>
  ) : member.invitationPending ? (
    <StatusBadge tone="info">{t("pending")}</StatusBadge>
  ) : (
    <StatusBadge tone="success">{t("active")}</StatusBadge>
  )
  if (!member.mfaEnabled) return status
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {status}
      <StatusBadge tone="neutral">
        <span aria-hidden>{t("mfaOn")}</span>
        <span className="sr-only">{t("mfaOnLabel")}</span>
      </StatusBadge>
    </span>
  )
}

export function MemberRole({
  member,
  disabled,
  onChange,
}: {
  member: Member
  disabled: boolean
  onChange: (role: UserRole) => void
}) {
  const t = useTranslations("settings.members")
  const tr = useTranslations("common.roles")
  return (
    <Select
      value={member.role}
      disabled={disabled}
      onValueChange={(role) => onChange(role as UserRole)}
    >
      <SelectTrigger size="sm" className="w-36" aria-label={t("role")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {tr(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MemberMenu({
  member,
  isSelf,
  busy,
  onEdit,
  onPermissions,
  onResend,
  onResetMfa,
  onDeactivate,
  onReactivate,
  onAccess,
  onPassword,
  mailEnabled,
}: {
  member: Member
  isSelf: boolean
  busy: boolean
  onEdit: () => void
  onPermissions: () => void
  onResend: () => void
  onResetMfa: () => void
  onDeactivate: () => void
  onReactivate: () => void
  onAccess: () => void
  onPassword: () => void
  mailEnabled: boolean
}) {
  const t = useTranslations("settings.members")
  const name = `${member.firstName} ${member.lastName}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          aria-label={t("actionsFor", { name })}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* The superadmin is out of a tenant ADMIN's reach (SUPERADMIN_PROTECTED). */}
        {(isSelf || !member.isSuperAdmin) && (
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon data-icon="inline-start" />
            {t("editDetails")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onPermissions}>
          <ShieldCheckIcon data-icon="inline-start" />
          {t("permissions")}
        </DropdownMenuItem>
        {!isSelf && !member.isSuperAdmin && member.isActive && (
          <DropdownMenuItem onSelect={onAccess}>
            <LinkIcon data-icon="inline-start" />
            {t("access.menu")}
          </DropdownMenuItem>
        )}
        {!isSelf && member.invitationPending && member.isActive && (
          <DropdownMenuItem onSelect={onPassword}>
            <LockIcon data-icon="inline-start" />
            {t("access.passwordMenu")}
          </DropdownMenuItem>
        )}
        {/* With mail off, the access link above takes its place. */}
        {mailEnabled && !isSelf && member.invitationPending && member.isActive && (
          <DropdownMenuItem onSelect={onResend}>
            <MailIcon data-icon="inline-start" />
            {t("resend")}
          </DropdownMenuItem>
        )}
        {!isSelf && !member.isSuperAdmin && member.mfaEnabled && (
          <DropdownMenuItem onSelect={onResetMfa}>
            <KeyRoundIcon data-icon="inline-start" />
            {t("resetMfaMenu")}
          </DropdownMenuItem>
        )}
        {!isSelf && !member.isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            {member.isActive ? (
              <DropdownMenuItem variant="destructive" onSelect={onDeactivate}>
                <UserXIcon data-icon="inline-start" />
                {t("deactivate")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={onReactivate}>
                <UserCheckIcon data-icon="inline-start" />
                {t("reactivate")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
