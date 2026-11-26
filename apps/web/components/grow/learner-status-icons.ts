import {
  CalendarClockIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ClockIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

import type { LearnerStatusKind } from "@/lib/learner-status"

/** One icon per learner state, shared by My learning, the overview and Reports. */
export const LEARNER_STATUS_ICON: Record<LearnerStatusKind, LucideIcon> = {
  NOT_STARTED: CircleDashedIcon,
  IN_PROGRESS: ClockIcon,
  DUE_SOON: CalendarClockIcon,
  OVERDUE: TriangleAlertIcon,
  COMPLETED: CircleCheckIcon,
}
