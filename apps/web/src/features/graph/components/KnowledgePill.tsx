type Props = {
	title: string;
	category: 'decision' | 'pitfall' | 'finding' | 'context';
};

export function KnowledgePill({ title, category }: Props) {
	return (
		<div className="zp-pill zp-pill--knowledge">
			<span className="zp-pill__title">{title}</span>
			<span className="zp-pill__chip">{category[0].toUpperCase()}</span>
		</div>
	);
}
