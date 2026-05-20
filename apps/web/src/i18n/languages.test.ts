import { describe, expect, it, vi } from "vitest";
import {
	APP_LANGUAGE_STORAGE_KEY,
	detectInitialLanguage,
	normalizeLanguage,
	readSavedLanguage,
	writeSavedLanguage,
} from "./languages";

describe("app language detection", () => {
	it("normalizes supported English and Chinese browser tags", () => {
		expect(normalizeLanguage("en-US")).toBe("en");
		expect(normalizeLanguage("zh")).toBe("zh-CN");
		expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
		expect(normalizeLanguage("fr-FR")).toBeNull();
	});

	it("prefers a saved language over browser languages", () => {
		window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "zh-CN");

		expect(detectInitialLanguage(["en-US"])).toBe("zh-CN");
	});

	it("falls back to browser languages and then English", () => {
		window.localStorage.removeItem(APP_LANGUAGE_STORAGE_KEY);

		expect(detectInitialLanguage(["fr-FR", "zh-Hans"])).toBe("zh-CN");
		expect(detectInitialLanguage(["fr-FR"])).toBe("en");
	});

	it("persists only supported languages", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		writeSavedLanguage("zh-CN");
		expect(readSavedLanguage()).toBe("zh-CN");

		window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "de");
		expect(readSavedLanguage()).toBeNull();
		expect(warn).toHaveBeenCalled();

		warn.mockRestore();
	});
});
