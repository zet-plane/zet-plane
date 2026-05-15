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

test("graph canvas fills the viewport and renders composition containment", async ({
	page,
	baseURL,
}) => {
	await page.goto(
		`${baseURL ?? "http://localhost:3001"}/projects/${COMPACT_PROJECT_ID}/graph`,
	);

	const root = page.locator("#root");
	await expect(root).toHaveJSProperty("clientWidth", 1280);

	const appShell = page.locator("#root > div").first();
	await expect(appShell).toHaveJSProperty("clientWidth", 1280);
	await expect(appShell).toHaveJSProperty("clientHeight", 720);

	const rootNode = page.locator(`[data-id="${ROOT_NODE_ID}"]`);
	const taskA = page.locator(`[data-id="${TASK_A_NODE_ID}"]`);
	await expect(rootNode).toBeVisible({ timeout: 10000 });
	await expect(taskA).toBeVisible({ timeout: 10000 });

	const rootBox = await rootNode.boundingBox();
	const taskABox = await taskA.boundingBox();

	expect(rootBox).not.toBeNull();
	expect(taskABox).not.toBeNull();
	expect(taskABox!.x).toBeGreaterThanOrEqual(rootBox!.x);
	expect(taskABox!.y).toBeGreaterThanOrEqual(rootBox!.y);
	expect(taskABox!.x + taskABox!.width).toBeLessThanOrEqual(
		rootBox!.x + rootBox!.width,
	);
	expect(taskABox!.y + taskABox!.height).toBeLessThanOrEqual(
		rootBox!.y + rootBox!.height,
	);
});
