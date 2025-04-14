import React from 'react';
import { AlertTriangle, X, Trash2, EyeOff } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  email: string;
  isDelete?: boolean;
}

const ConfirmDeleteModal = ({ isOpen, onClose, onConfirm, email, isDelete = false }: ConfirmDeleteModalProps) => {
  if (!isOpen) return null;

  const title = isDelete ? "Confirm Permanent Deletion" : "Confirm Removal";
  const description = isDelete 
    ? `Are you sure you want to permanently delete ${email} from your trusted sources? This action cannot be undone.`
    : `Are you sure you want to remove ${email} from your trusted sources? You can add it back later if needed.`;
  const confirmText = isDelete ? "Delete Forever" : "Remove";
  const confirmClass = isDelete 
    ? "flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors"
    : "flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors";
  const icon = isDelete ? <Trash2 size={18} /> : <EyeOff size={18} />;
  const iconColor = isDelete ? "text-red-600" : "text-yellow-600";
  const alertText = isDelete ? "Permanent Deletion" : "Remove Trusted Source";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-4 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className={`flex items-center gap-2 ${iconColor}`}>
            {icon}
            <span className="font-medium">{alertText}</span>
          </div>
          
          <p className="text-gray-700 text-sm">
            {description}
          </p>
          
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={confirmClass}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal; 