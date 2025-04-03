/**
 * Debug Tools for Chrome Extension
 * 
 * This file contains helper functions to debug Chrome extension storage
 * from the browser console.
 * 
 * To use:
 * 1. Compile this file with your extension
 * 2. Open the extension popup
 * 3. Open Developer Tools (right-click > Inspect)
 * 4. In the console, type: "window.DebugTools.viewStorage()" to view all storage
 */

// Make the debug functions available in the global scope
declare global {
  interface Window {
    DebugTools: {
      viewStorage: () => Promise<any>;
      clearAuthData: () => Promise<void>;
      getGoogleUserId: () => Promise<string | null>;
      getSupabaseUserId: () => Promise<string | null>;
      logUserInfo: () => Promise<void>;
    };
  }
}

/**
 * View all Chrome storage data
 */
async function viewStorage(): Promise<any> {
  try {
    const localData = await chrome.storage.local.get(null);
    const syncData = await chrome.storage.sync.get(null);
    
    console.group('Chrome Storage Data');
    console.log('Local Storage:', localData);
    console.log('Sync Storage:', syncData);
    
    // Display important keys separately
    console.group('Important Keys');
    console.log('Google User ID:', localData.google_user_id || 'Not found');
    console.log('Supabase User ID:', localData.supabase_user_id || 'Not found');
    console.log('User Email:', localData.user_email || 'Not found');
    console.groupEnd();
    
    console.groupEnd();
    
    return localData;
  } catch (err) {
    console.error('Error viewing storage:', err);
    return null;
  }
}

/**
 * Clear all authentication data
 */
async function clearAuthData(): Promise<void> {
  try {
    if (!confirm('Are you sure you want to clear all authentication data? This will sign you out.')) {
      return;
    }
    
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
    
    console.log('All auth data cleared. Please close and reopen the extension.');
    alert('All auth data cleared. Please close and reopen the extension.');
  } catch (err) {
    console.error('Error clearing auth data:', err);
    alert('Error clearing data: ' + String(err));
  }
}

/**
 * Get Google User ID
 */
async function getGoogleUserId(): Promise<string | null> {
  try {
    const { google_user_id } = await chrome.storage.local.get('google_user_id');
    console.log('Google User ID:', google_user_id || 'Not found');
    return google_user_id || null;
  } catch (err) {
    console.error('Error getting Google User ID:', err);
    return null;
  }
}

/**
 * Get Supabase User ID
 */
async function getSupabaseUserId(): Promise<string | null> {
  try {
    const { supabase_user_id } = await chrome.storage.local.get('supabase_user_id');
    console.log('Supabase User ID:', supabase_user_id || 'Not found');
    return supabase_user_id || null;
  } catch (err) {
    console.error('Error getting Supabase User ID:', err);
    return null;
  }
}

/**
 * Log user information
 */
async function logUserInfo(): Promise<void> {
  try {
    const data = await chrome.storage.local.get([
      'google_user_id',
      'supabase_user_id',
      'user_email',
      'user_profile'
    ]);
    
    console.group('User Information');
    console.log('Google User ID:', data.google_user_id || 'Not found');
    console.log('Supabase User ID:', data.supabase_user_id || 'Not found');
    console.log('User Email:', data.user_email || 'Not found');
    console.log('User Profile:', data.user_profile || 'Not found');
    console.groupEnd();
  } catch (err) {
    console.error('Error logging user info:', err);
  }
}

// Create debug tools object
const DebugTools = {
  viewStorage,
  clearAuthData,
  getGoogleUserId,
  getSupabaseUserId,
  logUserInfo
};

// Make it available in the global scope
window.DebugTools = DebugTools;

// Log a message to let users know the debug tools are available
console.log('Debug Tools loaded! Use window.DebugTools to access debugging functions.');
console.log('Example: window.DebugTools.viewStorage()');

export default DebugTools; 