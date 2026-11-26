"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import {
  growApi,
  type AuthorCourse,
  type AuthorSection,
  type AuthorStep,
  type CourseSettings,
  type StepType,
  type UpdateCoursePayload,
  type UpdateStepPayload,
} from "@/lib/grow-api"
import type { SavingState } from "@/lib/use-entity-autosave"

const SAVED_DISPLAY_MS = 4000

/** "Saving… / Saved / Failed to save" for one-off mutations (field blur, switches, outline changes). */
function useSaveTracker() {
  const [state, setState] = useState<SavingState>("idle")
  const inFlight = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const track = useCallback(async <T>(work: Promise<T>): Promise<T> => {
    inFlight.current += 1
    if (timer.current) clearTimeout(timer.current)
    setState("saving")
    try {
      const result = await work
      inFlight.current -= 1
      if (inFlight.current === 0) {
        setState("saved")
        timer.current = setTimeout(
          () => setState((s) => (s === "saved" ? "idle" : s)),
          SAVED_DISPLAY_MS
        )
      }
      return result
    } catch (err) {
      inFlight.current -= 1
      setState("failed")
      toast.error(getErrorMessage(err))
      throw err
    }
  }, [])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  return { state, track }
}

const withStep = (sections: AuthorSection[], step: AuthorStep) =>
  sections.map((s) =>
    s.id === step.sectionId
      ? { ...s, steps: s.steps.map((x) => (x.id === step.id ? step : x)) }
      : s
  )

/** The course being edited and every change to it; the outline and the step editor read from here. */
export function useCourseEditor(courseId: string) {
  const t = useTranslations("grow")
  const [course, setCourse] = useState<AuthorCourse | null>(null)
  const [error, setError] = useState<{
    notFound: boolean
    message: string
  } | null>(null)
  const { state: savingState, track } = useSaveTracker()

  const load = useCallback(async () => {
    try {
      setCourse(await growApi.getCourseForEdit(courseId))
      setError(null)
    } catch (err) {
      const notFound =
        err instanceof ApiError && (err.status === 404 || err.status === 403)
      setError({ notFound, message: getErrorMessage(err) })
    }
  }, [courseId])

  useEffect(() => {
    Promise.resolve().then(load)
  }, [load])

  const setSettings = useCallback(
    (settings: CourseSettings) => setCourse((c) => c && { ...c, ...settings }),
    []
  )
  const setSections = useCallback(
    (sections: AuthorSection[]) => setCourse((c) => c && { ...c, sections }),
    []
  )
  /** A step the server returned (after a field or content save). */
  const stepSaved = useCallback(
    (step: AuthorStep) =>
      setCourse((c) => c && { ...c, sections: withStep(c.sections, step) }),
    []
  )

  const updateCourse = useCallback(
    async (patch: UpdateCoursePayload) =>
      setSettings(await track(growApi.updateCourse(courseId, patch))),
    [courseId, setSettings, track]
  )

  const addSection = useCallback(async () => {
    const position = course?.sections.length ?? 0
    const section = await track(
      growApi.addSection(courseId, t("sectionNumber", { number: position + 1 }))
    )
    setCourse(
      (c) => c && { ...c, sections: [...c.sections, { ...section, steps: [] }] }
    )
    return section
  }, [course?.sections.length, courseId, t, track])

  const renameSection = useCallback(
    async (sectionId: string, title: string) => {
      await track(growApi.renameSection(sectionId, title))
      setCourse(
        (c) =>
          c && {
            ...c,
            sections: c.sections.map((s) =>
              s.id === sectionId ? { ...s, title } : s
            ),
          }
      )
    },
    [track]
  )

  const moveSection = useCallback(
    async (sectionId: string, position: number) =>
      setSections(
        (await track(growApi.moveSection(sectionId, position))).sections
      ),
    [setSections, track]
  )

  const deleteSection = useCallback(
    async (sectionId: string) => {
      await track(growApi.deleteSection(sectionId))
      await load()
    },
    [load, track]
  )

  const addStep = useCallback(
    async (sectionId: string, type: StepType = "LESSON") => {
      const step = await track(
        growApi.addStep(sectionId, {
          type,
          title: type === "QUIZ" ? t("untitledQuiz") : t("untitledLesson"),
        })
      )
      setCourse(
        (c) =>
          c && {
            ...c,
            sections: c.sections.map((s) =>
              s.id === sectionId ? { ...s, steps: [...s.steps, step] } : s
            ),
          }
      )
      return step
    },
    [t, track]
  )

  const updateStep = useCallback(
    async (stepId: string, patch: UpdateStepPayload) =>
      stepSaved(await track(growApi.updateStep(stepId, patch))),
    [stepSaved, track]
  )

  const moveStep = useCallback(
    async (stepId: string, sectionId: string, position: number) =>
      setSections(
        (await track(growApi.moveStep(stepId, sectionId, position))).sections
      ),
    [setSections, track]
  )

  const deleteStep = useCallback(
    async (stepId: string) => {
      await track(growApi.deleteStep(stepId))
      await load()
    },
    [load, track]
  )

  return {
    course,
    error,
    reload: load,
    savingState,
    setSettings,
    stepSaved,
    updateCourse,
    addSection,
    renameSection,
    moveSection,
    deleteSection,
    addStep,
    updateStep,
    moveStep,
    deleteStep,
  }
}

export type CourseEditorState = ReturnType<typeof useCourseEditor>
