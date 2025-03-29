import React from 'react';
import { BarChart2, Clock, RefreshCcw, FileSpreadsheet, Check, AlertTriangle, PieChart, Calendar } from 'lucide-react';
import CollapsibleSection from '../components/CollapsibleSection';
import StatCard from '../components/StatCard';
import ActivityItem from '../components/ActivityItem';
import { useScan } from '../hooks/useScan';
import { useSettings } from '../hooks/useSettings';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

const Dashboard = ({ onNavigate }: DashboardProps) => {
  const { 
    scanStatus, 
    scanResults, 
    dashboardStats, 
    exportInProgress, 
    startScan, 
    exportToSheets 
  } = useScan();
  
  const { settings } = useSettings();
  
  const handleScan = async () => {
    await startScan(settings);
  };
  
  const handleExport = async () => {
    await exportToSheets();
  };

  return (
    <div className="dashboard-container">
      {/* Stats Dashboard */}
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Dashboard</h2>
          <div className="flex items-center text-xs text-gray-500">
            <Clock size={12} className="mr-1" />
            <span>Last run: 2d ago</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatCard
            title="Success Rate"
            value="96%"
            subtitle={`${dashboardStats.processed} emails processed`}
            icon={BarChart2}
            bgColor="bg-blue-50"
            iconColor="text-blue-600"
            textColor="text-blue-900"
            subtitleColor="text-blue-700"
            borderColor="border-blue-100"
          />
          
          <StatCard
            title="Time Saved"
            value="3.7 hrs"
            subtitle={`${dashboardStats.billsFound} bills extracted`}
            icon={Clock}
            bgColor="bg-green-50"
            iconColor="text-green-600"
            textColor="text-green-900"
            subtitleColor="text-green-700"
            borderColor="border-green-100"
          />
          
          <StatCard
            title="This Month"
            value="5.6 hrs"
            subtitle="total time saved"
            icon={PieChart}
            bgColor="bg-indigo-50"
            iconColor="text-indigo-600"
            textColor="text-indigo-900"
            subtitleColor="text-indigo-700"
            borderColor="border-indigo-100"
          />
          
          <StatCard
            title="Per Bill"
            value="2.4 min"
            subtitle="avg. time saved"
            icon={Calendar}
            bgColor="bg-amber-50"
            iconColor="text-amber-600"
            textColor="text-amber-900"
            subtitleColor="text-amber-700"
            borderColor="border-amber-100"
          />
        </div>
        
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600" style={{ width: '96%' }}></div>
        </div>
      </div>
      
      {/* Recent Activity */}
      <CollapsibleSection title="Recent Activity" defaultOpen={true}>
        <div className="space-y-1.5">
          <ActivityItem
            icon={Check}
            iconColor="text-green-500"
            title={`Auto-processed ${dashboardStats.processed} emails`}
            subtitle={`${dashboardStats.billsFound} bills found, ${dashboardStats.errors} errors`}
            timestamp="2d ago"
          />
          
          {dashboardStats.errors > 0 && (
            <ActivityItem
              icon={AlertTriangle}
              iconColor="text-amber-500"
              title={`${dashboardStats.errors} extraction failures`}
              subtitle="Format not recognized"
              timestamp="2d ago"
            />
          )}
        </div>
      </CollapsibleSection>
      
      <button 
        onClick={handleScan}
        disabled={scanStatus === 'scanning' || exportInProgress}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
      >
        <RefreshCcw size={14} className="mr-2" />
        {scanStatus === 'scanning' ? 'Scanning...' : 'Run Manual Processing'}
      </button>
      
      {scanResults.length > 0 && (
        <button
          onClick={handleExport}
          disabled={exportInProgress}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          <FileSpreadsheet size={14} className="mr-2" />
          Export to Sheets
        </button>
      )}
    </div>
  );
};

export default Dashboard; 