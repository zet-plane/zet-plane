import { describe, it, expect } from "vitest";
import { graphSearchSchema } from "./graph-search";

describe("graphSearchSchema", () => {
  it("accepts an empty object", () => {
    expect(graphSearchSchema.parse({})).toEqual({});
  });

  it("accepts a nodeId", () => {
    expect(graphSearchSchema.parse({ nodeId: "n1" })).toEqual({ nodeId: "n1" });
  });

  it("strips unknown keys", () => {
    expect(graphSearchSchema.parse({ nodeId: "n1", zoom: 2 })).toEqual({
      nodeId: "n1",
    });
  });

  it("rejects non-string nodeId", () => {
    expect(() => graphSearchSchema.parse({ nodeId: 5 })).toThrow();
  });

  it("rejects an empty nodeId", () => {
    expect(() => graphSearchSchema.parse({ nodeId: "" })).toThrow();
  });
});
