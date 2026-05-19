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
				aria-expanded={open}
				aria-controls="zp-graph-legend-panel"
			>
				{open ? t("legend.titleOpen") : t("legend.titleClosed")}
			</button>
			{open && (
				<div
					id="zp-graph-legend-panel"
					className="space-y-2 border-t border-border p-2"
				>
					<Row
						label={t("status.active")}
						swatch={
							<Swatch
								color="var(--zp-status-active)"
								testId="legend-swatch-active"
							/>
						}
					/>
					<Row
						label={t("status.blocked")}
						swatch={
							<Swatch
								color="var(--zp-status-blocked)"
								testId="legend-swatch-blocked"
							/>
						}
					/>
					<Row
						label={t("status.completed")}
						swatch={
							<Swatch
								color="var(--zp-status-completed)"
								testId="legend-swatch-completed"
							/>
						}
					/>
					<Row
						label={t("status.archived")}
						swatch={
							<Swatch
								color="var(--zp-status-archived)"
								testId="legend-swatch-archived"
							/>
						}
					/>
					<hr className="border-border" />
					<Row
						label={t("legend.scaffold")}
						swatch={<ScaffoldGlyph testId="legend-glyph-scaffold" />}
					/>
					<Row
						label={t("legend.growth")}
						swatch={<GrowthGlyph testId="legend-glyph-growth" />}
					/>
					<Row
						label={t("legend.knowledge")}
						swatch={<KnowledgeGlyph testId="legend-glyph-knowledge" />}
					/>
					<hr className="border-border" />
					<Row
						label={t("legend.checkpoint")}
						swatch={<span aria-hidden="true">⚑</span>}
					/>
					<Row
						label={t("legend.diveIn")}
						swatch={<span aria-hidden="true">↳N</span>}
					/>
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
function Swatch({ color, testId }: { color: string; testId?: string }) {
	return (
		<span
			data-testid={testId}
			aria-hidden="true"
			className="inline-block h-3 w-3 rounded-sm"
			style={{ background: color }}
		/>
	);
}
function ScaffoldGlyph({ testId }: { testId?: string }) {
	return (
		<span
			data-testid={testId}
			aria-hidden="true"
			className="inline-block h-3 w-5 rounded-full"
			style={{
				background: "var(--zp-color-accent-signal-soft)",
				borderLeftWidth: "3px",
				borderLeftStyle: "solid",
				borderLeftColor: "var(--zp-accent-scaffold)",
			}}
		/>
	);
}
function GrowthGlyph({ testId }: { testId?: string }) {
	return (
		<span
			data-testid={testId}
			aria-hidden="true"
			className="inline-block h-2 w-5 rounded-full"
			style={{
				background: "var(--zp-color-accent-signal-soft)",
				borderLeftWidth: "3px",
				borderLeftStyle: "solid",
				borderLeftColor: "var(--zp-accent-growth)",
			}}
		/>
	);
}
function KnowledgeGlyph({ testId }: { testId?: string }) {
	return (
		<span
			data-testid={testId}
			aria-hidden="true"
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: "var(--zp-color-semantic-knowledge-soft)" }}
		/>
	);
}
