import { describe, expect, it } from "vitest";
import { reviewResponseSchema, selectionResponseMatchesIds, selectionTransformResponseSchema } from "./schemas";

describe("Gemini review schema", () => {
  it("accepts a bounded structured finding", () => {
    const result = reviewResponseSchema.parse({ findings: [{
      category: "collocation", original: "make a party", suggestion: "throw a party",
      explanationVi: "Đây là collocation tự nhiên hơn.", exampleEn: "They threw a party last night.",
      register: "neutral", confidence: 0.96, from: 3, to: 15,
    }] });
    expect(result.findings).toHaveLength(1);
  });

  it("rejects unknown categories and invalid offsets", () => {
    expect(() => reviewResponseSchema.parse({ findings: [{
      category: "style", original: "x", suggestion: "y", explanationVi: "z", exampleEn: "e",
      register: "neutral", confidence: 2, from: -1, to: 0,
    }] })).toThrow();
  });
});

describe("Gemini selection transform schema", () => {
  const segment = {
    id: "segment-1",
    result: "A natural sentence.",
    category: "naturalness",
    explanationVi: "Cách diễn đạt này tự nhiên hơn.",
    exampleEn: "Another natural sentence.",
    register: "neutral",
    confidence: 0.94,
  } as const;

  it("rejects newlines and invalid categories", () => {
    expect(() => selectionTransformResponseSchema.parse({ summaryVi: "OK", segments: [{ ...segment, result: "Line one\nLine two" }] })).toThrow();
    expect(() => selectionTransformResponseSchema.parse({ summaryVi: "OK", segments: [{ ...segment, category: "style" }] })).toThrow();
  });

  it("rejects missing, duplicate, or changed segment IDs before persistence", () => {
    const valid = selectionTransformResponseSchema.parse({ summaryVi: "OK", segments: [segment, { ...segment, id: "segment-2" }] });
    expect(selectionResponseMatchesIds(valid, ["segment-1", "segment-2"])).toBe(true);
    expect(selectionResponseMatchesIds(valid, ["segment-1", "segment-3"])).toBe(false);
    const duplicate = selectionTransformResponseSchema.parse({ summaryVi: "OK", segments: [segment, segment] });
    expect(selectionResponseMatchesIds(duplicate, ["segment-1", "segment-2"])).toBe(false);
  });
});
