import { ChevronRight } from 'lucide-react';
import type { BreadcrumbSegment } from '../domain/breadcrumb';

type Props = {
	segments: BreadcrumbSegment[];
	onSegmentClick: (id: string | null) => void;
};

export function Breadcrumb({ segments, onSegmentClick }: Props) {
	return (
		<nav className="zp-breadcrumb" aria-label="Canvas breadcrumb">
			{segments.map((seg, i) => {
				const isLast = i === segments.length - 1;
				return (
					<span key={seg.id} className="zp-breadcrumb__item">
						<button
							type="button"
							className={
								isLast
									? 'zp-breadcrumb__seg zp-breadcrumb__seg--current'
									: 'zp-breadcrumb__seg'
							}
							onClick={() => onSegmentClick(seg.isRoot ? null : seg.id)}
							disabled={isLast}
							aria-current={isLast ? 'page' : undefined}
						>
							{seg.title}
						</button>
						{!isLast && <ChevronRight size={12} className="zp-breadcrumb__sep" />}
					</span>
				);
			})}
		</nav>
	);
}
