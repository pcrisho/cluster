"use client"

import { useParams, useSearchParams } from "next/navigation"

import { CourseOverview } from "@/components/grow/learn/course-overview"

export default function CoursePage() {
  const { id } = useParams<{ id: string }>()
  const preview = useSearchParams().get("preview") === "1"
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <CourseOverview key={id} courseId={id} preview={preview} />
    </div>
  )
}
