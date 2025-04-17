import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: JSX.Element | JSX.Element[];
  defaultOpen?: boolean;
}

const CollapsibleSection = ({ title, children, defaultOpen = false }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);
  
  const handleToggle = () => {
    console.log(`CollapsibleSection ${title}: toggling from ${isOpen} to ${!isOpen}`);
    setIsOpen(!isOpen);
  };
  
  return (
    <div className="collapsible-section">
      <div 
        onClick={handleToggle}
        className="collapsible-header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
      >
        <span className="collapsible-title">{title}</span>
        {isOpen ? (
          <ChevronUp size={18} className="text-gray-500" />
        ) : (
          <ChevronDown size={18} className="text-gray-500" />
        )}
      </div>
      {isOpen && (
        <div className="collapsible-content">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection; 