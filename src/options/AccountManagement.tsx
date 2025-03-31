import React, { useState, ChangeEvent } from 'react';
import { supabase } from '../services/supabase/client';

// User profile information
interface UserProfile {
  id: string;
  email: string;
  plan: string;
  quota_used: number;
  quota_total: number;
  joined_date: string;
}

interface AccountManagementProps {
  isAuthenticated: boolean;
  userEmail?: string;
  userProfile?: UserProfile | null;
  onSignIn: (isSignUp: boolean) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const AccountManagement = ({
  isAuthenticated,
  userEmail,
  userProfile,
  onSignIn,
  onSignOut,
}: AccountManagementProps) => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // These are the scopes we request from Google
  const googleScopes = [
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

  const handleSignUp = async () => {
    try {
      setSignUpLoading(true);
      await onSignIn(true); // Pass true to indicate sign up
    } catch (error) {
      console.error('Failed to sign up:', error);
    } finally {
      setSignUpLoading(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setSignInLoading(true);
      await onSignIn(false); // Pass false to indicate sign in
    } catch (error) {
      console.error('Failed to sign in:', error);
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setSignOutLoading(true);
      await onSignOut();
      setShowDeleteConfirm(false); // Reset delete confirmation if open
    } catch (error) {
      console.error('Failed to sign out:', error);
    } finally {
      setSignOutLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      
      // Call Supabase RPC function to soft delete user
      const { error } = await supabase.rpc('soft_delete_user');
      
      if (error) throw error;
      
      // Clean up any OAuth tokens from storage
      try {
        if (chrome.storage) {
          await chrome.storage.local.remove(['gmail_token', 'sheets_token']);
        }
      } catch (storageErr) {
        console.warn('Failed to clear token storage:', storageErr);
      }
      
      // Sign out after successful deletion
      await onSignOut();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete account:', error);
      setDeleteError((error as Error).message || 'Failed to delete account. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {isAuthenticated && userProfile && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Account Details</h2>
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Account Type</span>
              <span className="font-medium">{userProfile.plan} Plan</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Usage</span>
              <span className="font-medium">{userProfile.quota_used}/{userProfile.quota_total} scans</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Joined</span>
              <span className="font-medium">{userProfile.joined_date}</span>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4">Authentication</h2>
        
        {isAuthenticated ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-green-600">✓</span>
              <span>Signed in as {userEmail || 'a Google user'}</span>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-medium">OAuth Permissions</h3>
              <p className="text-sm text-gray-600">
                Gmail Bill Scanner has been granted the following permissions:
              </p>
              
              {googleScopes.map((scope, index) => (
                <div key={index} className="border rounded p-3 bg-gray-50">
                  <div className="font-medium">{scope.description}</div>
                  <div className="text-sm text-gray-600 mt-1">{scope.detail}</div>
                </div>
              ))}
            </div>

            {isAuthenticated && userProfile && (
              <section className="mt-6 mb-4">
                <h3 className="font-medium mb-3">Subscription</h3>
                <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                  <div className="font-medium text-blue-800">{userProfile.plan} Plan</div>
                  <p className="text-sm text-blue-700">Access to basic scanning features</p>
                  <ul className="space-y-1 text-sm text-blue-700">
                    <li className="flex items-center">
                      <span className="text-blue-500 mr-2">✓</span>
                      Up to {userProfile.quota_total} emails per month
                    </li>
                    <li className="flex items-center">
                      <span className="text-blue-500 mr-2">✓</span>
                      Basic data extraction
                    </li>
                    <li className="flex items-center">
                      <span className="text-blue-500 mr-2">✓</span>
                      Google Sheets export
                    </li>
                  </ul>
                  
                  {userProfile.plan === 'Free' && (
                    <button
                      className="w-full py-2 mt-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Upgrade to Pro
                    </button>
                  )}
                </div>
              </section>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                onClick={handleSignOut}
                disabled={signOutLoading || deleteLoading}
                className="px-4 py-2 bg-gray-200 text-gray-800 border border-gray-300 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                {signOutLoading ? "Signing Out..." : "Sign Out"}
              </button>
              
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleteLoading || showDeleteConfirm || signOutLoading}
                className="px-4 py-2 bg-red-100 text-red-800 border border-red-200 rounded-md hover:bg-red-200 disabled:opacity-50"
              >
                Delete Account
              </button>
            </div>
            
            {showDeleteConfirm && (
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
                    disabled={deleteLoading}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteLoading ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleteLoading}
                    className="px-3 py-1 bg-gray-200 text-gray-800 text-sm rounded hover:bg-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-gray-600">
                Connect your Google account to use Gmail Bill Scanner. 
                The extension needs the following permissions:
              </p>
              
              {googleScopes.map((scope, index) => (
                <div key={index} className="border rounded p-3 bg-gray-50">
                  <div className="font-medium">{scope.description}</div>
                  <div className="text-sm text-gray-600 mt-1">{scope.detail}</div>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSignUp}
                disabled={signUpLoading || signInLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {signUpLoading ? "Creating Account..." : "Sign Up with Google"}
              </button>
              
              <button
                onClick={handleSignIn}
                disabled={signInLoading || signUpLoading}
                className="px-4 py-2 border border-blue-600 bg-white text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50"
              >
                {signInLoading ? "Signing In..." : "Sign In"}
              </button>
            </div>
            
            <p className="text-sm text-gray-500 italic">
              Note: Both options use Google OAuth. Sign Up is for new users, Sign In for returning users.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}; 