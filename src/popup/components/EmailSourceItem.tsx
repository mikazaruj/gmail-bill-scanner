import React from 'react';
import { X } from 'lucide-react';

interface EmailSourceItemProps {
  email: string;
  onRemove: () => void;
}

const EmailSourceItem = ({ email, onRemove }: EmailSourceItemProps) => {
  return (
    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <span className="text-sm text-gray-900">{email}</span>
      <button 
        className="text-gray-400 hover:text-red-500 transition-colors"
        onClick={onRemove}
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default EmailSourceItem; 