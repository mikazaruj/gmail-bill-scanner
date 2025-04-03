import React from 'react';
import { User, Check } from 'lucide-react';
import CollapsibleSection from '../components/CollapsibleSection';
import { useAuth } from '../hooks/useAuth';

interface ProfileProps {
  onNavigate: (tab: string) => void;
}

const Profile = ({ onNavigate }: ProfileProps) => {
  const { userProfile, logout } = useAuth();
  const [userData, setUserData] = React.useState({
    plan: 'Free',
    quotaUsed: 0,
    quotaTotal: 50,
    joinedDate: 'Not available',
    displayName: userProfile?.name || 'User Name',
    avatarUrl: userProfile?.avatar || null
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [debugInfo, setDebugInfo] = React.useState<any>(null);
  const [storageData, setStorageData] = React.useState<any>(null);
  
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
  
  React.useEffect(() => {
    // Load storage data on component mount
    loadStorageData();
  }, []);

  React.useEffect(() => {
    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('Fetching user stats...');
        
        // First check if we have Google user ID in storage
        const { google_user_id, user_profile: storedUserProfile } = 
          await chrome.storage.local.get(['google_user_id', 'user_profile']);
        
        console.log('Google user ID from storage:', google_user_id);
        console.log('Stored user profile:', storedUserProfile);
        
        const statsResponse = await chrome.runtime.sendMessage({ 
          type: 'GET_USER_STATS'
        });
        
        console.log('User stats response received:', statsResponse);
        
        // Enhanced debug info with potential data mismatch details
        const debugData = {
          ...statsResponse,
          authContext: userProfile ? {
            name: userProfile.name,
            email: userProfile.email,
            avatar: userProfile.avatar
          } : null,
          storageContext: storedUserProfile ? {
            name: storedUserProfile.name,
            email: storedUserProfile.email,
            picture: storedUserProfile.picture,
            id: storedUserProfile.id
          } : null,
          dataMismatches: []
        };
        
        // Check for data mismatches - email
        if (userProfile?.email && statsResponse?.userData?.email && 
            userProfile.email !== statsResponse.userData.email) {
          debugData.dataMismatches.push({
            field: 'email',
            authValue: userProfile.email,
            dbValue: statsResponse.userData.email
          });
        }
        
        // Check for data mismatches - name/display_name
        if (userProfile?.name && statsResponse?.userData?.display_name && 
            userProfile.name !== statsResponse.userData.display_name) {
          debugData.dataMismatches.push({
            field: 'name',
            authValue: userProfile.name,
            dbValue: statsResponse.userData.display_name
          });
        }
        
        setDebugInfo(debugData);
        
        if (!statsResponse?.success || !statsResponse.userData) {
          console.error('Failed to fetch user stats:', statsResponse?.error || 'No data returned');
          setError(statsResponse?.error || 'Failed to load user statistics');
          
          if (userProfile && userProfile.name) {
            setUserData(prevData => ({
              ...prevData,
              displayName: userProfile.name || 'User Name',
              avatarUrl: userProfile.avatar || null
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
          joinedDate: formatDate(statsData.created_at) || 'Not available',
          // Prioritize data from database over auth context
          displayName: statsData.display_name || userProfile.name || 'User',
          avatarUrl: statsData.avatar_url || userProfile.avatar || null
        };
        
        console.log('Setting user data:', updatedUserData);
        setUserData(updatedUserData);
        setIsLoading(false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to fetch user data:', errorMessage);
        setError(`Failed to load profile data: ${errorMessage}`);
        
        if (userProfile && userProfile.name) {
          setUserData(prevData => ({
            ...prevData,
            displayName: userProfile.name || 'User Name',
            avatarUrl: userProfile.avatar || null
          }));
        }
        
        setIsLoading(false);
      }
    };
    
    if (userProfile && userProfile.email) {
      fetchUserData();
    } else {
      setIsLoading(false);
    }
  }, [userProfile]);
  
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Not available';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (e) {
      return dateString.toString();
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  // For debugging
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
      
      setDebugInfo(statsResponse);
      
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
        joinedDate: formatDate(statsData.created_at) || 'Not available',
        // Prioritize data from database over auth context
        displayName: statsData.display_name || userProfile.name || 'User',
        avatarUrl: statsData.avatar_url || userProfile.avatar || null
      };
      
      setUserData(updatedUserData);
    } catch (err) {
      setError('Refresh failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="spinner"></div>
        <span className="ml-2 text-gray-600">Loading profile...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          {userData.avatarUrl ? (
            <img 
              src={userData.avatarUrl} 
              alt="Profile" 
              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
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
              <User size={24} />
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-900">{userData.displayName || 'User Name'}</h2>
            <p className="text-gray-600">{userProfile.email || 'user@example.com'}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-red-700 text-sm">
          <p className="font-medium">{error}</p>
          <button 
            onClick={refreshData}
            className="mt-2 text-xs bg-red-100 hover:bg-red-200 text-red-800 py-1 px-2 rounded"
          >
            Retry
          </button>
        </div>
      )}
      
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
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Joined</span>
            <span className="text-sm font-medium">{userData.joinedDate}</span>
          </div>
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Subscription" defaultOpen={true}>
        <div>
          <div className="bg-blue-50 p-3 rounded-lg mb-2 border border-blue-100">
            <div className="text-sm font-medium text-blue-900 mb-1">{userData.plan} Plan</div>
            <p className="text-xs text-blue-700 mb-2">Access to basic scanning features</p>
            <ul className="text-xs space-y-1 text-blue-800 mb-2">
              <li className="flex items-center">
                <Check size={10} className="mr-1 flex-shrink-0" />
                <span>Up to {userData.quotaTotal} emails per month</span>
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
        
        {/* Debug button to completely clear all auth data */}
        <button 
          onClick={async () => {
            const confirmed = window.confirm(
              'This will clear ALL authentication data and force a complete re-authentication. Continue?'
            );
            if (confirmed) {
              setIsLoading(true);
              try {
                // Clear all auth-related data from Chrome storage
                await chrome.storage.local.remove([
                  'gmail-bill-scanner-auth',
                  'google_user_id',
                  'supabase_user_id',
                  'user_email',
                  'user_profile',
                  'google_access_token',
                  'google_token_user_id',
                  'google_token_expiry',
                  'auth_state',
                  'auth_code_verifier',
                  'gmail-bill-scanner-auth-code-verifier',
                  'token',
                  'token_expiry',
                  'refresh_token',
                  'session'
                ]);
                
                await chrome.storage.sync.remove([
                  'gmail-bill-scanner-auth'
                ]);
                
                console.log('All auth data cleared from storage');
                
                // Refresh the storage data display
                await loadStorageData();
                
                alert('Auth data cleared. Please close and reopen the extension to sign in again.');
                
                // Logout to refresh UI
                await logout();
              } catch (err) {
                console.error('Error clearing data:', err);
                alert('Error clearing data: ' + String(err));
              } finally {
                setIsLoading(false);
              }
            }
          }}
          className="w-full bg-red-100 hover:bg-red-200 text-red-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Clear All Auth Data (Debug)
        </button>
        
        {/* Button to manually trigger linking with Supabase */}
        <button 
          onClick={async () => {
            setIsLoading(true);
            try {
              const { google_user_id } = await chrome.storage.local.get('google_user_id');
              
              if (!google_user_id) {
                alert('No Google User ID found. Please authenticate first.');
                setIsLoading(false);
                return;
              }
              
              // Get the Google profile from storage
              const { user_profile } = await chrome.storage.local.get('user_profile');
              
              if (!user_profile) {
                alert('No Google profile found. Please authenticate first.');
                setIsLoading(false);
                return;
              }
              
              // Send a message to link the user with Supabase
              const result = await chrome.runtime.sendMessage({
                type: 'LINK_GOOGLE_USER',
                profile: user_profile
              });
              
              console.log('Link result:', result);
              
              if (result.success) {
                alert(`Successfully linked with Supabase! User ID: ${result.userId}`);
                // Refresh the storage data display
                await loadStorageData();
                // Refresh user data
                await refreshData();
              } else {
                alert(`Failed to link with Supabase: ${result.error || 'Unknown error'}`);
              }
            } catch (err) {
              console.error('Error linking user:', err);
              alert('Error linking user: ' + String(err));
            } finally {
              setIsLoading(false);
            }
          }}
          className="w-full bg-blue-100 hover:bg-blue-200 text-blue-800 py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
        >
          Re-link Google with Supabase (Debug)
        </button>
      </div>

      {debugInfo && (
        <CollapsibleSection title="Debug Info" defaultOpen={false}>
          <div className="text-xs text-gray-600 overflow-x-auto">
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        </CollapsibleSection>
      )}
      
      {/* Display storage data for debugging */}
      <CollapsibleSection title="Storage Debug Info" defaultOpen={false}>
        <div className="space-y-2">
          <button
            onClick={loadStorageData}
            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 py-1 px-2 rounded"
          >
            Refresh Storage Data
          </button>
          
          {storageData && (
            <div className="text-xs text-gray-600 overflow-x-auto bg-gray-50 p-2 rounded border border-gray-200">
              <div className="font-medium mb-1">Google User ID: {storageData.local.google_user_id || 'Not found'}</div>
              <div className="font-medium mb-1">Supabase User ID: {storageData.local.supabase_user_id || 'Not found'}</div>
              <details>
                <summary className="cursor-pointer font-medium text-blue-600 mb-1">
                  All Storage Data
                </summary>
                <pre className="mt-2 text-xs">{JSON.stringify(storageData, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default Profile; 