import { expect, test } from "@playwright/test";

// Drift-detection: the `.zp-pill` div is `display: inline-flex` and grows to
// its content width regardless of the wrapper width ELK reserved for it.
// If `measurePillSize` (apps/web/src/features/graph/components/pill-geometry.ts)
// underestimates that width, the pill overflows its reserved box and collides
// with neighboring nodes (notably peripheral stubs).
//
// Invariant: for every `react-flow__node-pill`, the inner `.zp-pill` must fit
// inside its wrapper. This test catches CSS drift in Pill.tsx that hasn't been
// mirrored into pill-geometry.ts.

const DEMO_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

// Focus targets chosen to exercise variant breadth:
//   - top-level: scaffold pills with knowledge probes + dive buttons
//   - PRD focus: scaffold pills, varying child counts (incl. zero)
//   - Scaffold Graph focus: the screenshot's overlap scene
const TECH_SCAFFOLD_GRAPH_ID = "00000000-0000-4000-8001-000000000052";
const PRD_ID = "00000000-0000-4000-8001-000000000040";
const REQ_INTERVIEWS_ID = "00000000-0000-4000-8001-000000000021";

const TOLERANCE_PX = 1; // sub-pixel rounding latitude

const graphUrl = (baseURL: string | undefined, focusId?: string) => {
	const base = `${baseURL ?? "http://localhost:3001"}/projects/${DEMO_PROJECT_ID}/graph`;
	return focusId ? `${base}?focus=${focusId}` : base;
};

test.describe("Pill geometry drift detection", () => {
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
				"\n[pill-geometry.spec] Demo seed missing. Run:\n  cd apps/server && pnpm prisma db seed\n",
			);
			test.skip(true, "Demo seed missing — see console for fix command");
		}
		if (status !== 200) {
			throw new Error(`Demo precheck: unexpected ${status} from ${url}`);
		}
	});

	for (const [name, focusId] of [
		["top-level", undefined],
		["PRD focus", PRD_ID],
		["REQ interviews focus", REQ_INTERVIEWS_ID],
		["Scaffold Graph focus", TECH_SCAFFOLD_GRAPH_ID],
	] as const) {
		test(`inner pills fit inside their reserved wrappers (${name})`, async ({
			page,
			baseURL,
		}) => {
			await page.goto(graphUrl(baseURL, focusId));
			await expect(page.locator(".react-flow")).toBeVisible({ timeout: 10000 });
			// Wait until ELK has finished and pills are mounted with sized wrappers.
			await expect(page.locator(".react-flow__node-pill").first()).toBeVisible({
				timeout: 10000,
			});

			const measurements = await page
				.locator(".react-flow__node-pill")
				.evaluateAll((wrappers) =>
					wrappers.map((wrapper) => {
						const inner = wrapper.querySelector<HTMLElement>(".zp-pill");
						return {
							nodeId: wrapper.getAttribute("data-id") ?? "?",
							wrapperWidth: (wrapper as HTMLElement).offsetWidth,
							innerWidth: inner?.offsetWidth ?? 0,
							hasProbe: !!inner?.querySelector(".zp-probe-rail"),
							hasDive: !!inner?.querySelector(".zp-pill__dive"),
							classes: inner?.className ?? "",
						};
					}),
				);

			expect(measurements.length).toBeGreaterThan(0);

			for (const m of measurements) {
				expect(
					m.innerWidth,
					`Pill ${m.nodeId} (probe=${m.hasProbe}, dive=${m.hasDive}, classes="${m.classes}") rendered ${m.innerWidth}px but reserved ${m.wrapperWidth}px — pill-geometry.ts underestimates real CSS width.`,
				).toBeLessThanOrEqual(m.wrapperWidth + TOLERANCE_PX);
			}
		});
	}
});
