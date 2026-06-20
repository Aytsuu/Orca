// src/components/islands/ui/Modal.tsx
import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
  isWarning?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-[520px]',
  isWarning = false,
  className = ''
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 select-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className={`relative w-full ${maxWidthClass} bg-surface-raised border border-border rounded-2xl shadow-2xl p-8 flex flex-col gap-6 pop-in z-10 ${className}`}
        style={{
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.8)'
        }}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2">
              {isWarning && <AlertTriangle className="w-4 h-4 text-warning shrink-0" />}
              <h3 className="section-label font-bold text-text-primary text-sm tracking-widest uppercase">
                {title}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors flex items-center justify-center"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="text-text-secondary text-md leading-relaxed">{children}</div>
      </div>
    </div>
  );
};
export default Modal;
