import { expect, test } from "@playwright/test";

// Canvas e2e targets the single semantic demo seeded by apps/server/prisma/seed.ts.
// The stable IDs below are part of the seed/e2e contract until test-only
// fixtures are split out from product demo data.

const DEMO_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const ROOT_ID = "00000000-0000-4000-8001-000000000000";

const IDEA_ID = "00000000-0000-4000-8001-000000000010";
const REQUIREMENTS_ID = "00000000-0000-4000-8001-000000000020";
const REQ_INTERVIEWS_ID = "00000000-0000-4000-8001-000000000021";
const REQ_BOUNDARIES_ID = "00000000-0000-4000-8001-000000000023";
const REQ_HANDOFF_FINDING_ID = "00000000-0000-4000-8001-000000000024";
const REQ_UNDERSTANDING_NOT_EXECUTION_ID = "00000000-0000-4000-8001-000000000025";

const COMPETITORS_ID = "00000000-0000-4000-8001-000000000030";

const PRD_ID = "00000000-0000-4000-8001-000000000040";
const PRD_USER_STORIES_ID = "00000000-0000-4000-8001-000000000041";
const PRD_SCOPE_ID = "00000000-0000-4000-8001-000000000042";
const PRD_MVP_BOUNDARY_ID = "00000000-0000-4000-8001-000000000043";

const TECH_ID = "00000000-0000-4000-8001-000000000050";
const TECH_SCAFFOLD_GRAPH_ID = "00000000-0000-4000-8001-000000000052";
const TECH_REVIEW_CHECKPOINT_ID = "00000000-0000-4000-8001-000000000053";
const TECH_ADAPTER_STRATEGY_ID = "00000000-0000-4000-8001-000000000054";

const DELIVERY_ID = "00000000-0000-4000-8001-000000000060";

const graphUrl = (baseURL: string | undefined, projectId: string) =>
	`${baseURL ?? "http://localhost:3001"}/projects/${projectId}/graph`;

test.describe("Semantic demo canvas", () => {
	test.beforeAll(async ({ request, baseURL }) => {
		const url = `${baseURL ?? "http://localhost:3001"}/api/projects/${DEMO_PROJECT_ID}`;
		let status: number;
		try {
			const res = await request.get(url);
			status = res.status();
		} catch (e) {
			throw new Error(
				`Demo precheck: cannot reach ${url}. Is the backend running on :3000? (${(e as Error).message})`,
			);
		}
		if (status === 404) {
			console.warn(
				"\n[canvas.spec] Demo seed missing. Run:\n  cd apps/server && pnpm prisma db seed\n",
			);
			test.skip(true, "Demo seed missing — see console for fix command");
		}
		if (status !== 200) {
			throw new Error(`Demo precheck: unexpected ${status} from ${url}`);
		}
	});

	test("selecting a pill updates the nodeId URL param and opens the detail panel", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const idea = page.locator(`[data-id="${IDEA_ID}"]`);
		await expect(idea).toBeVisible({ timeout: 10000 });

		await idea.click();
		await expect(page).toHaveURL(new RegExp(`nodeId=${IDEA_ID}`));
		await expect(
			page.getByRole("heading", { level: 2, name: "Idea 提出" }),
		).toBeVisible();
	});

	test("project root is not rendered as canvas chrome or as an xyflow node", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });
		await expect(page.locator(".zp-hero--project")).not.toBeAttached();
		await expect(page.locator("nav.zp-breadcrumb")).not.toBeAttached();
		await expect(page.locator(".zp-topbar__crumbs")).toContainText(
			"Zet Plane 项目开发流程",
		);

		const rootInCanvas = page.locator(`.react-flow [data-id="${ROOT_ID}"]`);
		await expect(rootInCanvas).not.toBeAttached();

		await expect(page.locator("path.zp-edge--composition").first()).not.toBeAttached();
	});

	test("top-level canvas shows only direct process flows and an empty staging lane", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		for (const id of [
			IDEA_ID,
			REQUIREMENTS_ID,
			COMPETITORS_ID,
			PRD_ID,
			TECH_ID,
			DELIVERY_ID,
		]) {
			await expect(page.locator(`[data-id="${id}"]`)).toBeVisible();
		}

		await expect(
			page.locator(`.react-flow [data-id="${REQ_INTERVIEWS_ID}"]`),
		).not.toBeAttached();
		await expect(
			page.locator(`.react-flow [data-id="${PRD_MVP_BOUNDARY_ID}"]`),
		).not.toBeAttached();

		const edges = page.locator(".react-flow__edges path.react-flow__edge-path");
		await expect(edges.first()).toBeVisible();
		await expect(edges.first()).toHaveAttribute("marker-end", /url/);

		const staging = page.getByLabel("Staging lane");
		await expect(staging).toBeVisible();
		await expect(staging).toContainText("No unanchored nodes");
	});

	test("Scaffold pills show a flag-tab silhouette and dive glyph; Growth pills don't", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const requirements = page.locator(`[data-id="${REQUIREMENTS_ID}"]`);
		await expect(requirements.locator(".zp-pill--scaffold")).toBeVisible();
		await expect(requirements).toContainText("↳3");

		await page.goto(
			`${graphUrl(baseURL, DEMO_PROJECT_ID)}?focus=${REQ_INTERVIEWS_ID}`,
		);
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const finding = page.locator(`[data-id="${REQ_HANDOFF_FINDING_ID}"]`);
		await expect(finding.locator(".zp-pill--growth")).toBeVisible();
		await expect(finding.locator(".zp-pill--scaffold")).toHaveCount(0);
		await expect(finding).not.toContainText(/↳\d+/);
	});

	test("single-click selects a pill and writes ?nodeId= to the URL", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const prd = page.locator(`[data-id="${PRD_ID}"]`);
		await expect(prd).toBeVisible({ timeout: 10000 });

		await prd.click();
		await expect(page).toHaveURL(new RegExp(`nodeId=${PRD_ID}`));
		await expect(page).not.toHaveURL(/focus=/);
	});

	test("?focus=<scaffold> URL renders that scaffold's children without canvas chrome", async ({
		page,
		baseURL,
	}) => {
		await page.goto(`${graphUrl(baseURL, DEMO_PROJECT_ID)}?focus=${PRD_ID}`);
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		await expect(page.locator(`[data-id="${PRD_USER_STORIES_ID}"]`)).toBeVisible();
		await expect(page.locator(`[data-id="${PRD_SCOPE_ID}"]`)).toBeVisible();
		const edges = page.locator(".react-flow__edges path.react-flow__edge-path");
		await expect(edges.first()).toBeVisible();
		await expect(edges.first()).toHaveAttribute("marker-end", /url/);
		await expect(
			page.locator(`.react-flow [data-id="${REQUIREMENTS_ID}"]`),
		).not.toBeAttached();
		await expect(
			page.locator(`.react-flow [data-id="${ROOT_ID}"]`),
		).not.toBeAttached();

		await expect(page.locator(".zp-hero--scaffold")).not.toBeAttached();
		await expect(page.locator("nav.zp-breadcrumb")).not.toBeAttached();
		await expect(page.locator(".zp-topbar__crumbs")).toContainText(
			"PRD 与项目排期",
		);

		await expect(page.getByLabel("Staging lane")).not.toBeVisible();
	});

	test("clicking the ↳N glyph dives in without first selecting the pill", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const diveButton = page.getByRole("button", {
			name: /Dive into 需求分析/,
		});
		await expect(diveButton).toBeVisible({ timeout: 10000 });
		await diveButton.click();

		await expect(page).toHaveURL(new RegExp(`focus=${REQUIREMENTS_ID}`));
		await expect(page).not.toHaveURL(/nodeId=/);
	});

	test("double-clicking a leaf node does not dive into it", async ({
		page,
		baseURL,
	}) => {
		await page.goto(`${graphUrl(baseURL, DEMO_PROJECT_ID)}?focus=${PRD_ID}`);
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const leaf = page.locator(`[data-id="${PRD_USER_STORIES_ID}"]`);
		await expect(leaf).toBeVisible({ timeout: 10000 });
		await leaf.dblclick();

		await expect(page).toHaveURL(new RegExp(`focus=${PRD_ID}`));
		await expect(page).not.toHaveURL(new RegExp(`focus=${PRD_USER_STORIES_ID}`));
		await expect(page.getByLabel("Staging lane")).not.toBeVisible();
	});

	test("diving into Scaffold Graph shows a sibling dependency edge and a cross-flow peripheral stub", async ({
		page,
		baseURL,
	}) => {
		await page.goto(
			`${graphUrl(baseURL, DEMO_PROJECT_ID)}?focus=${TECH_SCAFFOLD_GRAPH_ID}`,
		);
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		await expect(
			page.locator(`[data-id="${TECH_REVIEW_CHECKPOINT_ID}"]`),
		).toBeVisible();
		await expect(
			page.locator(`[data-id="${TECH_ADAPTER_STRATEGY_ID}"]`),
		).toBeVisible();

		const edges = page.locator(".react-flow__edges path.react-flow__edge-path");
		await expect(edges.first()).toBeVisible();
		await expect(edges.first()).toHaveAttribute("marker-end", /url/);

		const boundaryStub = page.getByRole("button", {
			name: "Open 边界确认：理解而非执行",
		});
		await expect(boundaryStub).toBeVisible();
		await expect(boundaryStub).toHaveClass(/zp-pill--peripheral/);

		await page.getByRole("button", { name: /Legend/ }).click();
		await page
			.getByRole("button", { name: "Jump to 边界确认：理解而非执行" })
			.click();
		await expect(page).toHaveURL(
			new RegExp(`focus=${REQ_BOUNDARIES_ID}`),
		);
	});

	test("legend toggles open/closed and shows the pill-idiom entries", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const legend = page.getByRole("button", { name: /Legend/ });
		await expect(legend).toBeVisible();

		await expect(page.getByText("Scaffold (flag-tab)")).toBeVisible();
		await expect(page.getByText("Growth (compact)")).toBeVisible();
		await expect(page.getByText("Knowledge (violet)")).toBeVisible();
		await expect(page.getByText("Dive in")).toBeVisible();

		await legend.click();
		await expect(page.getByText("Scaffold (flag-tab)")).not.toBeVisible();
	});

	test("knowledge toggle is backed by the URL", async ({ page, baseURL }) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		const toggle = page.getByRole("button", { name: /Knowledge nodes/ });
		await expect(toggle).toHaveAttribute("aria-pressed", "false");

		await toggle.click();
		await expect(page).toHaveURL(/knowledge=nodes/);
		await expect(toggle).toHaveAttribute("aria-pressed", "true");

		await toggle.click();
		await expect(page).not.toHaveURL(/knowledge=nodes/);
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
	});

	test("view switch is backed by the URL", async ({ page, baseURL }) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });

		await page.getByRole("button", { name: "Explore" }).click();
		await expect(page).toHaveURL(/view=explore/);
		await expect(page.getByRole("searchbox", { name: /Search/ })).toBeVisible();

		await page.getByRole("button", { name: "Diagnose" }).click();
		await expect(page).toHaveURL(/view=diagnose/);
	});

	test("composition edges are never rendered on the semantic demo", async ({
		page,
		baseURL,
	}) => {
		await page.goto(graphUrl(baseURL, DEMO_PROJECT_ID));
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });
		await expect(
			page.locator("path.zp-edge--composition"),
		).not.toBeAttached();

		await page.goto(`${graphUrl(baseURL, DEMO_PROJECT_ID)}?focus=${PRD_ID}`);
		await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });
		await expect(
			page.locator("path.zp-edge--composition"),
		).not.toBeAttached();
	});
});
