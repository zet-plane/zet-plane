import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();

	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => Array.from(values.keys())[index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, value),
	};
}

Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: createMemoryStorage(),
});
Object.defineProperty(globalThis, "sessionStorage", {
	configurable: true,
	value: createMemoryStorage(),
});

beforeEach(async () => {
	const { initAppI18n } = await import("@/i18n");
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
