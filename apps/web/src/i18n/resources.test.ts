import { describe, expect, it } from "vitest";
import { appResources, defaultNS, supportedLanguages } from "./resources";

describe("i18n resources", () => {
	it("ships English and Simplified Chinese resources", () => {
		expect(supportedLanguages).toEqual(["en", "zh-CN"]);
		expect(defaultNS).toBe("common");
		expect(Object.keys(appResources.en)).toEqual([
			"common",
			"projects",
			"graph",
		]);
		expect(Object.keys(appResources["zh-CN"])).toEqual([
			"common",
			"projects",
			"graph",
		]);
	});

	it("keeps representative UI chrome keys available in both languages", () => {
		expect(appResources.en.graph.canvas.loading).toBe("Loading graph...");
		expect(appResources["zh-CN"].graph.canvas.loading).toBe("正在加载图谱...");
		expect(appResources.en.projects.list.title).toBe("Projects");
		expect(appResources["zh-CN"].projects.list.title).toBe("项目");
	});
});
