import React from 'react';
import { User, Check } from 'lucide-react';
import CollapsibleSection from '../components/CollapsibleSection';
import { useAuth } from '../hooks/useAuth';

interface ProfileProps {
  onNavigate: (tab: string) => void;
}

const Profile = ({ onNavigate }: ProfileProps) => {
  const { userProfile, logout } = useAuth();
  
  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="space-y-3">
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          {userProfile.avatar ? (
            <img src={userProfile.avatar} alt="Profile" className="w-12 h-12 rounded-full object-cover border-2 border-gray-200" />
          ) : (
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <User size={24} />
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-900">{userProfile.name || 'User Name'}</h2>
            <p className="text-gray-600">{userProfile.email || 'user@example.com'}</p>
          </div>
        </div>
      </div>
      
      <CollapsibleSection title="Account Details" defaultOpen={true}>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Account Type</span>
            <span className="text-sm font-medium">Free Plan</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Usage</span>
            <span className="text-sm font-medium">23/50 scans</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Joined</span>
            <span className="text-sm font-medium">March 12, 2023</span>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Subscription" defaultOpen={true}>
        <div>
          <div className="bg-blue-50 p-3 rounded-lg mb-2 border border-blue-100">
            <div className="text-sm font-medium text-blue-900 mb-1">Free Plan</div>
            <p className="text-xs text-blue-700 mb-2">Access to basic scanning features</p>
            <ul className="text-xs space-y-1 text-blue-800 mb-2">
              <li className="flex items-center">
                <Check size={10} className="mr-1 flex-shrink-0" />
                <span>Up to 50 emails per month</span>
              </li>
              <li className="flex items-center">
                <Check size={10} className="mr-1 flex-shrink-0" />
                <span>Basic data extraction</span>
              </li>
              <li className="flex items-center">
                <Check size={10} className="mr-1 flex-shrink-0" />
                <span>Google Sheets export</span>
              </li>
            </ul>
            <button className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </CollapsibleSection>
      
      <div className="space-y-2">
        <button 
          onClick={handleLogout}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Sign Out
        </button>
        
        <button 
          onClick={() => onNavigate('dashboard')}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default Profile; 