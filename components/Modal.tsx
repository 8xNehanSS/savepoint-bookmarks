"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./Icon";

/** A native <dialog>, open while mounted. Esc, the close button and backdrop clicks all call onClose. */
export default function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onClose={onClose}
      onMouseDown={(e) => e.target === ref.current && ref.current.close()}
    >
      <div className="modal-inner">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => ref.current?.close()} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
