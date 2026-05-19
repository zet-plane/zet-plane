import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Legend } from "./Legend";

describe("Legend", () => {
	it("starts collapsed and expands on demand", () => {
		render(<Legend />);

		const toggle = screen.getByRole("button", { name: /Legend/ });
		expect(toggle).toBeInTheDocument();
		expect(toggle).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("Scaffold (flag-tab)")).not.toBeInTheDocument();

		fireEvent.click(toggle);

		expect(toggle).toHaveAttribute("aria-expanded", "true");
		expect(toggle).toHaveAttribute("aria-controls", "zp-graph-legend-panel");
		expect(document.getElementById("zp-graph-legend-panel")).not.toBeNull();
		expect(screen.getByText("Scaffold (flag-tab)")).toBeInTheDocument();
	});

	it("renders token-backed swatches and glyphs", () => {
		render(<Legend />);

		fireEvent.click(screen.getByRole("button", { name: /Legend/ }));

		expectTokenStyle("legend-swatch-active", {
			background: "var(--zp-status-active)",
		});
		expectTokenStyle("legend-swatch-blocked", {
			background: "var(--zp-status-blocked)",
		});
		expectTokenStyle("legend-swatch-completed", {
			background: "var(--zp-status-completed)",
		});
		expectTokenStyle("legend-swatch-archived", {
			background: "var(--zp-status-archived)",
		});
		expectTokenStyle("legend-glyph-scaffold", {
			background: "var(--zp-color-accent-signal-soft)",
			borderLeftColor: "var(--zp-accent-scaffold)",
		});
		expectTokenStyle("legend-glyph-growth", {
			background: "var(--zp-color-accent-signal-soft)",
			borderLeftColor: "var(--zp-accent-growth)",
		});
		expectTokenStyle("legend-glyph-knowledge", {
			background: "var(--zp-color-semantic-knowledge-soft)",
		});
	});
});

function expectTokenStyle(
	testId: string,
	expected: Partial<
		Pick<CSSStyleDeclaration, "background" | "borderLeftColor">
	>,
) {
	const element = screen.getByTestId(testId);
	expect(element).toHaveAttribute("aria-hidden", "true");
	if (expected.background !== undefined) {
		expect(element.style.background).toBe(expected.background);
	}
	if (expected.borderLeftColor !== undefined) {
		expect(element.style.borderLeftColor).toBe(expected.borderLeftColor);
	}
}
