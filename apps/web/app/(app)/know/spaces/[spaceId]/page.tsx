"use client"

import { SpaceHome } from "@/components/know/space/space-home"
import { useSpace } from "@/components/know/space/space-context"

export default function SpacePage() {
  const { space } = useSpace()
  // The shell shows the not-found state, so a missing space never reaches here.
  return space ? <SpaceHome space={space} /> : null
}
