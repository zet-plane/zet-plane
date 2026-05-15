import { test, expect } from "@playwright/test";

test("homepage loads and renders graph canvas", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas).toBeVisible();
  // Two demo nodes should be rendered by React Flow
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(2);
});
