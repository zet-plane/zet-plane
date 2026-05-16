import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'zp.graph.showKnowledge';

function read(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

function write(value: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
	} catch {
		/* ignore */
	}
}

export function useKnowledgeToggle(): {
	visible: boolean;
	toggle: () => void;
	set: (value: boolean) => void;
} {
	const [visible, setVisible] = useState<boolean>(() => read());

	useEffect(() => {
		write(visible);
	}, [visible]);

	const toggle = useCallback(() => setVisible((v) => !v), []);
	const set = useCallback((v: boolean) => setVisible(v), []);

	return { visible, toggle, set };
}
