import { describe, it, expect } from "vitest";
import { greet } from "../index";

describe("greet", () => {
  it("should greet a user", () => {
    expect(greet("World")).toBe("Hello, World!");
  });
});
