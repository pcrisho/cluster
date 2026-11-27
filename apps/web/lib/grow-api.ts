import { api, getFreshAccessToken, type AuthUser } from "./api"
import type { LearnerState } from "./learner-status"
import type { Principal, PrincipalType } from "./org-api"

/** GROW (LMS) API client. Shapes mirror `apps/api/src/modules/grow/course-dto.ts`. */

export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"
export type StepType = "LESSON" | "QUIZ"
export type IconType = "LUCIDE" | "EMOJI"

export interface CourseSettings {
  id: string
  title: string
  description: string | null
  icon: string
  iconType: IconType
  emoji: string | null
  status: CourseStatus
  restricted: boolean
  sequential: boolean
  issuesCertificate: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ManagedCourse extends CourseSettings {
  sectionCount: number
  stepCount: number
  learnerCount: number
  completedCount: number
  /** Quiz attempts with written answers waiting for a grade. */
  pendingReviews: number
  createdBy: { id: string; firstName: string; lastName: string } | null
}

export type ManagedCourseSort = "title" | "updatedAt"

export interface ManagedCoursesPage {
  items: ManagedCourse[]
  total: number
  page: number
  pageSize: number
}

export type LessonContent =
  | { kind: "text"; doc: unknown }
  /** `embedUrl` comes from the API (null if the link stopped being allowed). */
  | { kind: "link"; url: string; embedUrl?: string | null }
  | { kind: "files"; files: LessonFile[] }
  /** An uploaded MP4/WebM, played from `/files` with byte ranges. */
  | { kind: "video"; video: LessonFile }

export interface LessonFile {
  key: string
  name: string
  size: number
}

/** Who a course is assigned to; `reachedCount` is how many active people that means today. */
export interface Assignment {
  id: string
  principal: Principal
  /** The person, area or position was deactivated or archived after the assignment. */
  archived: boolean
  mandatory: boolean
  /** Calendar date, YYYY-MM-DD. */
  dueAt: string | null
  dueInDays: number | null
  reachedCount: number
  createdAt: string
}

export type AssignmentRules = Partial<
  Pick<Assignment, "mandatory" | "dueAt" | "dueInDays">
>

export interface AuthorStep {
  id: string
  sectionId: string
  type: StepType
  title: string
  position: number
  required: boolean
  durationMinutes: number | null
  content: unknown
}

export interface AuthorSection {
  id: string
  title: string
  position: number
  steps: AuthorStep[]
}

export interface AuthorCourse extends CourseSettings {
  sections: AuthorSection[]
}

/** One reason a course cannot be published, pointing at the step to fix when there is one. */
export type PublishProblem =
  | { code: "NO_STEPS" }
  | {
      code: "QUIZ_NEEDS_QUESTION" | "QUIZ_PASS_SCORE_INVALID"
      sectionId: string
      stepId: string
      title: string
    }
  | {
      code: "QUIZ_BANK_TOO_LARGE"
      sectionId: string
      stepId: string
      title: string
      bankSize: number
      questionCount: number
    }

export type UpdateCoursePayload = Partial<
  Pick<
    CourseSettings,
    | "title"
    | "description"
    | "icon"
    | "iconType"
    | "emoji"
    | "restricted"
    | "sequential"
    | "issuesCertificate"
  >
>

export type UpdateStepPayload = Partial<
  Pick<AuthorStep, "title" | "required" | "durationMinutes" | "content">
>

/** A course in a learner's lists, with what it means for them. */
export interface LearnerCourse {
  id: string
  title: string
  description: string | null
  icon: string
  iconType: IconType
  emoji: string | null
  restricted: boolean
  sectionCount: number
  stepCount: number
  durationMinutes: number
  mandatory: boolean
  /** Calendar date, YYYY-MM-DD. */
  dueAt: string | null
  /** Became required in the last 7 days and not started. */
  isNew: boolean
  state: LearnerState
  /** Required steps done out of required steps. */
  progress: { done: number; total: number }
  completedAt: string | null
}

export interface MyLearning {
  required: LearnerCourse[]
  inProgress: LearnerCourse[]
  recommended: LearnerCourse[]
}

export type CatalogFilter = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"

export interface QuizRules {
  passScore: number
  questionCount: number
  showCorrectAnswers: boolean
}

/** A quiz step in the outline: its rules and my record on it. */
export interface QuizRecord extends QuizRules {
  /** Best score (percent) of my graded attempts. */
  best: number | null
  /** Attempts submitted. */
  attempts: number
  pendingReview: boolean
  inProgress: boolean
  /** The newest submitted attempt, to show its result again. */
  lastAttemptId: string | null
}

/** A quiz as its author edits it (mirrors `apps/api/src/modules/grow/quiz-content.ts`). */
export type QuizQuestion =
  | {
      id: string
      type: "single" | "multiple"
      prompt: string
      points: number
      options: { id: string; text: string }[]
      correct: string[]
    }
  | {
      id: string
      type: "open"
      prompt: string
      points: number
      guidance?: string
    }

export interface QuizContent {
  passScore: number
  bankSize: number | null
  shuffle: boolean
  showCorrectAnswers: boolean
  questions: QuizQuestion[]
}

/** Option ids for a choice question, text for a written one. */
export type QuizAnswers = Record<string, string[] | string>

export type AttemptStatus = "IN_PROGRESS" | "PENDING_REVIEW" | "GRADED"

export interface QuestionResult {
  /** Null while a reviewer has not graded a written answer. */
  correct: boolean | null
  earned: number | null
}

/** An attempt as its learner sees it: no answer key unless they passed and the quiz shows answers. */
export interface Attempt {
  id: string
  stepId: string
  status: AttemptStatus
  passScore: number
  score: number | null
  passed: boolean | null
  startedAt: string
  submittedAt: string | null
  questions: {
    id: string
    type: "single" | "multiple" | "open"
    prompt: string
    points: number
    options?: { id: string; text: string }[]
    answer: string[] | string | null
    result: QuestionResult | null
    correctOptions: string[] | null
  }[]
}

/** An attempt waiting for review, for a course manager. */
export interface ReviewAttempt {
  id: string
  stepId: string
  stepTitle: string
  status: AttemptStatus
  passScore: number
  score: number | null
  passed: boolean | null
  submittedAt: string
  learner: { id: string; firstName: string; lastName: string }
  questions: (QuizQuestion & {
    answer: string[] | string | null
    result: QuestionResult | null
  })[]
}

export interface OutlineStep {
  id: string
  type: StepType
  title: string
  required: boolean
  durationMinutes: number | null
  quiz: QuizRecord | null
  completed: boolean
  /** Sequential course with an earlier required step not done. */
  locked: boolean
}

export interface CourseOverview extends CourseSettings {
  canManage: boolean
  preview: boolean
  mandatory: boolean
  dueAt: string | null
  isNew: boolean
  enrollment: {
    status: "IN_PROGRESS" | "COMPLETED"
    startedAt: string
    completedAt: string | null
  } | null
  state: LearnerState
  progress: { done: number; total: number }
  nextStepId: string | null
  /** The certificate of a completed course that issues them. */
  certificate: Certificate | null
  sections: { id: string; title: string; steps: OutlineStep[] }[]
}

/** A step as a learner reads it: lesson content, or a quiz's rules (its questions come with an attempt). */
export interface LearnerStep {
  step: {
    id: string
    sectionId: string
    type: StepType
    title: string
    required: boolean
    durationMinutes: number | null
    content: LessonContent | QuizRules
  }
  completed: boolean
}

export interface CompleteResult {
  completed: true
  enrollment: {
    status: "IN_PROGRESS" | "COMPLETED"
    completedAt: string | null
  }
  progress: { done: number; total: number }
}

/** A certificate as issued: the names as they were then. `code` is shown as ABCD-EFGH-JKMN. */
export interface Certificate {
  id: string
  code: string
  courseId: string
  courseTitle: string
  recipientName: string
  organizationName: string
  /** Calendar date of issue ("YYYY-MM-DD") in the organization's zone. */
  issuedOn: string
}

/** What the public verification page shows. */
export type VerifiedCertificate = Pick<
  Certificate,
  "code" | "recipientName" | "courseTitle" | "organizationName" | "issuedOn"
>

export type ReportState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OVERDUE"

export type ReportSort = "status" | "due"

export interface ReportFilters {
  /** Each filter takes several values: OR within a filter, AND between filters. */
  courseId?: string[]
  orgNodeId?: string[]
  positionId?: string[]
  status?: ReportState[]
  scope?: "assigned" | "all"
  sort?: ReportSort
  order?: "asc" | "desc"
  q?: string
  page?: number
  pageSize?: number
}

export interface ReportRow {
  userId: string
  name: string
  email: string
  area: { id: string; name: string } | null
  position: { id: string; name: string } | null
  courseId: string
  courseTitle: string
  courseStatus: CourseStatus
  mandatory: boolean
  state: ReportState
  progress: { done: number; total: number }
  dueAt: string | null
  completedAt: string | null
  bestScore: number | null
  attempts: number
  certificateCode: string | null
}

export interface ComplianceReport {
  rows: ReportRow[]
  total: number
  page: number
  pageSize: number
  summary: Record<ReportState, number>
  filters: {
    courses: { id: string; name: string; archived: boolean }[]
    areas: { id: string; name: string; main: boolean }[]
    positions: { id: string; name: string }[]
  }
}

/** Figures over the report's rows (same scope and filters); `GET /grow/reports/compliance/dashboard`. */
export interface ComplianceDashboard {
  total: number
  summary: Record<ReportState, number>
  completionRate: number | null
  dueSoon: number
  averageScore: number | null
  courses: ({ id: string; title: string; total: number } & Record<
    ReportState,
    number
  >)[]
  courseCount: number
  areas: {
    id: string | null
    name: string
    total: number
    completed: number
    rate: number
  }[]
  areaCount: number
  weekly: { week: string; completed: number }[]
  attention: {
    userId: string
    name: string
    courseId: string
    courseTitle: string
    dueAt: string | null
  }[]
  filters: ComplianceReport["filters"]
}

export interface MainNodeCompliance {
  mainNodeId: string
  total: number
  completed: number
  overdue: number
  inProgress: number
  notStarted: number
  rate: number | null
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"

/** A plain link works: the PDF route accepts the read-only file cookie. */
export const certificatePdfUrl = (id: string) =>
  `${API_BASE}/grow/certificates/${id}/pdf`

/** Public, no session: null when the code is unknown. */
export async function verifyCertificate(
  code: string
): Promise<VerifiedCertificate | null> {
  const res = await fetch(`${API_BASE}/grow/verify/${encodeURIComponent(code)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error("We couldn’t check this code right now.")
  return res.json()
}

/** ADMIN or a holder of GROW_COURSE_MANAGE: authors, assigns and archives any course. */
export function isCourseManager(user: AuthUser | null): boolean {
  return (
    !!user &&
    (user.role === "ADMIN" || user.capabilities.includes("GROW_COURSE_MANAGE"))
  )
}

export function canViewReports(user: AuthUser | null): boolean {
  return (
    !!user &&
    (user.role === "ADMIN" ||
      user.role === "MANAGER" ||
      user.capabilities.includes("GROW_COURSE_MANAGE") ||
      user.managesArea)
  )
}

export function reportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams()
  if (filters.courseId?.length)
    params.set("courseId", filters.courseId.join(","))
  if (filters.orgNodeId?.length)
    params.set("orgNodeId", filters.orgNodeId.join(","))
  if (filters.positionId?.length)
    params.set("positionId", filters.positionId.join(","))
  if (filters.status?.length) params.set("status", filters.status.join(","))
  if (filters.scope === "all") params.set("scope", "all")
  if (filters.sort === "due") params.set("sort", "due")
  if (filters.order === "desc") params.set("order", "desc")
  if (filters.q?.trim()) params.set("q", filters.q.trim())
  if (filters.page && filters.page > 1) params.set("page", String(filters.page))
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize))
  return params.toString()
}

export interface PendingCourses {
  pending: number
  overdue: number
  /** At most five, most urgent first. */
  courses: {
    id: string
    title: string
    icon: string | null
    iconType: IconType
    emoji: string | null
    state: LearnerState
    dueAt: string | null
  }[]
}

const previewQuery = (preview: boolean) => (preview ? "?preview=1" : "")

export const growApi = {
  // Learning
  getLearning: () => api.get<MyLearning>("/grow/learning"),
  /** Mandatory courses not completed yet (the sidebar badge), how many are overdue, and the most urgent as shortcuts. */
  getPendingCount: () => api.get<PendingCourses>("/grow/learning/pending"),

  getCatalog: (
    filters: {
      q?: string
      status?: CatalogFilter
      cursor?: string
      limit?: number
    } = {}
  ) => {
    const params = new URLSearchParams()
    if (filters.q?.trim()) params.set("q", filters.q.trim())
    if (filters.status) params.set("status", filters.status)
    if (filters.cursor) params.set("cursor", filters.cursor)
    if (filters.limit) params.set("limit", String(filters.limit))
    const query = params.toString()
    return api.get<{ items: LearnerCourse[]; nextCursor: string | null }>(
      `/grow/catalog${query ? `?${query}` : ""}`
    )
  },

  getCourse: (id: string, preview = false) =>
    api.get<CourseOverview>(`/grow/courses/${id}${previewQuery(preview)}`),

  enroll: (id: string) => api.post<unknown>(`/grow/courses/${id}/enroll`, {}),

  getStep: (courseId: string, stepId: string, preview = false) =>
    api.get<LearnerStep>(
      `/grow/courses/${courseId}/steps/${stepId}${previewQuery(preview)}`
    ),

  completeStep: (courseId: string, stepId: string) =>
    api.post<CompleteResult>(
      `/grow/courses/${courseId}/steps/${stepId}/complete`,
      {}
    ),

  listCertificates: () => api.get<Certificate[]>("/grow/certificates"),

  getComplianceReport: (filters: ReportFilters = {}) => {
    const query = reportQuery(filters)
    return api.get<ComplianceReport>(
      `/grow/reports/compliance${query ? `?${query}` : ""}`
    )
  },

  getComplianceDashboard: (
    filters: Pick<ReportFilters, "courseId" | "orgNodeId" | "scope"> = {}
  ) => {
    const query = reportQuery(filters)
    return api.get<ComplianceDashboard>(
      `/grow/reports/compliance/dashboard${query ? `?${query}` : ""}`
    )
  },
  getComplianceByMainNode: () =>
    api.get<{ items: MainNodeCompliance[] }>(
      "/grow/reports/compliance/by-main-node"
    ),
  exportComplianceReport: async (filters: ReportFilters = {}) => {
    const token = await getFreshAccessToken()
    const query = reportQuery({
      ...filters,
      page: undefined,
      pageSize: undefined,
    })
    const response = await fetch(
      `${API_BASE}/grow/reports/compliance/export${query ? `?${query}` : ""}`,
      {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    )
    if (!response.ok) throw new Error("We couldn’t export this report.")
    return response.blob()
  },

  // Quizzes
  startAttempt: (courseId: string, stepId: string) =>
    api.post<Attempt>(`/grow/courses/${courseId}/steps/${stepId}/attempts`, {}),

  getAttempt: (id: string) => api.get<Attempt>(`/grow/attempts/${id}`),

  submitAttempt: (id: string, answers: QuizAnswers) =>
    api.post<Attempt>(`/grow/attempts/${id}/submit`, { answers }),

  listReviews: (courseId: string) =>
    api.get<ReviewAttempt[]>(`/grow/courses/${courseId}/reviews`),

  gradeAttempt: (id: string, scores: Record<string, number>) =>
    api.patch<ReviewAttempt>(`/grow/attempts/${id}/grade`, { scores }),

  // Courses (course managers)
  listManaged: (
    filters: {
      status?: CourseStatus
      q?: string
      page?: number
      pageSize?: number
      sort?: ManagedCourseSort
      order?: "asc" | "desc"
    } = {}
  ) => {
    const params = new URLSearchParams()
    if (filters.status) params.set("status", filters.status)
    if (filters.q?.trim()) params.set("q", filters.q.trim())
    for (const key of ["page", "pageSize", "sort", "order"] as const) {
      if (filters[key] !== undefined) params.set(key, String(filters[key]))
    }
    const query = params.toString()
    return api.get<ManagedCoursesPage>(
      `/grow/manage/courses${query ? `?${query}` : ""}`
    )
  },

  createCourse: (data: {
    title: string
    description?: string
    iconType: IconType
    icon?: string
    emoji?: string
  }) => api.post<CourseSettings>("/grow/courses", data),

  getCourseForEdit: (id: string) =>
    api.get<AuthorCourse>(`/grow/courses/${id}/edit`),

  updateCourse: (id: string, data: UpdateCoursePayload) =>
    api.patch<CourseSettings>(`/grow/courses/${id}`, data),

  deleteCourse: (id: string) => api.del<void>(`/grow/courses/${id}`),

  publishCourse: (id: string) =>
    api.post<CourseSettings>(`/grow/courses/${id}/publish`, {}),

  archiveCourse: (id: string) =>
    api.post<CourseSettings>(`/grow/courses/${id}/archive`, {}),

  restoreCourse: (id: string) =>
    api.post<CourseSettings>(`/grow/courses/${id}/restore`, {}),

  // Outline
  addSection: (courseId: string, title: string) =>
    api.post<AuthorSection>(`/grow/courses/${courseId}/sections`, { title }),

  renameSection: (id: string, title: string) =>
    api.patch<AuthorSection>(`/grow/sections/${id}`, { title }),

  moveSection: (id: string, position: number) =>
    api.patch<{ sections: AuthorSection[] }>(`/grow/sections/${id}/move`, {
      position,
    }),

  deleteSection: (id: string) => api.del<void>(`/grow/sections/${id}`),

  addStep: (sectionId: string, data: { type: StepType; title: string }) =>
    api.post<AuthorStep>(`/grow/sections/${sectionId}/steps`, data),

  updateStep: (id: string, data: UpdateStepPayload) =>
    api.patch<AuthorStep>(`/grow/steps/${id}`, data),

  moveStep: (id: string, sectionId: string, position: number) =>
    api.patch<{ sections: AuthorSection[] }>(`/grow/steps/${id}/move`, {
      sectionId,
      position,
    }),

  deleteStep: (id: string) => api.del<void>(`/grow/steps/${id}`),

  // Lesson files (documents up to 50 MB)
  /** Uploads the lesson's video (replacing any previous one) and returns the saved step. */
  uploadLessonVideo: (
    stepId: string,
    file: File,
    options: { onProgress?: (fraction: number) => void; signal?: AbortSignal }
  ) =>
    api.uploadFile<AuthorStep>(
      `/grow/steps/${stepId}/video?name=${encodeURIComponent(file.name)}`,
      file,
      options
    ),

  uploadCourseFile: (courseId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.upload<LessonFile>(`/grow/courses/${courseId}/files`, form)
  },

  // Assignments
  listAssignments: (courseId: string) =>
    api.get<Assignment[]>(`/grow/courses/${courseId}/assignments`),

  addAssignment: (
    courseId: string,
    data: AssignmentRules & {
      principalType: PrincipalType
      principalId: string
    }
  ) => api.post<Assignment>(`/grow/courses/${courseId}/assignments`, data),

  updateAssignment: (id: string, data: AssignmentRules) =>
    api.patch<Assignment>(`/grow/assignments/${id}`, data),

  removeAssignment: (id: string) => api.del<void>(`/grow/assignments/${id}`),
}
