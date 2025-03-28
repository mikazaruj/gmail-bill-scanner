import React, { useState } from 'react';

interface AccountManagementProps {
  onDeleteAccount: () => Promise<void>;
  onRevokeAccess: () => Promise<void>;
}

export const AccountManagement = ({
  onDeleteAccount,
  onRevokeAccess
}: AccountManagementProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      await onDeleteAccount();
      setShowDeleteConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevokeAccess = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      await onRevokeAccess();
      setShowRevokeConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="account-management">
      <h2>Account Management</h2>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="account-section">
        <h3>Google Account Access</h3>
        <p>
          Manage your Google account access and permissions for Gmail Bill Scanner.
        </p>
        
        {!showRevokeConfirm ? (
          <button 
            onClick={() => setShowRevokeConfirm(true)}
            className="warning-button"
            disabled={isProcessing}
          >
            Revoke Google Access
          </button>
        ) : (
          <div className="confirmation-dialog">
            <p>
              Are you sure you want to revoke Gmail Bill Scanner's access to your Google account?
              This will:
            </p>
            <ul>
              <li>Remove access to your Gmail and Google Sheets</li>
              <li>Require re-authorization if you want to use the extension again</li>
              <li>Not delete any data you've already exported</li>
            </ul>
            <div className="button-group">
              <button 
                onClick={handleRevokeAccess}
                className="danger-button"
                disabled={isProcessing}
              >
                {isProcessing ? 'Revoking...' : 'Yes, Revoke Access'}
              </button>
              <button 
                onClick={() => setShowRevokeConfirm(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="account-section danger-zone">
        <h3>Danger Zone</h3>
        <p>
          Permanently delete your account and all associated data.
          This action cannot be undone.
        </p>
        
        {!showDeleteConfirm ? (
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="danger-button"
            disabled={isProcessing}
          >
            Delete Account
          </button>
        ) : (
          <div className="confirmation-dialog">
            <p>
              Are you absolutely sure you want to delete your account?
              This will:
            </p>
            <ul>
              <li>Permanently delete your account</li>
              <li>Remove all your settings and preferences</li>
              <li>Revoke access to Google services</li>
              <li>Cannot be undone</li>
            </ul>
            <div className="button-group">
              <button 
                onClick={handleDeleteAccount}
                className="danger-button"
                disabled={isProcessing}
              >
                {isProcessing ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 