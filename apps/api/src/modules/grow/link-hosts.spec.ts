import { embedUrl } from "./link-hosts";

describe("embedUrl", () => {
  it.each([
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ],
    [
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ],
    [
      "https://m.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ],
    [
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ],
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
    [
      "https://vimeo.com/76979871/a1b2c3d4e5",
      "https://player.vimeo.com/video/76979871?h=a1b2c3d4e5",
    ],
    [
      "https://player.vimeo.com/video/76979871",
      "https://player.vimeo.com/video/76979871",
    ],
    [
      "https://drive.google.com/file/d/1AbC-dEf_123/view?usp=sharing",
      "https://drive.google.com/file/d/1AbC-dEf_123/preview",
    ],
    [
      "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
      "https://www.loom.com/embed/0123456789abcdef0123456789abcdef",
    ],
    [
      "https://contoso.sharepoint.com/:v:/s/team/EabcDEF?e=1",
      "https://contoso.sharepoint.com/:v:/s/team/EabcDEF?e=1",
    ],
    [
      "https://contoso-my.sharepoint.com/personal/x/_layouts/15/stream.aspx?id=1",
      "https://contoso-my.sharepoint.com/personal/x/_layouts/15/stream.aspx?id=1",
    ],
    [
      "https://onedrive.live.com/embed?resid=ABC",
      "https://onedrive.live.com/embed?resid=ABC",
    ],
    ["https://1drv.ms/v/s!AbCdEf", "https://1drv.ms/v/s!AbCdEf"],
  ])("accepts %s", (url, embed) => {
    expect(embedUrl(url)).toBe(embed);
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ", // not https
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://sharepoint.com.evil.com/video",
    "https://evil-sharepoint.com/video",
    "https://drive.google.com/drive/folders/abc", // not a file
    "https://www.youtube.com/watch?v=short",
    "https://vimeo.com/channels/staffpicks",
    "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "data:text/html,hi",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(embedUrl(url)).toBeNull();
  });
});
