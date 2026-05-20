import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
	resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"),
	"utf8",
);

describe("scaffold crescent style", () => {
	it("uses the demo crescent shape for scaffold pills", () => {
		const rule = findRule(".zp-pill--scaffold::before");

		expect(rule).toContain("left: 6px;");
		expect(rule).toContain("width: 10px;");
		expect(rule).toContain("border: 2px solid var(--zp-type-scaffold);");
		expect(rule).toContain("border-right: 0;");
		expect(rule).toContain("border-radius: 999px 0 0 999px;");
		expect(rule).not.toContain("background:");
	});

	it("uses the demo crescent shape for scaffold hero tokens", () => {
		const rule = findRule(".zp-hero--scaffold::before");

		expect(rule).toContain("left: 6px;");
		expect(rule).toContain("width: 10px;");
		expect(rule).toContain("border: 2px solid var(--zp-accent-scaffold);");
		expect(rule).toContain("border-right: 0;");
		expect(rule).toContain("border-radius: 999px 0 0 999px;");
		expect(rule).not.toContain("background:");
	});
});

function findRule(selector: string): string {
	const escapedSelector = selector
		.replaceAll(".", "\\.")
		.replaceAll(":", "\\:");
	const match = css.match(
		new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`),
	);
	if (!match?.groups?.body) {
		throw new Error(`Missing CSS rule: ${selector}`);
	}
	return match.groups.body;
}
