import { z } from "zod"

export const announcementSchema = z
  .object({
    isPinned: z.boolean(),
    pinnedExpiresAt: z
      .string()
      .min(1, "Expiry date is required for pinned announcements"),
  })
  .refine((data) => !data.isPinned || data.pinnedExpiresAt, {
    message: "Expiry date is required for pinned announcements",
    path: ["pinnedExpiresAt"],
  })
