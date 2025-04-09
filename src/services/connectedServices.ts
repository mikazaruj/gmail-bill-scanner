import { supabase } from './supabase/client';

export interface ServiceStatus {
  id: string;
  user_id: string;
  service_type: 'gmail' | 'sheets';
  service_email: string | null;
  sheet_id: string | null;
  sheet_name: string | null;
  is_connected: boolean;
  last_connected_at: string | null;
  token_expires_at: string | null;
  token_valid: boolean;
}

export const getConnectedServices = async (userId: string): Promise<ServiceStatus[]> => {
  try {
    const { data, error } = await supabase
      .from('services_status_view')
      .select('*')
      .eq('user_id', userId);
      
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching connected services:', error);
    return [];
  }
};

export const updateSheetConnection = async (
  userId: string,
  sheetId: string,
  sheetName: string
): Promise<boolean> => {
  try {
    // Check if service record exists first
    const { data: existingData, error: existingError } = await supabase
      .from('connected_services')
      .select('id')
      .eq('user_id', userId)
      .eq('service_type', 'sheets')
      .single();
      
    if (existingError && existingError.code !== 'PGRST116') {
      throw existingError;
    }
    
    if (existingData) {
      // Update existing record
      const { error } = await supabase
        .from('connected_services')
        .update({
          sheet_id: sheetId,
          sheet_name: sheetName,
          is_connected: true,
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingData.id);
        
      if (error) throw error;
    } else {
      // Insert new record
      const { error } = await supabase
        .from('connected_services')
        .insert({
          user_id: userId,
          service_type: 'sheets',
          sheet_id: sheetId,
          sheet_name: sheetName,
          is_connected: true,
          last_connected_at: new Date().toISOString()
        });
        
      if (error) throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating sheet connection:', error);
    return false;
  }
};

export const updateGmailConnection = async (
  userId: string,
  serviceEmail: string,
  isConnected: boolean = true
): Promise<boolean> => {
  try {
    // Check if service record exists first
    const { data: existingData, error: existingError } = await supabase
      .from('connected_services')
      .select('id')
      .eq('user_id', userId)
      .eq('service_type', 'gmail')
      .single();
      
    if (existingError && existingError.code !== 'PGRST116') {
      throw existingError;
    }
    
    if (existingData) {
      // Update existing record
      const { error } = await supabase
        .from('connected_services')
        .update({
          service_email: serviceEmail,
          is_connected: isConnected,
          last_connected_at: isConnected ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingData.id);
        
      if (error) throw error;
    } else {
      // Insert new record
      const { error } = await supabase
        .from('connected_services')
        .insert({
          user_id: userId,
          service_type: 'gmail',
          service_email: serviceEmail,
          is_connected: isConnected,
          last_connected_at: isConnected ? new Date().toISOString() : null
        });
        
      if (error) throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating Gmail connection:', error);
    return false;
  }
}; 