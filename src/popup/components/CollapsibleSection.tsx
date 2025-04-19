import * as React from 'react';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  children, 
  defaultOpen = false 
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);
  
  const handleToggle = () => {
    console.log(`CollapsibleSection ${title}: toggling from ${isOpen} to ${!isOpen}`);
    setIsOpen(!isOpen);
  };
  
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-3">
      <div 
        onClick={handleToggle}
        className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
      >
        <span className="font-medium text-sm text-gray-900">{title}</span>
        {isOpen ? (
          <ChevronUp size={18} className="text-gray-500" />
        ) : (
          <ChevronDown size={18} className="text-gray-500" />
        )}
      </div>
      {isOpen && (
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection; 