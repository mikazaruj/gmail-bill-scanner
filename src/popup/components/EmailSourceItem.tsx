import React from 'react';
import { X } from 'lucide-react';

interface EmailSourceItemProps {
  email: string;
  description?: string;
  onRemove: () => void;
}

const EmailSourceItem = ({ email, description, onRemove }: EmailSourceItemProps) => {
  return (
    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="overflow-hidden">
        <div className="text-sm text-gray-900 truncate">{email}</div>
        {description && <div className="text-xs text-gray-500 truncate">{description}</div>}
      </div>
      <button 
        className="text-gray-400 hover:text-red-500 transition-colors ml-2 flex-shrink-0"
        onClick={onRemove}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default EmailSourceItem; 