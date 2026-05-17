import { BookOpen, BookOpenCheck } from 'lucide-react';

type Props = {
	visible: boolean;
	onToggle: () => void;
};

export function KnowledgeToggle({ visible, onToggle }: Props) {
	return (
		<button
			type="button"
			className="zp-chrome-toggle"
			onClick={onToggle}
			aria-pressed={visible}
			title={visible ? 'Hide knowledge' : 'Show knowledge'}
		>
			{visible ? <BookOpenCheck size={14} /> : <BookOpen size={14} />}
			<span>Knowledge</span>
		</button>
	);
}
