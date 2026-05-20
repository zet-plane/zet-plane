import type { ResourceShape } from "../../resources";
import type { common as enCommon } from "../en/common";

export const common = {
	actions: {
		clear: "清除",
		refresh: "刷新",
		refreshing: "刷新中...",
		refreshingEllipsis: "刷新中...",
		retry: "重试",
	},
	language: {
		label: "语言",
		english: "EN",
		chinese: "中文",
	},
	state: {
		loading: "加载中...",
		none: "无",
		unknown: "未知",
		neverUpdated: "从未更新",
		justNow: "刚刚",
	},
	time: {
		updatedAt: "{{time}}更新",
		updatedDate: "{{date}}更新",
	},
} as const satisfies ResourceShape<typeof enCommon>;
