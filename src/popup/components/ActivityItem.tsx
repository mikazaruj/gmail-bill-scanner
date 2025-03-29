import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ActivityItemProps {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
  timestamp: string;
}

const ActivityItem = ({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  timestamp
}: ActivityItemProps) => {
  return (
    <div className="p-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="flex justify-between items-start">
        <div className="flex">
          <Icon size={14} className={`${iconColor} mr-1.5 mt-0.5`} />
          <div>
            <div className="text-sm font-medium text-gray-900">{title}</div>
            <div className="text-xs text-gray-500">{subtitle}</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">{timestamp}</div>
      </div>
    </div>
  );
};

export default ActivityItem; 