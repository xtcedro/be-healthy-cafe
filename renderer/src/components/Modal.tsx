import type { ReactNode } from "react";

export function Modal(
  { title, children, onClose }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
  },
) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white text-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-pos-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-200 px-4 py-2 text-pos-base font-bold hover:bg-slate-300"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
