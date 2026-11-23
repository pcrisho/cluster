import { CourseStatus } from "@prisma/client";
import {
  courseAccess,
  decide,
  isCourseManager,
  visibleCourseWhere,
} from "./course-access";

describe("isCourseManager", () => {
  it("is ADMIN or a holder of GROW_COURSE_MANAGE", () => {
    expect(isCourseManager({ role: "ADMIN", capabilities: [] })).toBe(true);
    expect(
      isCourseManager({
        role: "COLLABORATOR",
        capabilities: ["GROW_COURSE_MANAGE"],
      }),
    ).toBe(true);
    expect(
      isCourseManager({ role: "MANAGER", capabilities: ["KNOW_SPACE_CREATE"] }),
    ).toBe(false);
  });
});

describe("courseAccess and decide", () => {
  const cases: [
    string,
    Parameters<typeof courseAccess>[0],
    "LEARN" | "MANAGE",
    string,
  ][] = [
    [
      "learner, open published",
      {
        manager: false,
        status: "PUBLISHED",
        restricted: false,
        assigned: false,
      },
      "LEARN",
      "OK",
    ],
    [
      "learner, open published, manage",
      {
        manager: false,
        status: "PUBLISHED",
        restricted: false,
        assigned: false,
      },
      "MANAGE",
      "FORBIDDEN",
    ],
    [
      "learner, restricted not assigned",
      {
        manager: false,
        status: "PUBLISHED",
        restricted: true,
        assigned: false,
      },
      "LEARN",
      "NOT_FOUND",
    ],
    [
      "learner, restricted not assigned, manage",
      {
        manager: false,
        status: "PUBLISHED",
        restricted: true,
        assigned: false,
      },
      "MANAGE",
      "NOT_FOUND",
    ],
    [
      "learner, restricted assigned",
      { manager: false, status: "PUBLISHED", restricted: true, assigned: true },
      "LEARN",
      "OK",
    ],
    [
      "learner, draft",
      { manager: false, status: "DRAFT", restricted: false, assigned: true },
      "LEARN",
      "NOT_FOUND",
    ],
    [
      "learner, draft, manage",
      { manager: false, status: "DRAFT", restricted: false, assigned: true },
      "MANAGE",
      "NOT_FOUND",
    ],
    [
      "learner, archived",
      { manager: false, status: "ARCHIVED", restricted: false, assigned: true },
      "LEARN",
      "NOT_FOUND",
    ],
    [
      "manager, draft",
      { manager: true, status: "DRAFT", restricted: true, assigned: false },
      "MANAGE",
      "OK",
    ],
    [
      "manager, archived",
      { manager: true, status: "ARCHIVED", restricted: false, assigned: false },
      "MANAGE",
      "OK",
    ],
    [
      "manager, draft, learn",
      { manager: true, status: "DRAFT", restricted: false, assigned: false },
      "LEARN",
      "NOT_FOUND",
    ],
    [
      "manager, restricted published, learn",
      { manager: true, status: "PUBLISHED", restricted: true, assigned: false },
      "LEARN",
      "NOT_FOUND",
    ],
  ];
  it.each(cases)("%s → %s %s", (_name, input, need, expected) => {
    expect(decide(courseAccess(input), need)).toBe(expected);
  });
});

describe("visibleCourseWhere", () => {
  const ctx = { userId: "u1", orgNodeIds: ["a2", "a1"], positionId: "p1" };

  it("gives managers every course of the organization", () => {
    expect(visibleCourseWhere("o1", true, ctx)).toEqual({
      organizationId: "o1",
    });
  });

  it("gives learners published courses that are open or assigned to them", () => {
    expect(visibleCourseWhere("o1", false, ctx)).toEqual({
      organizationId: "o1",
      status: CourseStatus.PUBLISHED,
      OR: [
        { restricted: false },
        {
          assignments: {
            some: {
              OR: [
                { userId: "u1" },
                { orgNodeId: { in: ["a2", "a1"] } },
                { positionId: "p1" },
              ],
            },
          },
        },
      ],
    });
  });
});
