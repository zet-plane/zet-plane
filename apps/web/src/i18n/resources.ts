import { common as enCommon } from "./locales/en/common";
import { graph as enGraph } from "./locales/en/graph";
import { projects as enProjects } from "./locales/en/projects";
import { common as zhCommon } from "./locales/zh-CN/common";
import { graph as zhGraph } from "./locales/zh-CN/graph";
import { projects as zhProjects } from "./locales/zh-CN/projects";

export const defaultNS = "common";
export const supportedLanguages = ["en", "zh-CN"] as const;

export const en = {
	common: enCommon,
	projects: enProjects,
	graph: enGraph,
} as const;

export type ResourceShape<T> = {
	[K in keyof T]: T[K] extends string ? string : ResourceShape<T[K]>;
};

export const zhCN = {
	common: zhCommon,
	projects: zhProjects,
	graph: zhGraph,
} as const satisfies ResourceShape<typeof en>;

export const appResources = {
	en,
	"zh-CN": zhCN,
} as const;

export type AppResources = typeof en;
