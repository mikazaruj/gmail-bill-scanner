// Function to clear all authentication data
async function clearAllAuthData() {
  console.log('Starting auth data cleanup...');
  
  // 1. Clear Chrome Identity cached tokens
  try {
    await new Promise((resolve) => {
      chrome.identity.clearAllCachedAuthTokens(() => {
        console.log('✓ Cleared all cached Chrome Identity tokens');
        resolve();
      });
    });
  } catch (err) {
    console.error('Error clearing Chrome Identity tokens:', err);
  }
  
  // 2. Clear all auth-related data from Chrome storage
  try {
    await chrome.storage.local.remove([
      'gmail-bill-scanner-auth',
      'google_user_id',
      'google_user_info',
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
    
    console.log('✓ Cleared all auth data from Chrome storage');
  } catch (err) {
    console.error('Error clearing Chrome storage:', err);
  }
  
  // 3. Set flag to force new token on next sign in
  try {
    await chrome.storage.local.set({
      'force_clear_tokens': true
    });
    console.log('✓ Set flag to force new token on next sign in');
  } catch (err) {
    console.error('Error setting force clear flag:', err);
  }
  
  console.log('Auth data cleanup complete! Please:');
  console.log('1. Close the extension popup');
  console.log('2. Reload the extension');
  console.log('3. Try signing in again');
}

// Make it available in the console
window.clearAllAuthData = clearAllAuthData;

// Log instructions
console.log('To clear all auth data, run: await window.clearAllAuthData()'); 