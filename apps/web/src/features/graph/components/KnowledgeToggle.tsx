import { BookOpen, BookOpenCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
	visible: boolean;
	onToggle: () => void;
};

export function KnowledgeToggle({ visible, onToggle }: Props) {
	const { t } = useTranslation("graph");

	return (
		<button
			type="button"
			className="zp-chrome-toggle"
			onClick={onToggle}
			aria-pressed={visible}
			title={visible ? t("knowledge.hide") : t("knowledge.show")}
		>
			{visible ? <BookOpenCheck size={14} /> : <BookOpen size={14} />}
			<span>{t("knowledge.label")}</span>
		</button>
	);
}
