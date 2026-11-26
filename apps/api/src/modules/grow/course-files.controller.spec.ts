import { isLessonVideoUpload } from "./course-files.controller";

describe("isLessonVideoUpload", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("is the video upload and nothing else", () => {
    expect(
      isLessonVideoUpload({
        method: "PUT",
        path: `/api/v1/grow/steps/${id}/video`,
      }),
    ).toBe(true);
    expect(
      isLessonVideoUpload({
        method: "POST",
        path: `/api/v1/grow/steps/${id}/video`,
      }),
    ).toBe(false);
    expect(
      isLessonVideoUpload({ method: "PUT", path: `/api/v1/grow/steps/${id}` }),
    ).toBe(false);
    expect(
      isLessonVideoUpload({ method: "PUT", path: `/api/v1/auth/login/video` }),
    ).toBe(false);
  });
});
