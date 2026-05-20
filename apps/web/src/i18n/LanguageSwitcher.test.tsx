import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { initAppI18n } from "./index";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { APP_LANGUAGE_STORAGE_KEY } from "./languages";

describe("LanguageSwitcher", () => {
	beforeEach(async () => {
		window.localStorage.clear();
		await initAppI18n({ language: "en" });
	});

	it("switches language and persists the app preference", async () => {
		render(<LanguageSwitcher />);

		expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		fireEvent.click(screen.getByRole("button", { name: "中文" }));

		expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
		expect(document.documentElement.lang).toBe("zh-CN");
	});
});
