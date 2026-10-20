import { NEW_INSTRUCTIONS } from "@nautix/dockerfile";
import { describe, expect, it } from "vitest";
import en from "../../i18n/en.json";
import es from "../../i18n/es.json";

describe("block explanations", () => {
  it("every instruction the editor can create or show has a description and a tip in both languages", () => {
    const keywords = ["FROM", ...NEW_INSTRUCTIONS.map((n) => n.keyword)];
    for (const [name, lang] of [
      ["en", en],
      ["es", es],
    ] as const) {
      const { kw, tip } = lang.builds.blocks as {
        kw: Record<string, string>;
        tip: Record<string, string>;
      };
      for (const k of keywords) {
        expect(kw[k], `${name} description of ${k}`).toBeTruthy();
        expect(tip[k], `${name} tip of ${k}`).toBeTruthy();
      }
    }
  });
});
