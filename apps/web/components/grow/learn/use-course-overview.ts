"use client"

import { useCallback, useEffect, useState } from "react"

import { ApiError, getErrorMessage } from "@/lib/api"
import { growApi, type CourseOverview } from "@/lib/grow-api"

/** A course as the learner sees it; `notFound` covers both missing and not allowed (404). */
export function useCourseOverview(courseId: string, preview: boolean) {
  const [course, setCourse] = useState<CourseOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const reload = useCallback(async () => {
    try {
      setCourse(await growApi.getCourse(courseId, preview))
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError(getErrorMessage(err))
    }
  }, [courseId, preview])

  useEffect(() => {
    Promise.resolve().then(reload)
  }, [reload])

  return { course, setCourse, error, notFound, reload }
}
