import { api } from "./api"

export type UpdateProfileData = {
  firstName?: string
  lastName?: string
  avatarUrl?: string | null
  locale?: "en" | "es" | null
}

export const settingsApi = {
  updateProfile: (data: UpdateProfileData) =>
    api.patch<{ user: unknown }>("/auth/me", data),
}
