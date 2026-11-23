"use client"

import { useParams } from "next/navigation"

import { CourseEditor } from "@/components/grow/author/course-editor"

export default function CourseEditorPage() {
  const { id } = useParams<{ id: string }>()
  return <CourseEditor key={id} courseId={id} />
}
