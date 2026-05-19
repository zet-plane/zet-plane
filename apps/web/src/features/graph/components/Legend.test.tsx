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
		const { container } = render(<Legend />);

		fireEvent.click(screen.getByRole("button", { name: /Legend/ }));

		for (const token of [
			"var(--zp-status-active)",
			"var(--zp-status-blocked)",
			"var(--zp-status-completed)",
			"var(--zp-status-archived)",
			"var(--zp-color-accent-signal-soft)",
			"var(--zp-accent-scaffold)",
			"var(--zp-accent-growth)",
			"var(--zp-color-semantic-knowledge-soft)",
		]) {
			expect(container.querySelector(`[style*="${token}"]`)).not.toBeNull();
		}
	});
});
