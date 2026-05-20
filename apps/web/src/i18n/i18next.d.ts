import "i18next";
import type { AppResources, defaultNS } from "./resources";

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: typeof defaultNS;
		resources: AppResources;
	}
}
