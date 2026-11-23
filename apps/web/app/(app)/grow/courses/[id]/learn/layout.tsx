"use client"

import { useParams, useSearchParams } from "next/navigation"

import { CoursePlayer } from "@/components/grow/learn/player/course-player"

/** The player lives in the layout so moving between steps keeps the outline and course loaded (pages remount per step). */
export default function CoursePlayerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { id, stepId } = useParams<{ id: string; stepId: string }>()
  const preview = useSearchParams().get("preview") === "1"
  return (
    <>
      <CoursePlayer key={id} courseId={id} stepId={stepId} preview={preview} />
      {children}
    </>
  )
}
