import type { ResourceShape } from "../../resources";
import type { projects as enProjects } from "../en/projects";

export const projects = {
	list: {
		title: "项目",
		loading: "正在加载项目...",
		error: "项目加载失败：{{message}}",
		empty: "还没有项目。",
	},
	shell: {
		collapseSidebar: "收起侧边栏",
		expandSidebar: "展开侧边栏",
		projects: "项目",
		graph: "图谱",
	},
	switcher: {
		label: "项目",
	},
} as const satisfies ResourceShape<typeof enProjects>;
