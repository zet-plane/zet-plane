import { useState } from "react";

export function Legend() {
	const [open, setOpen] = useState(true);

	return (
		<div className="absolute right-3 top-3 z-10 rounded-md border border-border bg-background text-xs shadow-sm">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="block w-full px-2 py-1 text-left font-medium hover:bg-accent"
			>
				{open ? "Legend ▾" : "Legend ▸"}
			</button>
			{open && (
				<div className="space-y-2 border-t border-border p-2">
					<Row
						swatch={
							<span
								className="inline-block h-3 w-3 rounded-sm"
								style={{ background: "var(--zp-status-active)" }}
							/>
						}
						label="Active"
					/>
					<Row
						swatch={
							<span
								className="inline-block h-3 w-3 rounded-sm"
								style={{ background: "var(--zp-status-blocked)" }}
							/>
						}
						label="Blocked"
					/>
					<Row
						swatch={
							<span
								className="inline-block h-3 w-3 rounded-sm"
								style={{ background: "var(--zp-status-completed)" }}
							/>
						}
						label="Completed"
					/>
					<Row
						swatch={
							<span
								className="inline-block h-3 w-3 rounded-sm"
								style={{ background: "var(--zp-status-archived)" }}
							/>
						}
						label="Archived"
					/>
					<hr className="border-border" />
					<Row
						swatch={
							<span className="inline-block h-3 w-6 border-y-2 border-foreground" />
						}
						label="Scaffold (solid border)"
					/>
					<Row
						swatch={
							<span className="inline-block h-3 w-6 border-y-2 border-dashed border-foreground" />
						}
						label="Growth (dashed border)"
					/>
					<hr className="border-border" />
					<Row swatch={<span>⚑</span>} label="Checkpoint" />
					<Row swatch={<span>K3</span>} label="Knowledge entry count" />
				</div>
			)}
		</div>
	);
}

function Row({ swatch, label }: { swatch: React.ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<span className="flex w-5 justify-center">{swatch}</span>
			<span>{label}</span>
		</div>
	);
}
