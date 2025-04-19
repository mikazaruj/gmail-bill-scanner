import React, { useEffect, useState } from 'react';
// Fix the Lucide imports - use a dynamic import approach
import CollapsibleSection from '../components/CollapsibleSection';
import { useAuth } from '../hooks/useAuth';
// Import the UserProfile type to make sure we're using the correct definition
import { UserProfile } from '../../types/Message';

// Import icons (handle missing types)
let User: any;
let Check: any;
try {
  const LucideIcons = require('lucide-react');
  User = LucideIcons.User;
  Check = LucideIcons.Check;
} catch (e) {
  console.error('Failed to load Lucide icons:', e);
  // Fallback icons (simple div elements)
  User = () => <div>👤</div>;
  Check = () => <div>✓</div>;
}

interface ProfileProps {
  onNavigate: (tab: string) => void;
}

interface UserData {
  plan: string;
  quotaUsed: number;
  quotaTotal: number;
  joinedDate: string;
  displayName: string;
  avatarUrl: string | null;
  trialEndsAt?: string | null;
  subscriptionStatus?: string;
  totalProcessedItems?: number;
  successfulItems?: number;
}

const Profile = ({ onNavigate }: ProfileProps) => {
  // Get user profile from auth context with null protection
  const authResult = useAuth();
  const userProfile = authResult?.userProfile as UserProfile | null;
  const logout = authResult?.logout || (async () => {
    console.error('Logout function not available');
  });
  
  // Debug log to check auth context values
  console.log('Auth context userProfile:', userProfile);
  console.log('Auth context userProfile keys:', userProfile ? Object.keys(userProfile) : 'null');
  
  const [userData, setUserData] = useState<UserData>({
    plan: 'Free', 
    quotaUsed: 0,
    quotaTotal: 50,
    joinedDate: '',
    displayName: userProfile?.email?.split('@')[0] ?? 'User Name',
    avatarUrl: userProfile?.avatar_url ?? null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageData, setStorageData] = useState<any>(null);
  
  // Function to load all storage data for debugging
  const loadStorageData = async () => {
    try {
      // Get all data from chrome.storage.local
      const localData = await chrome.storage.local.get(null);
      
      // Format the data for display
      setStorageData({
        local: localData
      });
      
      console.log('Storage data loaded:', localData);
    } catch (err) {
      console.error('Error loading storage data:', err);
    }
  };
  
  useEffect(() => {
    // Load storage data on component mount
    loadStorageData();
  }, []);
  
  useEffect(() => {
    // Fetch user data from background script
    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('Fetching user stats...');
        // Get data from user_stats view
        const statsResponse = await chrome.runtime.sendMessage({ 
          type: 'GET_USER_STATS'
        });
        
        console.log('User stats response:', statsResponse);
        
        if (!statsResponse?.success || !statsResponse.userData) {
          console.error('Failed to fetch user stats:', statsResponse?.error || 'No data returned');
          setError(statsResponse?.error || 'Failed to load user statistics');
          
          // Fall back to userProfile from auth context
          if (userProfile) {
            console.log('Falling back to auth context profile');
            setUserData(prevData => ({
              ...prevData,
              displayName: userProfile?.email?.split('@')[0] ?? 'User Name',
              avatarUrl: userProfile?.avatar_url ?? null
            }));
          }
          
          setIsLoading(false);
          return;
        }
        
        // For debugging - log the raw data
        console.log('User stats raw data:', statsResponse.userData);
        
        // Update user data with stats from response
        const statsData = statsResponse.userData;
        const updatedUserData = {
          plan: statsData.plan || 'Free',
          quotaUsed: statsData.quota_bills_used || 0,
          quotaTotal: statsData.quota_bills_monthly || 50,
          joinedDate: formatDate(statsData.joined_date || statsData.created_at) || 'Not available',
          displayName: statsData.display_name || (userProfile?.email?.split('@')[0] ?? 'User Name'),
          avatarUrl: statsData.avatar_url || (userProfile?.avatar_url ?? null),
          trialEndsAt: statsData.trial_end ? formatDate(statsData.trial_end) : null,
          subscriptionStatus: statsData.subscription_status || 'free',
          totalProcessedItems: statsData.total_items ?? 0,
          successfulItems: statsData.successful_items ?? 0
        };
        
        console.log('Setting user data:', updatedUserData);
        setUserData(updatedUserData);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setError('Failed to load profile data. Please try again.');
        
        // Fall back to userProfile from auth context if available
        if (userProfile) {
          setUserData(prevData => ({
            ...prevData,
            displayName: userProfile?.email?.split('@')[0] ?? 'User Name',
            avatarUrl: userProfile?.avatar_url ?? null
          }));
        }
        
        setIsLoading(false);
      }
    };
    
    // Only fetch if user is authenticated
    if (userProfile && userProfile.email) {
      fetchUserData();
    } else {
      setIsLoading(false);
    }
  }, [userProfile]);
  
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (e) {
      console.error('Error formatting date:', e);
      return dateString.toString();
    }
  };

  const handleLogout = async () => {
    await logout();
  };
  
  // For debugging - refresh data from server
  const refreshData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await chrome.runtime.sendMessage({ type: 'PING' });
      console.log('Background service health check:', response);
      
      // Retry fetching data
      const statsResponse = await chrome.runtime.sendMessage({ 
        type: 'GET_USER_STATS'
      });
      
      if (!statsResponse?.success || !statsResponse.userData) {
        setError('Failed to refresh data: ' + (statsResponse?.error || 'No data returned'));
        setIsLoading(false);
        return;
      }
      
      // Update data
      const statsData = statsResponse.userData;
      const updatedUserData = {
        plan: statsData.plan || 'Free',
        quotaUsed: statsData.quota_bills_used || 0,
        quotaTotal: statsData.quota_bills_monthly || 50,
        joinedDate: formatDate(statsData.joined_date || statsData.created_at) || 'Not available',
        displayName: statsData.display_name || (userProfile?.email?.split('@')[0] ?? 'User Name'),
        avatarUrl: statsData.avatar_url || (userProfile?.avatar_url ?? null),
        trialEndsAt: statsData.trial_end ? formatDate(statsData.trial_end) : null,
        subscriptionStatus: statsData.subscription_status || 'free',
        totalProcessedItems: statsData.total_items ?? 0,
        successfulItems: statsData.successful_items ?? 0
      };
      
      setUserData(updatedUserData);
    } catch (err) {
      setError('Refresh failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Add debug function to inspect avatar URLs
  const debugAvatarUrl = (userData: any, userProfile: any) => {
    console.log('Avatar URL Debug:');
    console.log('- userData.avatarUrl:', userData?.avatarUrl);
    console.log('- userProfile.avatar_url:', userProfile?.avatar_url);
    console.log('- userProfile object:', userProfile);
    
    if (userData.avatarUrl) {
      console.log('Avatar URL is set to:', userData.avatarUrl);
    } else {
      console.log('Avatar URL is null or undefined');
    }
  };

  // If userProfile is not available, show a message
  if (!userProfile) {
    return (
      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 text-yellow-700">
        <p className="font-medium mb-2">Not signed in</p>
        <p className="text-sm">Please sign in to access your profile</p>
        <button 
          onClick={() => onNavigate('dashboard')}
          className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="spinner"></div>
        <span className="ml-2 text-gray-600">Loading profile...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-red-700">
        <p className="font-medium mb-2">Error loading profile</p>
        <p className="text-sm">{error}</p>
        <div className="flex gap-2 mt-4">
          <button 
            onClick={refreshData}
            className="flex-1 bg-red-100 hover:bg-red-200 text-red-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
          >
            Retry
          </button>
          <button 
            onClick={() => onNavigate('dashboard')}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Call debug function to inspect avatar URLs */}
      {debugAvatarUrl(userData, userProfile)}
      
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          {userData.avatarUrl ? (
            <img 
              src={userData.avatarUrl} 
              alt="Profile" 
              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200" 
              onError={(e) => {
                console.error('Failed to load avatar image');
                console.error('Attempted to load URL:', userData.avatarUrl);
                e.currentTarget.onerror = null;
                e.currentTarget.style.display = 'none';
                // Show fallback icon
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const fallback = document.createElement('div');
                  fallback.className = "w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600";
                  fallback.innerHTML = '<div style="font-size: 24px;">👤</div>';
                  parent.appendChild(fallback);
                }
              }}
            />
          ) : (
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              {typeof User === 'function' ? <User size={24} /> : <div>👤</div>}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-900">{userData.displayName || 'User Name'}</h2>
            <p className="text-gray-600">{userProfile?.email || 'user@example.com'}</p>
          </div>
        </div>
      </div>
      
      <CollapsibleSection title="Account Details" defaultOpen={true}>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Account Type</span>
            <span className="text-sm font-medium">{userData.plan} Plan</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Usage</span>
            <span className="text-sm font-medium">{userData.quotaUsed}/{userData.quotaTotal} scans</span>
          </div>
          {userData.trialEndsAt && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Trial Ends</span>
              <span className="text-sm font-medium">{userData.trialEndsAt}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Joined</span>
            <span className="text-sm font-medium">{userData.joinedDate}</span>
          </div>
          {userData.totalProcessedItems !== undefined && userData.totalProcessedItems > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Success Rate</span>
              <span className="text-sm font-medium">
                {((userData.successfulItems ?? 0) / (userData.totalProcessedItems ?? 1) * 100).toFixed(1)}%
                <span className="text-xs text-gray-500 ml-1">
                  ({userData.successfulItems ?? 0}/{userData.totalProcessedItems ?? 0})
                </span>
              </span>
            </div>
          )}
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Subscription" defaultOpen={true}>
        <div>
          <div className="bg-blue-50 p-3 rounded-lg mb-2 border border-blue-100">
            <div className="text-sm font-medium text-blue-900 mb-1">{userData.plan} Plan</div>
            <p className="text-xs text-blue-700 mb-2">Access to basic scanning features</p>
            <ul className="text-xs space-y-1 text-blue-800 mb-2">
              <li className="flex items-center">
                {typeof Check === 'function' ? <Check size={10} className="mr-1 flex-shrink-0" /> : <div className="mr-1">✓</div>}
                <span>Up to {userData.quotaTotal} emails per month</span>
              </li>
              <li className="flex items-center">
                {typeof Check === 'function' ? <Check size={10} className="mr-1 flex-shrink-0" /> : <div className="mr-1">✓</div>}
                <span>Basic data extraction</span>
              </li>
              <li className="flex items-center">
                {typeof Check === 'function' ? <Check size={10} className="mr-1 flex-shrink-0" /> : <div className="mr-1">✓</div>}
                <span>Google Sheets export</span>
              </li>
            </ul>
            {userData.plan.toLowerCase() === 'free' && (
              <button className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors">
                Upgrade to Pro
              </button>
            )}
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
        
        {/* Debug section */}
        <button 
          onClick={async () => {
            await loadStorageData();
            alert('Storage data refreshed. Check developer console.');
          }}
          className="w-full bg-blue-100 hover:bg-blue-200 text-blue-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Debug: Refresh Storage Data
        </button>
      </div>
      
      {storageData && (
        <CollapsibleSection title="Debug Storage Info" defaultOpen={false}>
          <div className="text-xs text-gray-600 overflow-x-auto bg-gray-50 p-2 rounded border border-gray-200">
            <div className="font-medium mb-1">Google User ID: {storageData.local.google_user_id || 'Not found'}</div>
            <div className="font-medium mb-1">Supabase User ID: {storageData.local.supabase_user_id || 'Not found'}</div>
            <pre className="mt-2 text-xs">{JSON.stringify(storageData, null, 2)}</pre>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
};

export default Profile; 