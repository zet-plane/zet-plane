import { describe, it, expect } from "vitest";
import { nodeStatusClass, containerStatusClass, edgeStatusClass } from "./status-classes";

describe("status class helpers", () => {
  it("returns the expected node class", () => {
    expect(nodeStatusClass("active")).toBe("zp-node--active");
    expect(nodeStatusClass("blocked")).toBe("zp-node--blocked");
    expect(nodeStatusClass("completed")).toBe("zp-node--completed");
    expect(nodeStatusClass("archived")).toBe("zp-node--archived");
  });

  it("returns neutral container class when worst is null", () => {
    expect(containerStatusClass(null)).toBe("zp-container--neutral");
  });

  it("returns sealed completed when status is completed", () => {
    expect(containerStatusClass(null, "completed")).toBe("zp-container--completed");
  });

  it("edge class follows target status", () => {
    expect(edgeStatusClass("blocked")).toBe("zp-edge--blocked");
    expect(edgeStatusClass("archived")).toBe("zp-edge--blocked");
    expect(edgeStatusClass("completed")).toBe("zp-edge--completed");
    expect(edgeStatusClass("active")).toBe("zp-edge--active");
  });
});
