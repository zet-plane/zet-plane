import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { initAppI18n } from "@/i18n";

beforeEach(async () => {
	await initAppI18n({ language: "en" });
	window.localStorage.clear();
});

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}),
	});
}

if (typeof globalThis.ResizeObserver === "undefined") {
	class ResizeObserverMock implements ResizeObserver {
		observe(): void {}

		unobserve(): void {}

		disconnect(): void {}
	}

	globalThis.ResizeObserver = ResizeObserverMock;
}
