"use client"

import { useParams } from "next/navigation"

import { PageContainer } from "@/components/layout/page"
import { QuizReviews } from "@/components/grow/author/quiz-reviews"

export default function CourseReviewsPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <PageContainer>
      <QuizReviews key={id} courseId={id} />
    </PageContainer>
  )
}
