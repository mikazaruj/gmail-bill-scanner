import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

interface SettingsFeedbackProps {
  show: boolean;
  onHide?: () => void;
  message?: string;
}

const SettingsFeedback = ({
  show,
  onHide,
  message = 'Settings updated'
}: SettingsFeedbackProps) => {
  const [isVisible, setIsVisible] = useState(show);
  
  // Auto-hide after 2 seconds
  useEffect(() => {
    if (show) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onHide) onHide();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [show, onHide]);
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 flex items-center bg-green-50 border border-green-200 rounded-lg py-1.5 px-3 shadow-md z-50 animate-fade-in">
      <Check size={14} className="text-green-600 mr-1.5" />
      <span className="text-sm text-green-800">{message}</span>
    </div>
  );
};

export default SettingsFeedback; 