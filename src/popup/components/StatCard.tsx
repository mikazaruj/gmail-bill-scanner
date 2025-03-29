import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  bgColor: string;
  iconColor: string;
  textColor: string;
  subtitleColor: string;
  borderColor: string;
}

const StatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  bgColor,
  iconColor,
  textColor,
  subtitleColor,
  borderColor
}: StatCardProps) => {
  return (
    <div className={`${bgColor} p-2 rounded-lg border ${borderColor}`}>
      <div className="flex items-center mb-1">
        <Icon size={12} className={`${iconColor} mr-1`} />
        <span className="text-xs text-gray-500">{title}</span>
      </div>
      <div className={`text-base font-bold ${textColor}`}>{value}</div>
      <div className={`text-xs ${subtitleColor}`}>{subtitle}</div>
    </div>
  );
};

export default StatCard; 