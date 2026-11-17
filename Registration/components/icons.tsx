const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Check = () => <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>;
export const Chev = () => <svg {...p}><path d="m9 6 6 6-6 6" /></svg>;
export const Back = () => <svg {...p}><path d="m15 6-6 6 6 6" /></svg>;
export const Search = () => <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const Plus = () => <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const Undo = () => <svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;
export const Out = () => <svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>;
