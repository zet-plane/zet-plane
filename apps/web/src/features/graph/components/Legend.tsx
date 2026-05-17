import { useState } from 'react';

export function Legend() {
	const [open, setOpen] = useState(true);

	return (
		<div className="absolute right-3 bottom-3 z-10 rounded-md border border-border bg-background text-xs shadow-sm">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="block w-full px-2 py-1 text-left font-medium hover:bg-accent"
			>
				{open ? 'Legend ▾' : 'Legend ▸'}
			</button>
			{open && (
				<div className="space-y-2 border-t border-border p-2">
					<Row label="Active" swatch={<Swatch color="var(--zp-status-active)" />} />
					<Row label="Blocked" swatch={<Swatch color="var(--zp-status-blocked)" />} />
					<Row label="Completed" swatch={<Swatch color="var(--zp-status-completed)" />} />
					<Row label="Archived" swatch={<Swatch color="var(--zp-status-archived)" />} />
					<hr className="border-border" />
					<Row label="Scaffold (flag-tab)" swatch={<ScaffoldGlyph />} />
					<Row label="Growth (compact)" swatch={<GrowthGlyph />} />
					<Row label="Knowledge (violet)" swatch={<KnowledgeGlyph />} />
					<hr className="border-border" />
					<Row label="Checkpoint" swatch={<span>⚑</span>} />
					<Row label="Dive in" swatch={<span>↳N</span>} />
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
	return <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />;
}
function ScaffoldGlyph() {
	return (
		<span
			className="inline-block h-3 w-5 rounded-full"
			style={{
				background: 'var(--zp-status-active-bg)',
				borderLeft: '3px solid var(--zp-accent-scaffold)',
			}}
		/>
	);
}
function GrowthGlyph() {
	return (
		<span
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: 'var(--zp-status-active-bg)' }}
		/>
	);
}
function KnowledgeGlyph() {
	return (
		<span
			className="inline-block h-2 w-5 rounded-full"
			style={{ background: 'rgba(166, 123, 216, 0.35)' }}
		/>
	);
}
