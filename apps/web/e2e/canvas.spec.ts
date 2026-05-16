import { expect, test } from "@playwright/test";

const COMPACT_PROJECT_ID = "00000000-0000-4000-8000-000000000003";
const ROOT_NODE_ID = "00000000-0000-4000-8003-000000000000";
const TASK_A_NODE_ID = "00000000-0000-4000-8003-000000000001";

test("graph canvas renders and selection updates URL", async ({
	page,
	baseURL,
}) => {
	await page.goto(
		`${baseURL ?? "http://localhost:3001"}/projects/${COMPACT_PROJECT_ID}/graph`,
	);

	await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

	const taskA = page.locator(`[data-id="${TASK_A_NODE_ID}"]`);
	await expect(taskA).toBeVisible({ timeout: 10000 });

	await taskA.click();
	await expect(page).toHaveURL(new RegExp(`nodeId=${TASK_A_NODE_ID}`));

	await expect(
		page.getByRole("heading", { level: 2, name: "Task A" }),
	).toBeVisible();
});

test("graph canvas renders project hero with child pills and supports dive-in", async ({
	page,
	baseURL,
}) => {
	await page.goto(
		`${baseURL ?? "http://localhost:3001"}/projects/${COMPACT_PROJECT_ID}/graph`,
	);

	await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

	// Project hero token is rendered above the canvas (not as an xyflow node).
	const heroToken = page.locator(".zp-hero--project");
	await expect(heroToken).toBeVisible({ timeout: 10000 });

	// Task A appears as a pill on the canvas.
	const taskAPill = page.locator(`[data-id="${TASK_A_NODE_ID}"]`);
	await expect(taskAPill).toBeVisible({ timeout: 10000 });

	// Root node is NOT rendered as an xyflow node — it is the hero token.
	const rootXyflowNode = page.locator(
		`.react-flow [data-id="${ROOT_NODE_ID}"]`,
	);
	await expect(rootXyflowNode).not.toBeAttached();

	// Composition edges are no longer rendered.
	const compositionEdge = page.locator("path.zp-edge--composition").first();
	await expect(compositionEdge).not.toBeAttached();

	// Double-clicking Task A pill dives in: URL gains focus param.
	await taskAPill.dblclick();
	await expect(page).toHaveURL(new RegExp(`focus=${TASK_A_NODE_ID}`));

	// Breadcrumb nav gains a second segment after diving in.
	const breadcrumb = page.locator("nav.zp-breadcrumb");
	await expect(breadcrumb).toBeVisible();
	const breadcrumbButtons = breadcrumb.getByRole("button");
	await expect(breadcrumbButtons).toHaveCount(2);
});
