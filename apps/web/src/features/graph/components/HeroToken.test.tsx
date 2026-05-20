import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroToken } from "./HeroToken";

const node = {
	id: "n1",
	projectId: "p",
	isProjectRoot: false,
	role: "regular",
	type: "scaffold",
	title: "Phase gate",
	description: null,
	status: "active",
	isCheckpoint: true,
	checkpointResolution: null,
	createdBy: "human",
	createdAt: "2026-05-16T00:00:00.000Z",
	updatedAt: "2026-05-16T00:00:00.000Z",
} as const;

describe("HeroToken", () => {
	it("renders checkpoint as a dot inside the scaffold crescent", () => {
		const { container } = render(<HeroToken node={node} />);

		const marker = screen.getByLabelText("checkpoint");
		expect(marker).toHaveClass("zp-checkpoint-marker");
		expect(marker).toHaveClass("zp-checkpoint-marker--blocked");
		expect(
			container.querySelector(".zp-checkpoint-marker__dot"),
		).not.toBeNull();
		expect(container.querySelector(".zp-pill__flag")).toBeNull();
		expect(marker.querySelector("svg")).toBeNull();
	});
});
