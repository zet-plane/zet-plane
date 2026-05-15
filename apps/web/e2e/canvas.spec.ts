import { expect, test } from "@playwright/test";

const COMPACT_PROJECT_ID = "00000000-0000-4000-8000-000000000003";
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
