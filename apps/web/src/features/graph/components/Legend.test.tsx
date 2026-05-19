import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Legend } from "./Legend";

describe("Legend", () => {
	it("starts collapsed and expands on demand", () => {
		render(<Legend />);

		expect(screen.getByRole("button", { name: /Legend/ })).toBeInTheDocument();
		expect(screen.queryByText("Scaffold (flag-tab)")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Legend/ }));

		expect(screen.getByText("Scaffold (flag-tab)")).toBeInTheDocument();
	});

	it("renders token-backed swatches and glyphs", () => {
		render(<Legend />);

		fireEvent.click(screen.getByRole("button", { name: /Legend/ }));

		expect(screen.getByTestId("legend-swatch-active")).toHaveAttribute(
			"style",
			"background: var(--zp-status-active);",
		);
		expect(screen.getByTestId("legend-swatch-blocked")).toHaveAttribute(
			"style",
			"background: var(--zp-status-blocked);",
		);
		expect(screen.getByTestId("legend-swatch-completed")).toHaveAttribute(
			"style",
			"background: var(--zp-status-completed);",
		);
		expect(screen.getByTestId("legend-swatch-archived")).toHaveAttribute(
			"style",
			"background: var(--zp-status-archived);",
		);
		expect(screen.getByTestId("legend-glyph-scaffold")).toHaveAttribute(
			"style",
			"background: var(--zp-color-accent-signal-soft); border-left-width: 3px; border-left-style: solid; border-left-color: var(--zp-accent-scaffold);",
		);
		expect(screen.getByTestId("legend-glyph-growth")).toHaveAttribute(
			"style",
			"background: var(--zp-color-accent-signal-soft); border-left-width: 3px; border-left-style: solid; border-left-color: var(--zp-accent-growth);",
		);
		expect(screen.getByTestId("legend-glyph-knowledge")).toHaveAttribute(
			"style",
			"background: var(--zp-color-semantic-knowledge-soft);",
		);
	});
});
