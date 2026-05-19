import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
	type AppLanguage,
	detectInitialLanguage,
	fallbackLanguage,
	supportedLanguages,
	writeSavedLanguage,
} from "./languages";
import { appResources, defaultNS } from "./resources";

let initialized = false;

function syncDocumentLanguage(language: string) {
	if (typeof document === "undefined") return;
	document.documentElement.lang = language;
}

export async function initAppI18n(options?: { language?: AppLanguage }) {
	const language = options?.language ?? detectInitialLanguage();

	if (initialized) {
		await i18n.changeLanguage(language);
		syncDocumentLanguage(language);
		return i18n;
	}

	await i18n.use(initReactI18next).init({
		resources: appResources,
		lng: language,
		fallbackLng: fallbackLanguage,
		supportedLngs: supportedLanguages,
		defaultNS,
		ns: ["common", "projects", "graph"],
		debug: import.meta.env.DEV,
		saveMissing: false,
		interpolation: { escapeValue: false },
	});

	initialized = true;
	syncDocumentLanguage(language);
	i18n.on("languageChanged", syncDocumentLanguage);

	return i18n;
}

export async function setAppLanguage(language: AppLanguage) {
	writeSavedLanguage(language);
	await i18n.changeLanguage(language);
	syncDocumentLanguage(language);
}

void initAppI18n();

export { i18n };
