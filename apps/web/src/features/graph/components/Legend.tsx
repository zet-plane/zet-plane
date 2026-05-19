import { useState } from "react";
import { useTranslation } from "react-i18next";

export function Legend() {
	const [open, setOpen] = useState(false);
	const { t } = useTranslation("graph");

	return (
		<div className="absolute right-3 bottom-3 z-10 rounded-md border border-border bg-background text-xs shadow-sm">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="block w-full px-2 py-1 text-left font-medium hover:bg-accent"
			>
				{open ? t("legend.titleOpen") : t("legend.titleClosed")}
			</button>
			{open && (
				<div className="space-y-2 border-t border-border p-2">
					<Row
						label={t("status.active")}
						swatch={<Swatch color="var(--zp-status-active)" />}
					/>
					<Row
						label={t("status.blocked")}
						swatch={<Swatch color="var(--zp-status-blocked)" />}
					/>
					<Row
						label={t("status.completed")}
						swatch={<Swatch color="var(--zp-status-completed)" />}
					/>
					<Row
						label={t("status.archived")}
						swatch={<Swatch color="var(--zp-status-archived)" />}
					/>
					<hr className="border-border" />
					<Row label={t("legend.scaffold")} swatch={<ScaffoldGlyph />} />
					<Row label={t("legend.growth")} swatch={<GrowthGlyph />} />
					<Row label={t("legend.knowledge")} swatch={<KnowledgeGlyph />} />
					<hr className="border-border" />
					<Row label={t("legend.checkpoint")} swatch={<span>⚑</span>} />
					<Row label={t("legend.diveIn")} swatch={<span>↳N</span>} />
				</div>
			)}
		</div>
	);
}

function Row({ swatch, label }: { swatch: React.ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<span className="flex w-6 justify-center">{swatch}</span>
			<span>{label}</span>
		</div>
	);
}
function Swatch({ color }: { color: string }) {
	return (
		<span
			className="inline-block h-3 w-3 rounded-sm"
			style={{ background: color }}
		/>
	);
}
function ScaffoldGlyph() {
	return (
		<span
			className="inline-block h-3 w-5 rounded-full"
			style={{
				background: "var(--zp-status-active-bg)",
				borderLeft: "3px solid var(--zp-accent-scaffold)",
			}}
		/>
	);
}
function GrowthGlyph() {
	return (
		<span
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: "var(--zp-status-active-bg)" }}
		/>
	);
}
function KnowledgeGlyph() {
	return (
		<span
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: "rgba(166, 123, 216, 0.35)" }}
		/>
	);
}
