export const supportedLanguages = ["en", "zh-CN"] as const;
export type AppLanguage = (typeof supportedLanguages)[number];

export const APP_LANGUAGE_STORAGE_KEY = "zet-plane.language";
export const fallbackLanguage: AppLanguage = "en";

export function normalizeLanguage(language: string | null | undefined) {
	if (!language) return null;

	const normalized = language.toLowerCase();
	if (normalized === "en" || normalized.startsWith("en-")) return "en";
	if (
		normalized === "zh" ||
		normalized.startsWith("zh-cn") ||
		normalized.startsWith("zh-hans")
	) {
		return "zh-CN";
	}

	return null;
}

export function readSavedLanguage(): AppLanguage | null {
	if (typeof window === "undefined") return null;

	const raw = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
	if (!raw) return null;

	const language = normalizeLanguage(raw);
	if (!language) {
		console.warn(`Ignoring unsupported saved language: ${raw}`);
		return null;
	}

	return language;
}

export function writeSavedLanguage(language: AppLanguage) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
}

export function detectInitialLanguage(
	browserLanguages: readonly string[] = typeof navigator === "undefined"
		? []
		: navigator.languages,
): AppLanguage {
	const saved = readSavedLanguage();
	if (saved) return saved;

	for (const browserLanguage of browserLanguages) {
		const language = normalizeLanguage(browserLanguage);
		if (language) return language;
	}

	return fallbackLanguage;
}
