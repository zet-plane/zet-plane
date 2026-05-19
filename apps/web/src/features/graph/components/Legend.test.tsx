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
});
