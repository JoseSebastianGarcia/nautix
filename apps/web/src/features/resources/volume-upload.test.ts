import { describe, expect, it } from "vitest";
import { checkUpload, formatSize, MAX_UPLOAD_BYTES } from "./volume-upload.js";

describe("checkUpload", () => {
  it("accepts ordinary files", () => {
    expect(checkUpload([{ name: "a.txt", size: 10 }])).toBeNull();
    expect(checkUpload([])).toBeNull();
  });

  it("refuses names a tar header cannot hold, counting bytes", () => {
    expect(checkUpload([{ name: "a".repeat(100), size: 1 }])).toBeNull();
    expect(checkUpload([{ name: "a".repeat(101), size: 1 }])).toBe("nameTooLong");
    expect(checkUpload([{ name: "ñ".repeat(60), size: 1 }])).toBe("nameTooLong");
  });

  it("refuses more than the server accepts, summed over the files", () => {
    const half = MAX_UPLOAD_BYTES / 2;
    expect(
      checkUpload([
        { name: "a", size: half },
        { name: "b", size: half },
      ]),
    ).toBeNull();
    expect(
      checkUpload([
        { name: "a", size: half },
        { name: "b", size: half + 1 },
      ]),
    ).toBe("tooLarge");
  });
});

describe("formatSize", () => {
  it("picks a readable unit", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
