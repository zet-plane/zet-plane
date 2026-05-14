import { expect, test } from "@playwright/test";

test("graph canvas renders and selection updates URL", async ({
	page,
	baseURL,
}) => {
	await page.goto(`${baseURL ?? "http://localhost:3001"}/projects`);

	const firstLink = page.locator("a[href^='/projects/']").first();
	await expect(firstLink).toBeVisible();
	await firstLink.click();

	await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

	const someNode = page.locator(".zp-node, .zp-container").first();
	await expect(someNode).toBeVisible({ timeout: 10000 });

	await someNode.click();
	await expect(page).toHaveURL(/nodeId=/);

	await expect(page.locator("aside h2")).toBeVisible();
});
