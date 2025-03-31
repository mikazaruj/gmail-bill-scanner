import { supabase } from './client';

/**
 * Creates necessary user records after successful authentication
 * @param userId - The user's ID from Supabase auth
 * @param email - The user's email
 */
export async function createUserRecordsIfNeeded(userId: string, email: string): Promise<void> {
  try {
    // Check if user already exists in the public.users table
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      // Error other than "no rows returned" - something went wrong
      console.error('Error checking for existing user:', checkError);
      throw checkError;
    }
    
    // If user doesn't exist, create the record
    if (!existingUser) {
      console.log('Creating new user record for:', email);
      
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email,
          auth_id: userId,
          plan: 'free', // Default to free plan
          quota_bills_monthly: 50, // Default quota
          quota_bills_used: 0
        });
        
      if (insertError) {
        console.error('Error creating user record:', insertError);
        throw insertError;
      }
      
      // Create default user settings
      const { error: settingsError } = await supabase
        .from('user_settings')
        .insert({
          user_id: userId,
          scan_frequency: 'manual',
          apply_labels: true,
          label_name: 'Processed/Bills'
        });
        
      if (settingsError) {
        console.error('Error creating default settings:', settingsError);
        throw settingsError;
      }
    }
    
    console.log('User record management complete for:', email);
  } catch (error) {
    console.error('Middleware error:', error);
    throw error;
  }
}

/**
 * Handles the auth state change event
 * @param event - The auth event ('SIGNED_IN', 'SIGNED_OUT', etc.)
 * @param session - The user's session if signed in
 */
export async function handleAuthStateChange(
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED' | 'PASSWORD_RECOVERY', 
  session: any
): Promise<void> {
  console.log('Auth state changed:', event);
  
  if (event === 'SIGNED_IN' && session?.user) {
    const { id, email } = session.user;
    if (id && email) {
      await createUserRecordsIfNeeded(id, email);
    }
  }
} 