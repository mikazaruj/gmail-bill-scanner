import React, { useContext } from 'react';
import { BarChart2, Clock, RefreshCcw, FileSpreadsheet, Check, AlertTriangle, PieChart, Calendar } from 'lucide-react';
import CollapsibleSection from '../components/CollapsibleSection';
import StatCard from '../components/StatCard';
import ActivityItem from '../components/ActivityItem';
import { ScanContext } from '../context/ScanContext';
import { useSettings } from '../hooks/useSettings';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

const Dashboard = ({ onNavigate }: DashboardProps) => {
  const context = useContext(ScanContext);
  
  const { 
    scanStatus, 
    scanResults, 
    dashboardStats, 
    exportInProgress, 
    startScan, 
    exportToSheets,
    lastProcessedAt,
    successRate,
    timeSaved
  } = context;
  
  // Add console logging to see what values we're getting
  console.log('Dashboard values:', {
    dashboardStats,
    successRate,
    timeSaved,
    lastProcessedAt
  });
  
  // Override values if no processed items (temporary solution until we fix the data flow)
  const displaySuccessRate = dashboardStats.processed === 0 ? 0 : successRate;
  const displayTimeSaved = dashboardStats.billsFound === 0 ? 0 : timeSaved;
  
  // Log the display values
  console.log('Display values:', {
    displaySuccessRate,
    displayTimeSaved,
    processed: dashboardStats.processed,
    billsFound: dashboardStats.billsFound
  });
  
  const { settings } = useSettings();
  
  const handleScan = async () => {
    await startScan(settings);
  };
  
  const handleExport = async () => {
    await exportToSheets();
  };

  // Format the last processed time
  const formatLastProcessedTime = () => {
    if (!lastProcessedAt) return 'Never';
    
    const now = new Date();
    const lastProcessed = new Date(lastProcessedAt);
    const diffMs = now.getTime() - lastProcessed.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return `${diffMinutes}m ago`;
      }
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return `${diffDays}d ago`;
    }
  };

  return (
    <div className="dashboard-container">
      {/* Stats Dashboard */}
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Dashboard</h2>
          <div className="flex items-center text-xs text-gray-500">
            <Clock size={12} className="mr-1" />
            <span>Last run: {formatLastProcessedTime()}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatCard
            title="Success Rate"
            value={`${displaySuccessRate}%`}
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
            value={`${displayTimeSaved} hrs`}
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
            value={`${displayTimeSaved} hrs`}
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
            value={dashboardStats.billsFound > 0 ? "2.4 min" : "0 min"}
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
          <div className="h-full bg-blue-600" style={{ width: `${displaySuccessRate}%` }}></div>
        </div>
      </div>
      
      {/* Recent Activity */}
      <CollapsibleSection title="Recent Activity" defaultOpen={true}>
        <div className="space-y-1.5">
          {dashboardStats.processed > 0 ? (
            <>
              <ActivityItem
                icon={Check}
                iconColor="text-green-500"
                title={`Auto-processed ${dashboardStats.processed} emails`}
                subtitle={`${dashboardStats.billsFound} bills found, ${dashboardStats.errors} errors`}
                timestamp={formatLastProcessedTime()}
              />
              
              {dashboardStats.errors > 0 && (
                <ActivityItem
                  icon={AlertTriangle}
                  iconColor="text-amber-500"
                  title={`${dashboardStats.errors} extraction failures`}
                  subtitle="Format not recognized"
                  timestamp={formatLastProcessedTime()}
                />
              )}
            </>
          ) : (
            <div className="text-sm text-gray-500 text-center py-2">
              No processing activity yet. Run your first scan to extract bills.
            </div>
          )}
        </div>
      </CollapsibleSection>
      
      <button 
        onClick={handleScan}
        disabled={scanStatus === 'scanning' || exportInProgress}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
      >
        <RefreshCcw size={14} className="mr-2" />
        {scanStatus === 'scanning' ? 'Scanning...' : dashboardStats.processed === 0 ? 'Run First Scan' : 'Run Manual Processing'}
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