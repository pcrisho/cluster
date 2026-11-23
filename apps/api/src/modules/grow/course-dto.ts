import type { Course, CourseSection, CourseStep } from "@prisma/client";
import type { LessonContent } from "./lesson-content";
import { embedUrl } from "./link-hosts";
import type { QuizContent } from "./quiz-content";

type SectionWithSteps = CourseSection & { steps: CourseStep[] };

/** Course settings everyone with access may read. */
export function courseSettings(course: Course) {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    icon: course.icon,
    iconType: course.iconType,
    emoji: course.emoji,
    status: course.status,
    restricted: course.restricted,
    sequential: course.sequential,
    issuesCertificate: course.issuesCertificate,
    publishedAt: course.publishedAt,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

/** The author's step: full content, answer keys and grader guidance included (and a link's embed URL for the preview). Never send it to a learner. */
export function stepForAuthor(step: CourseStep) {
  return {
    id: step.id,
    sectionId: step.sectionId,
    type: step.type,
    title: step.title,
    position: step.position,
    required: step.required,
    durationMinutes: step.durationMinutes,
    content:
      step.type === "LESSON"
        ? lessonForLearner(step.content as unknown as LessonContent)
        : step.content,
  };
}

/** What a learner may see of a step: a link with its embed URL, a quiz only as its rules (questions come with an attempt). */
export function stepForLearner(step: CourseStep) {
  return {
    ...stepForAuthor(step),
    content:
      step.type === "QUIZ"
        ? quizForLearner(step.content as unknown as QuizContent)
        : lessonForLearner(step.content as unknown as LessonContent),
  };
}

export function lessonForLearner(content: LessonContent) {
  return content.kind === "link"
    ? { ...content, embedUrl: embedUrl(content.url) }
    : content;
}

export function quizForLearner(quiz: QuizContent) {
  const total = quiz.questions.length;
  return {
    passScore: quiz.passScore,
    questionCount: Math.min(quiz.bankSize ?? total, total),
    showCorrectAnswers: quiz.showCorrectAnswers,
  };
}

/** The course editor's view: settings and the whole outline with author content. */
export function courseForAuthor(
  course: Course & { sections: SectionWithSteps[] },
) {
  return {
    ...courseSettings(course),
    sections: outlineForAuthor(course.sections),
  };
}

export function outlineForAuthor(sections: SectionWithSteps[]) {
  return [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      steps: [...s.steps]
        .sort((a, b) => a.position - b.position)
        .map(stepForAuthor),
    }));
}
