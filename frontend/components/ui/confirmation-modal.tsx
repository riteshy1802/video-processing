"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "./button";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDeleting?: boolean;
  confirmationText?: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Delete Video",
  cancelText = "Cancel",
  isDeleting = false,
  confirmationText,
}: ConfirmationModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const isConfirmed = !confirmationText || typedConfirmation === confirmationText;

  const handleClose = useCallback(() => {
    if (isDeleting) return;
    setTypedConfirmation("");
    onClose();
  }, [isDeleting, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isDeleting) {
        handleClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isDeleting, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          handleClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 relative overflow-hidden"
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 disabled:opacity-50 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon & Header */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Trash2 className="h-6 w-6" />
          </div>
          <div className="space-y-1.5 pt-0.5">
            <h3 className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
              {description}
            </p>
          </div>
        </div>

        {confirmationText && (
          <div className="space-y-2">
            <label
              htmlFor="delete-confirmation"
              className="block text-xs leading-relaxed text-slate-600 dark:text-slate-400"
            >
              Type <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{confirmationText}</span> to confirm.
            </label>
            <input
              id="delete-confirmation"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmation(event.target.value)}
              disabled={isDeleting}
              className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 font-mono text-xs text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder={confirmationText}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <Button
            variant="outline"
            size="md"
            onClick={handleClose}
            disabled={isDeleting}
          >
            {cancelText}
          </Button>
          <Button
            variant="destructive"
            size="md"
            onClick={onConfirm}
            isLoading={isDeleting}
            disabled={!isConfirmed}
          >
            <Trash2 className="h-4 w-4" />
            <span>{confirmText}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
