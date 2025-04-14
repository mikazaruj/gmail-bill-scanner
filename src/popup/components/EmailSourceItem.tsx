import React, { useState, useRef, useEffect } from 'react';
import { X, Trash2, EyeOff, MoreVertical } from 'lucide-react';

interface EmailSourceItemProps {
  email: string;
  description?: string;
  onRemove: () => void;
  onDelete?: () => void;
}

const EmailSourceItem = ({ email, description, onRemove, onDelete }: EmailSourceItemProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="overflow-hidden">
        <div className="text-sm text-gray-900 truncate">{email}</div>
        {description && <div className="text-xs text-gray-500 truncate">{description}</div>}
      </div>
      
      <div className="relative" ref={menuRef}>
        <button 
          className="text-gray-400 hover:text-gray-700 transition-colors ml-2 flex-shrink-0"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Actions menu"
        >
          <MoreVertical size={14} />
        </button>
        
        {isMenuOpen && (
          <div className="absolute right-0 top-5 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-10">
            <div className="py-1">
              <button
                className="flex items-center w-full px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-100"
                onClick={() => {
                  setIsMenuOpen(false);
                  onRemove();
                }}
              >
                <EyeOff size={12} className="mr-2 text-yellow-500" />
                Remove (hide)
              </button>
              
              {onDelete && (
                <button
                  className="flex items-center w-full px-3 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onDelete();
                  }}
                >
                  <Trash2 size={12} className="mr-2 text-red-500" />
                  Delete permanently
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailSourceItem; 