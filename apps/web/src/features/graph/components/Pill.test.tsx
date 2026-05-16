import { ReactFlowProvider } from '@xyflow/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pill, type PillData } from './Pill';

const mkData = (overrides: Partial<PillData> = {}): PillData => ({
	node: {
		id: 'n1',
		projectId: 'p',
		isProjectRoot: false,
		role: 'regular',
		type: 'scaffold',
		title: 'Ship v1',
		description: null,
		status: 'active',
		isCheckpoint: false,
		checkpointResolution: null,
		createdBy: 'human',
		createdAt: '2026-05-16T00:00:00.000Z',
		updatedAt: '2026-05-16T00:00:00.000Z',
	},
	aggregation: undefined,
	knowledgeCount: 0,
	childCount: 0,
	selected: false,
	dimmed: false,
	...overrides,
});

function renderPill(data: PillData) {
	return render(
		<ReactFlowProvider>
			<Pill
				id="n1"
				data={data}
				type="pill"
				selected={data.selected}
				positionAbsoluteX={0}
				positionAbsoluteY={0}
				dragging={false}
				draggable={false}
				selectable={false}
				deletable={false}
				isConnectable={false}
				zIndex={0}
			/>
		</ReactFlowProvider>,
	);
}

describe('Pill', () => {
	it('renders the title', () => {
		renderPill(mkData());
		expect(screen.getByText('Ship v1')).toBeInTheDocument();
	});

	it('shows knowledge chip when knowledgeCount > 0', () => {
		renderPill(mkData({ knowledgeCount: 3 }));
		expect(screen.getByText('K3')).toBeInTheDocument();
	});

	it('does NOT show knowledge chip when knowledgeCount = 0', () => {
		renderPill(mkData());
		expect(screen.queryByText(/^K\d+$/)).toBeNull();
	});

	it('shows dive-in glyph when childCount > 0', () => {
		renderPill(mkData({ childCount: 5 }));
		expect(screen.getByText('↳5')).toBeInTheDocument();
	});

	it('does NOT show dive-in glyph when childCount = 0', () => {
		renderPill(mkData());
		expect(screen.queryByText(/^↳\d+$/)).toBeNull();
	});

	it('applies scaffold class when type=scaffold', () => {
		const { container } = renderPill(mkData());
		expect(container.querySelector('.zp-pill--scaffold')).not.toBeNull();
	});

	it('applies growth class when type=growth', () => {
		const data = mkData();
		data.node = { ...data.node, type: 'growth' };
		const { container } = renderPill(data);
		expect(container.querySelector('.zp-pill--growth')).not.toBeNull();
	});

	it('applies checkpoint class on scaffold pill when isCheckpoint=true', () => {
		const data = mkData();
		data.node = { ...data.node, isCheckpoint: true };
		const { container } = renderPill(data);
		expect(container.querySelector('.zp-pill--checkpoint')).not.toBeNull();
	});
});
