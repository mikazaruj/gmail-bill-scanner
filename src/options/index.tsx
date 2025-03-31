import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import { supabase, syncAuthState, setupAuthListener } from '../services/supabase/client';
import "../globals.css";

// OAuth scopes definition
type OAuthScope = {
  scope: string;
  description: string;
  detail: string;
  isAuthorized?: boolean;
};

// Define the Google OAuth scopes with descriptions
const googleOAuthScopes: OAuthScope[] = [
  {
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    description: 'View your email messages and settings',
    detail: 'Allows the extension to read your email to identify bill-related emails. We never store the full content of your emails.'
  },
  {
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    description: 'See, edit, create, and delete your spreadsheets in Google Drive',
    detail: 'Allows the extension to create and update Google Sheets with your bill data.'
  }
];

export const OptionsPageContent = () => {
  const [activeTab, setActiveTab] = useState<'settings' | 'account'>('account');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userAvatar, setUserAvatar] = useState<string>('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState<boolean>(false);
  const [grantLoading, setGrantLoading] = useState<boolean>(false);
  const [oauthScopes, setOauthScopes] = useState<OAuthScope[]>(googleOAuthScopes);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Load authentication status on mount
  useEffect(() => {
    const loadAuthStatus = async () => {
      try {
        setIsLoading(true);
        setOauthError(null);
        
        // Use syncAuthState to get the latest auth state
        const { isAuthenticated: isAuth, user } = await syncAuthState();
        
        if (isAuth && user) {
          setIsAuthenticated(true);
          setUserEmail(user.email || '');
          
          // Get user profile to get avatar
          const { data: profileData } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', user.id)
            .single();
            
          if (profileData && profileData.avatar_url) {
            setUserAvatar(profileData.avatar_url);
          }
          
          // Check for authorized scopes
          const { data: credentials } = await supabase
            .from('google_credentials')
            .select('scopes')
            .eq('user_id', user.id)
            .single();
            
          if (credentials && credentials.scopes) {
            // Update scope authorization status
            const updatedScopes = oauthScopes.map(scope => ({
              ...scope,
              isAuthorized: credentials.scopes.includes(scope.scope)
            }));
            setOauthScopes(updatedScopes);
          }
        } else {
          // Also check Chrome storage as a fallback
          const { auth_state } = await chrome.storage.local.get('auth_state');
          
          if (auth_state?.isAuthenticated) {
            setIsAuthenticated(true);
            setUserEmail(auth_state.email || '');
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAuthStatus();
    
    // Set up auth state change listener
    setupAuthListener();
  }, []);

  // Handle granting access to Google account
  const handleGrantAccess = async () => {
    try {
      setGrantLoading(true);
      setOauthError(null);
      
      // Use try/catch to handle runtime errors with Chrome's APIs
      try {
        // First, ensure we have the proper redirect URL
        const redirectUrl = chrome.runtime.getURL('options.html');
        console.log('Using redirect URL:', redirectUrl);
        
        // Sign in with Google OAuth
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            scopes: googleOAuthScopes.map(scope => scope.scope).join(' '),
            redirectTo: redirectUrl
          }
        });
        
        if (error) {
          console.error('OAuth error:', error);
          
          // Check for specific error messages related to missing configurations
          if (error.message.includes('missing OAuth secret') || 
              error.message.includes('Unsupported provider') ||
              error.message.includes('validation_failed')) {
            setOauthError(
              'OAuth configuration error: The Supabase project is missing proper Google OAuth credentials. ' +
              'Please ensure Google OAuth is properly configured in the Supabase dashboard.'
            );
          } else {
            setOauthError(error.message);
          }
          throw error;
        }
      } catch (chromeError) {
        console.error('Chrome runtime error:', chromeError);
        setOauthError('Error connecting to Google services. Please check your Chrome extension permissions.');
        throw chromeError;
      }
    } catch (error) {
      console.error('Error granting access:', error);
      if (!oauthError) {
        setOauthError((error as Error).message || 'Failed to authenticate with Google');
      }
    } finally {
      setGrantLoading(false);
    }
  };

  // Handle revoking access 
  const handleRevokeAccess = async () => {
    try {
      setRevokeLoading(true);
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear OAuth tokens from Chrome's storage if needed
      try {
        if (chrome.storage) {
          await chrome.storage.local.remove(['gmail_token', 'sheets_token', 'user_settings']);
        }
      } catch (storageErr) {
        console.warn('Failed to clear token storage:', storageErr);
      }
      
      setIsAuthenticated(false);
      setUserEmail('');
      setUserAvatar('');
      setOauthScopes(googleOAuthScopes.map(scope => ({ ...scope, isAuthorized: false })));
    } catch (error) {
      console.error('Error revoking access:', error);
    } finally {
      setRevokeLoading(false);
    }
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(null);
      
      // Call Supabase RPC function to soft delete user
      const { error } = await supabase.rpc('soft_delete_user');
      
      if (error) throw error;
      
      // Clear OAuth tokens from storage
      try {
        if (chrome.storage) {
          await chrome.storage.local.remove(['gmail_token', 'sheets_token', 'user_settings']);
        }
      } catch (storageErr) {
        console.warn('Failed to clear token storage:', storageErr);
      }
      
      // Sign out after successful deletion
      await supabase.auth.signOut();
      
      setIsAuthenticated(false);
      setUserEmail('');
      setUserAvatar('');
      setDeleteConfirmOpen(false);
    } catch (error) {
      console.error('Failed to delete account:', error);
      setDeleteError((error as Error).message || 'Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold">Gmail Bill Scanner Settings</h1>
      </header>

      <div className="mb-8 border-b">
        <div className="flex space-x-4 justify-center">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 -mb-px ${
              activeTab === 'settings'
                ? 'border-b-2 border-blue-600 font-medium text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`px-4 py-2 -mb-px ${
              activeTab === 'account'
                ? 'border-b-2 border-blue-600 font-medium text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Account
          </button>
        </div>
      </div>

      <main className="bg-white rounded-lg shadow-sm">
        {activeTab === 'account' && (
          <div className="p-6 space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-4">Authentication</h2>
              
              {isAuthenticated ? (
                <>
                  <div className="flex items-center mb-4 bg-gray-50 p-3 rounded-lg border">
                    {userAvatar ? (
                      <img src={userAvatar} alt="User avatar" className="w-10 h-10 rounded-full mr-3" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                        <span className="text-blue-800 font-bold">{userEmail.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-green-500 mr-2"></div>
                        <span className="font-medium">Signed in</span>
                      </div>
                      <div className="text-gray-600">{userEmail}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <h3 className="font-medium">OAuth Permissions</h3>
                    <p className="text-sm text-gray-600">
                      Gmail Bill Scanner needs these permissions:
                    </p>
                    
                    {oauthScopes.map((scope, index) => (
                      <div key={index} className="border rounded p-3 bg-gray-50">
                        <div className="flex items-center">
                          {scope.isAuthorized ? (
                            <div className="h-3 w-3 rounded-full bg-green-500 mr-2" title="Authorized"></div>
                          ) : (
                            <div className="h-3 w-3 rounded-full bg-red-500 mr-2" title="Not authorized"></div>
                          )}
                          <div className="font-medium">{scope.description}</div>
                        </div>
                        <div className="text-sm text-gray-600 mt-1 ml-5">{scope.detail}</div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-3">Manage Access</h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleRevokeAccess}
                        disabled={revokeLoading || isDeleting}
                        className="px-4 py-2 bg-amber-100 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-200 disabled:opacity-50"
                      >
                        {revokeLoading ? "Revoking Access..." : "Revoke Access"}
                      </button>
                      
                      <button
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={deleteConfirmOpen || isDeleting || revokeLoading}
                        className="px-4 py-2 bg-red-100 text-red-800 border border-red-200 rounded-md hover:bg-red-200 disabled:opacity-50"
                      >
                        Delete Account
                      </button>
                    </div>
                  </div>
                  
                  {deleteConfirmOpen && (
                    <div className="mt-4 p-4 border border-red-200 rounded-md bg-red-50">
                      <h4 className="font-medium text-red-800 mb-2">Confirm Account Deletion</h4>
                      <p className="text-sm text-gray-700 mb-3">
                        This will mark your account as deleted. Any data in Google Sheets will remain,
                        but the extension will no longer have access to your Gmail or Google Sheets.
                      </p>
                      
                      {deleteError && (
                        <div className="mb-3 p-2 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                          {deleteError}
                        </div>
                      )}
                      
                      <div className="flex gap-3">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={isDeleting}
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          {isDeleting ? "Deleting..." : "Delete My Account"}
                        </button>
                        
                        <button
                          onClick={() => setDeleteConfirmOpen(false)}
                          disabled={isDeleting}
                          className="px-3 py-1 bg-gray-200 text-gray-800 text-sm rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                    <div className="flex items-center">
                      <div className="h-2 w-2 rounded-full bg-red-500 mr-2"></div>
                      <span className="font-medium">Not signed in</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Connect your Google account to scan emails for bills
                    </p>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <h3 className="font-medium">Required Permissions</h3>
                    
                    {oauthScopes.map((scope, index) => (
                      <div key={index} className="border rounded p-3 bg-gray-50">
                        <div className="font-medium">{scope.description}</div>
                        <div className="text-sm text-gray-600 mt-1">{scope.detail}</div>
                      </div>
                    ))}
                  </div>
                  
                  {oauthError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                      <p className="font-medium">Error connecting to Google</p>
                      <p>{oauthError}</p>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t">
                    <button
                      onClick={handleGrantAccess}
                      disabled={grantLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {grantLoading ? "Connecting..." : "Connect Google Account"}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
        
        {activeTab === 'settings' && (
          <div className="p-6 space-y-6">
            <section className="space-y-4">
              <h2 className="text-xl font-semibold border-b pb-2">Scanning Options</h2>
              
              <div className="space-y-2">
                <label className="block font-medium">Scan Frequency</label>
                <select
                  name="scanFrequency"
                  className="w-full p-2 border rounded-md bg-background"
                  disabled={!isAuthenticated}
                >
                  <option value="manual">Manual (Scan when I click the button)</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                <p className="text-sm text-muted-foreground">
                  How often should the extension automatically scan your emails
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold border-b pb-2">Gmail Integration</h2>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="applyLabels"
                  name="applyLabels"
                  className="h-4 w-4"
                  disabled={!isAuthenticated}
                />
                <label htmlFor="applyLabels" className="font-medium">
                  Apply labels to processed emails
                </label>
              </div>
              
              <div className="ml-6 space-y-2">
                <label className="block font-medium">Label Name</label>
                <input
                  type="text"
                  name="labelName"
                  className="w-full p-2 border rounded-md bg-background"
                  placeholder="e.g., Bills/Processed"
                  disabled={!isAuthenticated}
                />
                <p className="text-sm text-muted-foreground">
                  Gmail will create this label if it doesn't exist
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold border-b pb-2">Google Sheets Integration</h2>
              
              <div className="space-y-2">
                <label className="block font-medium">Sheet Name</label>
                <input
                  type="text"
                  name="sheetName"
                  className="w-full p-2 border rounded-md bg-background"
                  placeholder="e.g., Gmail Bill Tracker"
                  disabled={!isAuthenticated}
                />
                <p className="text-sm text-muted-foreground">
                  A new Google Sheet will be created with this name if it doesn't exist
                </p>
              </div>
            </section>

            <div className="pt-4 border-t flex items-center justify-end">
              <button
                disabled={!isAuthenticated}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Save Settings
              </button>
            </div>
          </div>
        )}
      </main>
      
      <footer className="mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
        Gmail Bill Scanner v1.0.0 • <a href="#" className="underline">Privacy Policy</a>
      </footer>
    </div>
  );
};

// REMOVED: Direct createRoot initialization - This is now handled in src/index.js
// Do not initialize React here as it causes duplicate initialization errors
// const rootElement = document.getElementById('root');
// if (rootElement) {
//   const root = ReactDOM.createRoot(rootElement);
//   root.render(<OptionsPageContent />);
// } 