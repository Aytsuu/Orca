// src/components/islands/ui/Toast.tsx
import React from 'react';
import { useStore } from '@nanostores/react';
import { Check, AlertTriangle, X, Info } from 'lucide-react';
import { toastMessages } from '../../../stores/projectStore';

export const Toast: React.FC = () => {
  const messages = useStore(toastMessages);

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full select-none">
      {messages.map((msg) => {
        let borderClass = 'border-primary';
        let iconNode = <Info className="w-4 h-4 text-primary" />;
        
        if (msg.type === 'success') {
          borderClass = 'border-success';
          iconNode = <Check className="w-4 h-4 text-success" />;
        } else if (msg.type === 'warning') {
          borderClass = 'border-warning';
          iconNode = <AlertTriangle className="w-4 h-4 text-warning" />;
        } else if (msg.type === 'error') {
          borderClass = 'border-error';
          iconNode = <X className="w-4 h-4 text-error" />;
        }

        return (
          <div
            key={msg.id}
            className={`bg-surface-raised border-l-[3px] ${borderClass} rounded-sm px-5 py-3.5 shadow-xl text-sm text-text-primary flex items-start gap-3 fade-up`}
            style={{
              boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'
            }}
          >
            <span className="flex-shrink-0 mt-0.5">
              {iconNode}
            </span>
            <span className="flex-1 font-medium">{msg.text}</span>
          </div>
        );
      })}
    </div>
  );
};
export default Toast;
