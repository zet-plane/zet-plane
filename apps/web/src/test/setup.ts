import "@testing-library/jest-dom";

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
