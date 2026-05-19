import { useTranslation } from "react-i18next";
import { setAppLanguage } from "./index";
import type { AppLanguage } from "./languages";

export function LanguageSwitcher() {
	const { i18n, t } = useTranslation("common");
	const language = i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";

	const switchLanguage = (nextLanguage: AppLanguage) => {
		if (nextLanguage !== language) void setAppLanguage(nextLanguage);
	};

	return (
		<fieldset
			className="flex shrink-0 overflow-hidden rounded-md border border-border"
			aria-label={t("language.label")}
		>
			<button
				type="button"
				aria-pressed={language === "en"}
				onClick={() => switchLanguage("en")}
				className="px-2.5 py-1 text-xs font-medium hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
			>
				{t("language.english")}
			</button>
			<button
				type="button"
				aria-pressed={language === "zh-CN"}
				onClick={() => switchLanguage("zh-CN")}
				className="border-l border-border px-2.5 py-1 text-xs font-medium hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
			>
				{t("language.chinese")}
			</button>
		</fieldset>
	);
}
