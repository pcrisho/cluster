import {
  ContactRoundIcon,
  NewspaperIcon,
  FileStackIcon,
  GraduationCapIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react"
import type { AuthUser, ModuleKey } from "./api"
import { MODULE_ORDER } from "./modules"
import type { Messages } from "./i18n/messages"

export interface NavRoute {
  /** Key in `shell.nav`. */
  label: keyof Messages["shell"]["nav"]
  href: string
  icon: LucideIcon
}

export interface NavSubgroup {
  title?: string
  items: NavRoute[]
  collapsible?: boolean
}

export interface NavGroup {
  /** A module's name (CONNECT, KNOW…): product names, not translated. */
  title: string
  /** Hidden when this module is not enabled for the user's organization. */
  module?: ModuleKey
  /** Skips the group heading when its single item already says what it is. */
  hideTitle?: boolean
  /** Sits at the bottom of the sidebar, above the user's card. */
  pinned?: boolean
  subgroups: NavSubgroup[]
}

const navGroups: NavGroup[] = [
  {
    title: "CONNECT",
    module: "CONNECT",
    subgroups: [
      {
        items: [
          { label: "feed", href: "/connect/feed", icon: NewspaperIcon },
          {
            label: "directory",
            href: "/connect/directory",
            icon: ContactRoundIcon,
          },
        ],
      },
    ],
  },
  {
    title: "KNOW",
    module: "KNOW",
    subgroups: [
      { items: [{ label: "spaces", href: "/know", icon: FileStackIcon }] },
    ],
  },
  {
    title: "GROW",
    module: "GROW",
    subgroups: [
      { items: [{ label: "courses", href: "/grow", icon: GraduationCapIcon }] },
    ],
  },
  {
    title: "Settings",
    hideTitle: true,
    pinned: true,
    subgroups: [
      {
        items: [{ label: "settings", href: "/settings", icon: SettingsIcon }],
      },
    ],
  },
]

/** Module groups follow MODULE_ORDER; groups without a module (Settings) stay last. */
const groupRank = (group: NavGroup) =>
  group.module ? MODULE_ORDER.indexOf(group.module) : MODULE_ORDER.length

/** Navigation filtered by the user's enabled modules and permissions. */
export function visibleNavGroups(user: AuthUser | null): NavGroup[] {
  if (!user) return []

  return navGroups
    .filter((group) => !group.module || user.modules.includes(group.module))
    .sort((a, b) => groupRank(a) - groupRank(b))
}

/** The user's own profile: the member page when CONNECT is on, My account otherwise. */
export function profileHref(user: AuthUser): string {
  return user.modules.includes("CONNECT")
    ? `/connect/directory/${user.id}`
    : "/settings/account"
}
