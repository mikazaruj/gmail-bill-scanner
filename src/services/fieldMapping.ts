import { supabase } from './supabase/client';

export interface FieldMapping {
  user_id: string;
  mapping_id: string;
  field_id: string;
  name: string;
  display_name: string;
  field_type: string;
  column_mapping: string;
  display_order: number;
  is_enabled: boolean;
}

export interface FieldDefinition {
  id: string;
  name: string;
  display_name: string;
  field_type: string;
  is_system: boolean;
  default_column: string | null;
  extraction_priority: number;
  default_order: number | null;
  default_enabled?: boolean;
}

export const getFieldMappings = async (userId: string): Promise<FieldMapping[]> => {
  try {
    console.log(`Fetching field mappings for user ${userId}`);
    
    // First try to get from the view (which has all the display names, etc.)
    const { data: viewData, error: viewError } = await supabase
      .from('field_mapping_view')
      .select('*')
      .eq('user_id', userId)
      .order('display_order');
      
    if (!viewError && viewData && viewData.length > 0) {
      console.log(`Retrieved ${viewData.length} field mappings from view`);
      return viewData;
    }
    
    if (viewError) {
      console.warn('Error fetching field mappings from view:', viewError);
    }
    
    // If view fails or returns no data, fall back to direct join query
    console.log('Falling back to direct query for field mappings');
    
    const { data: joinData, error: joinError } = await supabase
      .from('user_field_mappings')
      .select(`
        *,
        field_definition:field_id (
          name,
          display_name,
          field_type
        )
      `)
      .eq('user_id', userId)
      .order('display_order');
    
    if (joinError) {
      console.error('Error fetching field mappings from direct join:', joinError);
      return [];
    }
    
    // Transform the joined data to match the FieldMapping interface
    if (joinData && joinData.length > 0) {
      console.log(`Retrieved ${joinData.length} field mappings from direct join`);
      
      return joinData.map(item => ({
        user_id: item.user_id,
        mapping_id: item.id,
        field_id: item.field_id,
        name: item.field_definition?.name || '',
        display_name: item.field_definition?.display_name || '',
        field_type: item.field_definition?.field_type || 'text',
        column_mapping: item.column_mapping,
        display_order: item.display_order,
        is_enabled: item.is_enabled
      }));
    }
    
    console.log('No field mappings found for user');
    return [];
  } catch (error) {
    console.error('Error fetching field mappings:', error);
    return [];
  }
};

/**
 * Updates a field mapping in Supabase
 * @param userId User ID
 * @param fieldId Field ID
 * @param updates Updates to apply
 * @returns True if update was successful
 */
export const updateFieldMapping = async (
  userId: string,
  fieldId: string,
  updates: Partial<{
    is_enabled: boolean;
    column_mapping: string;
    display_order: number;
  }>
): Promise<boolean> => {
  try {
    // If updating column mapping, first check if this column is already in use
    if (updates.column_mapping) {
      console.log(`Checking if column ${updates.column_mapping} is already in use by another field`);
      
      const { data: existingMapping, error: checkError } = await supabase
        .from('user_field_mappings')
        .select('field_id')
        .eq('user_id', userId)
        .eq('column_mapping', updates.column_mapping)
        .not('field_id', 'eq', fieldId)
        .limit(1);
      
      if (!checkError && existingMapping && existingMapping.length > 0) {
        console.log(`Column ${updates.column_mapping} is already in use by field ${existingMapping[0].field_id}`);
        
        // Try to assign a temporary column to the conflicting field first
        const tempColumnName = `TEMP_${Date.now()}`;
        console.log(`Assigning temporary column ${tempColumnName} to field ${existingMapping[0].field_id}`);
        
        const { error: tempUpdateError } = await supabase
          .from('user_field_mappings')
          .update({
            column_mapping: tempColumnName,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('field_id', existingMapping[0].field_id);
        
        if (tempUpdateError) {
          console.error('Error assigning temporary column:', tempUpdateError);
          // Continue anyway, it might still work
        } else {
          console.log(`Successfully assigned temporary column to conflicting field`);
          // Add a small delay to ensure DB consistency
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
    
    const { error } = await supabase
      .from('user_field_mappings')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('field_id', fieldId);
      
    if (error) {
      console.error(`Error updating field mapping for field ${fieldId}:`, error);
      
      // If there's a conflict and we're updating column_mapping, try a different approach
      if (error.code === '23505' && updates.column_mapping) {
        console.log('Conflict detected when updating column. Trying an alternative approach...');
        
        // Try with a temporary unique column first
        const tempColumnName = `TEMP_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        console.log(`Using temporary column name ${tempColumnName} first`);
        
        const { error: tempError } = await supabase
          .from('user_field_mappings')
          .update({
            column_mapping: tempColumnName,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('field_id', fieldId);
          
        if (tempError) {
          console.error('Error updating with temporary column name:', tempError);
          return false;
        }
        
        // Wait a moment to ensure the first update is processed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Now try to update with the desired column name
        const { error: finalError } = await supabase
          .from('user_field_mappings')
          .update({
            column_mapping: updates.column_mapping,
            is_enabled: updates.is_enabled,
            display_order: updates.display_order,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('field_id', fieldId);
          
        if (finalError) {
          console.error('Error updating after temporary column:', finalError);
          return false;
        }
        
        return true;
      }
      
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating field mapping:', error);
    return false;
  }
};

export const createFieldMapping = async (
  userId: string,
  fieldId: string,
  columnMapping: string,
  displayOrder: number = 1,
  isEnabled: boolean = true
): Promise<boolean> => {
  try {
    console.log(`Creating field mapping for user ${userId}, field ${fieldId}, column ${columnMapping}`);
    const { error } = await supabase
      .from('user_field_mappings')
      .insert({
        user_id: userId,
        field_id: fieldId,
        column_mapping: columnMapping,
        display_order: displayOrder,
        is_enabled: isEnabled
      });
      
    if (error) throw error;
    console.log('Field mapping created successfully');
    return true;
  } catch (error) {
    console.error('Error creating field mapping:', error);
    return false;
  }
};

export const getFieldDefinitions = async (): Promise<FieldDefinition[]> => {
  try {
    console.log('Fetching field definitions');
    // Use extraction_priority instead of default_order for sorting if it exists
    const { data, error } = await supabase
      .from('field_definitions')
      .select('*')
      .order('extraction_priority');
      
    if (error) throw error;
    console.log(`Retrieved ${data?.length || 0} field definitions`);
    return data || [];
  } catch (error) {
    console.error('Error fetching field definitions:', error);
    return [];
  }
};

export const createDefaultFieldMappings = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Creating default field mappings for user ${userId}`);
    // First, get all available field definitions - use is_system flag if available
    let fieldsToUse: FieldDefinition[] = [];
    
    const { data: systemFields, error: fieldsError } = await supabase
      .from('field_definitions')
      .select('*')
      .eq('is_system', true)
      .order('extraction_priority');
      
    if (fieldsError || !systemFields || systemFields.length === 0) {
      console.log('No system fields found or error, trying all fields');
      // Fallback to try without is_system filter if it fails
      const { data: allFields, error: allFieldsError } = await supabase
        .from('field_definitions')
        .select('*')
        .order('extraction_priority');
        
      if (allFieldsError) throw allFieldsError;
      
      // Use all fields if is_system filter failed
      if (allFields && allFields.length > 0) {
        fieldsToUse = allFields;
      } else {
        console.warn('No field definitions found, cannot create default mappings');
        return false;
      }
    } else {
      fieldsToUse = systemFields;
    }
    
    if (fieldsToUse.length === 0) {
      console.warn('No field definitions found, cannot create default mappings');
      return false;
    }
    
    console.log(`Found ${fieldsToUse.length} field definitions, creating mappings`);
    
    // Create default mappings for each field
    const mappings = fieldsToUse.map((field, index) => ({
      user_id: userId,
      field_id: field.id,
      is_enabled: field.default_enabled ?? true,
      column_mapping: field.default_column || String.fromCharCode(65 + index), // Use default_column if present, or fall back to A, B, C, ...
      display_order: field.default_order || field.extraction_priority || (index + 1)
    }));
    
    const { error } = await supabase
      .from('user_field_mappings')
      .insert(mappings);
      
    if (error) throw error;
    console.log(`Created ${mappings.length} default field mappings successfully`);

    // After creating default field mappings, sync with Google Sheet
    try {
      await syncFieldMappingsWithSheet(userId);
    } catch (syncError) {
      console.warn('Created field mappings but failed to sync with Google Sheet:', syncError);
      // Continue since the primary operation succeeded
    }
    
    return true;
  } catch (error) {
    console.error('Error creating default field mappings:', error);
    return false;
  }
};

/**
 * Checks for and fixes any column mapping issues in the user's field mappings
 * This can detect and fix:
 * - Duplicate column mappings
 * - Non-sequential column mappings
 * - Missing column mappings
 * 
 * @param userId User ID to check mappings for
 * @returns True if fixes were applied successfully
 */
export const fixColumnMappingIssues = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Checking for field mapping issues for user ${userId}`);
    
    // Get all field mappings for the user directly from the database table
    const { data: mappings, error } = await supabase
      .from('user_field_mappings')
      .select('*')
      .eq('user_id', userId)
      .order('display_order');
      
    if (error) {
      console.error('Error fetching field mappings to check for issues:', error);
      return false;
    }
    
    if (!mappings || mappings.length === 0) {
      console.log('No field mappings found, nothing to fix');
      return true;
    }
    
    console.log(`Found ${mappings.length} field mappings to check`);
    
    // Check for enabled mappings
    const enabledMappings = mappings.filter(m => m.is_enabled);
    console.log(`Found ${enabledMappings.length} enabled field mappings`);
    
    if (enabledMappings.length === 0) {
      console.log('No enabled mappings, nothing to fix');
      return true;
    }
    
    // Check for duplicate column mappings
    const columnCounts: Record<string, number> = {};
    enabledMappings.forEach(m => {
      columnCounts[m.column_mapping] = (columnCounts[m.column_mapping] || 0) + 1;
    });
    
    const duplicateColumns = Object.entries(columnCounts)
      .filter(([_, count]) => count > 1)
      .map(([col]) => col);
      
    if (duplicateColumns.length > 0) {
      console.log(`Found ${duplicateColumns.length} duplicate column mappings:`, duplicateColumns);
      
      // Fix duplicate columns by assigning temporary column names to all enabled mappings
      console.log('Fixing duplicate column mappings...');
      const timestamp = Date.now();
      
      // First, give all enabled mappings a temporary unique column mapping
      for (let i = 0; i < enabledMappings.length; i++) {
        const mapping = enabledMappings[i];
        const tempColumnName = `TEMP_FIX_${i}_${timestamp}`;
        
        console.log(`Setting temporary column mapping for ${mapping.field_id} from ${mapping.column_mapping} to ${tempColumnName}`);
        
        const { error: updateError } = await supabase
          .from('user_field_mappings')
          .update({ column_mapping: tempColumnName })
          .eq('id', mapping.id);
          
        if (updateError) {
          console.error(`Error setting temporary column mapping for ${mapping.field_id}:`, updateError);
        }
        
        // Add delay to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Wait a moment to ensure all temporary updates are applied
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Now set sequential column mappings for all enabled mappings
      for (let i = 0; i < enabledMappings.length; i++) {
        const mapping = enabledMappings[i];
        const columnLetter = String.fromCharCode(65 + i); // A=65, B=66, etc.
        
        console.log(`Setting sequential column mapping for ${mapping.field_id} to ${columnLetter}`);
        
        const { error: updateError } = await supabase
          .from('user_field_mappings')
          .update({ 
            column_mapping: columnLetter,
            display_order: i + 1 // Also fix display order to match
          })
          .eq('id', mapping.id);
          
        if (updateError) {
          console.error(`Error setting sequential column mapping for ${mapping.field_id}:`, updateError);
          // Keep going despite errors
        }
        
        // Add delay to prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('Finished fixing duplicate column mappings');
      
      // After fixing columngs, try to sync with the sheet to update headers
      try {
        await syncFieldMappingsWithSheet(userId);
      } catch (syncError) {
        console.warn('Error syncing field mappings after fixing column issues:', syncError);
        // Continue anyway as we've fixed the primary issue
      }
      
      return true;
    } else {
      console.log('No duplicate column mappings found');
      
      // Check if column mappings are sequential
      const usedColumns = new Set(enabledMappings.map(m => m.column_mapping));
      let isSequential = true;
      
      for (let i = 0; i < enabledMappings.length; i++) {
        const expectedColumn = String.fromCharCode(65 + i);
        if (!usedColumns.has(expectedColumn)) {
          isSequential = false;
          console.log(`Non-sequential column mapping: missing ${expectedColumn}`);
          break;
        }
      }
      
      if (!isSequential) {
        console.log('Column mappings are not sequential, updating...');
        // Use the updateColumnMappingsToSequential function to fix this
        const result = await updateColumnMappingsToSequential(userId, enabledMappings as any);
        console.log('Column mappings sequential update result:', result);
        return result;
      } else {
        console.log('Column mappings are properly sequential');
        return true;
      }
    }
  } catch (error) {
    console.error('Error fixing column mapping issues:', error);
    return false;
  }
};

// Update ensureUserHasFieldMappings to also fix column mapping issues
export const ensureUserHasFieldMappings = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Ensuring user ${userId} has field mappings`);
    // Check if user already has field mappings
    const { data, error: checkError } = await supabase
      .from('user_field_mappings')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
      
    if (checkError) throw checkError;
    
    // If no mappings exist, create defaults
    if (!data || data.length === 0) {
      console.log('No field mappings found for user, creating defaults');
      const result = await createDefaultFieldMappings(userId);
      
      if (!result) {
        console.error('Failed to create default field mappings');
        return false;
      }
      
      return true;
    } else {
      console.log('User already has field mappings, checking for issues');
      
      // First, fix any column mapping issues
      await fixColumnMappingIssues(userId);
      
      // Then sync with Google Sheet to ensure consistency
      try {
        await syncFieldMappingsWithSheet(userId);
      } catch (syncError) {
        console.warn('Failed to sync existing field mappings with Google Sheet:', syncError);
        // Don't fail the operation since the user already has mappings
      }
      
      return true;
    }
  } catch (error) {
    console.error('Error ensuring user has field mappings:', error);
    return false;
  }
};

/**
 * Helper function to safely get the supabase_user_id from chrome storage
 * This avoids using the wrong ID format (google_user_id) when querying Supabase
 * @returns The supabase_user_id as a string, or null if not found
 */
export const getSupabaseUserIdFromStorage = async (): Promise<string | null> => {
  try {
    console.log('Getting Supabase user ID from storage');
    const userData = await chrome.storage.local.get(['supabase_user_id']);
    const supabaseUserId = userData?.supabase_user_id;
    
    if (!supabaseUserId) {
      console.warn('Supabase user ID not found in storage');
      return null;
    }
    
    // Validate that this looks like a UUID (simple check for format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(supabaseUserId)) {
      console.warn(`Found Supabase user ID in storage, but it doesn't look like a valid UUID: ${supabaseUserId}`);
      return null;
    }
    
    console.log(`Got valid Supabase user ID from storage: ${supabaseUserId}`);
    return supabaseUserId;
  } catch (error) {
    console.error('Error getting Supabase user ID from storage:', error);
    return null;
  }
};

/**
 * Syncs field mappings with Google Sheets by updating the headers
 * Call this function after updating field mappings in Supabase
 * @param userId User ID to sync mappings for
 * @returns True if sync was successful
 */
export const syncFieldMappingsWithSheet = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Syncing field mappings with Google Sheet for user ${userId}`);
    
    // Get the current field mappings
    const fieldMappings = await getFieldMappings(userId);
    console.log(`Retrieved ${fieldMappings.length} field mappings for sync`);
    
    // Get enabled field mappings sorted by display order
    const enabledMappings = fieldMappings.length > 0 
      ? [...fieldMappings.filter((m: any) => m.is_enabled)].sort((a: any, b: any) => a.display_order - b.display_order)
      : [];
      
    console.log(`Found ${enabledMappings.length} enabled field mappings to sync`);
    
    // Skip column mapping update if there's a problem with them
    let columnUpdatesSuccessful = true;
    
    try {
      // Update column_mapping to be sequential based on display_order
      columnUpdatesSuccessful = await updateColumnMappingsToSequential(userId, enabledMappings);
      if (!columnUpdatesSuccessful) {
        console.warn('Failed to update column mappings in database, but continuing with sheet sync');
        // Still continue to try updating the sheet headers using existing order
      }
    } catch (columnUpdateError) {
      console.error('Error during column mapping update:', columnUpdateError);
      columnUpdatesSuccessful = false;
      // Continue with the process even if column updates fail
    }
    
    // Try multiple ways to get the spreadsheet ID
    let spreadsheetId: string | null = null;
    
    // 1. First try to get from user_settings_view (most reliable source)
    try {
      console.log('Trying to find spreadsheet_id from user_settings_view');
      const { data: userSettingsView, error: viewError } = await supabase
        .from('user_settings_view')
        .select('sheet_id') // Note: In view it's sheet_id, not spreadsheet_id
        .eq('id', userId) // Note: In view it's id, not user_id
        .single();
      
      if (!viewError && userSettingsView?.sheet_id) {
        spreadsheetId = userSettingsView.sheet_id;
        console.log(`Found spreadsheet ID in user_settings_view: ${spreadsheetId}`);
      } else if (viewError) {
        console.warn('Error fetching from user_settings_view:', viewError);
      }
    } catch (error) {
      console.warn('Exception fetching from user_settings_view:', error);
    }
    
    // 2. Try from user_settings if not found
    if (!spreadsheetId) {
      try {
        console.log('Trying to find spreadsheet_id from user_settings');
        const { data: userSettings, error: settingsError } = await supabase
          .from('user_settings')
          .select('spreadsheet_id')
          .eq('user_id', userId)
          .single();
        
        if (!settingsError && userSettings?.spreadsheet_id) {
          spreadsheetId = userSettings.spreadsheet_id;
          console.log(`Found spreadsheet ID in user_settings: ${spreadsheetId}`);
        } else if (settingsError) {
          console.warn('Error fetching from user_settings:', settingsError);
        }
      } catch (error) {
        console.warn('Exception fetching from user_settings:', error);
      }
    }
    
    // 3. Try from Chrome storage
    if (!spreadsheetId) {
      try {
        console.log('Trying to find sheet_id from Chrome storage');
        const storageData = await chrome.storage.local.get(['sheet_id']);
        if (storageData && storageData.sheet_id) {
          spreadsheetId = storageData.sheet_id;
          console.log(`Found spreadsheet ID in Chrome storage: ${spreadsheetId}`);
        }
      } catch (error) {
        console.warn('Error fetching from Chrome storage:', error);
      }
    }
    
    // If still no spreadsheet ID, fail
    if (!spreadsheetId) {
      console.log('No spreadsheet ID found for user, skipping sync');
      return false;
    }
    
    // Store the correct Supabase user ID in storage to ensure it's available for setupSheetHeaders
    try {
      // Only if this looks like a UUID
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidPattern.test(userId)) {
        console.log(`Updating storage with correct Supabase user ID: ${userId}`);
        await chrome.storage.local.set({ supabase_user_id: userId });
      }
    } catch (storageError) {
      console.warn('Could not update supabase_user_id in storage:', storageError);
      // Continue anyway
    }
    
    // Import and call the updateSheetHeadersFromFieldMappings function
    console.log(`Calling updateSheetHeadersFromFieldMappings with ID: ${spreadsheetId}`);
    try {
      const { updateSheetHeadersFromFieldMappings } = await import('./sheets/sheetsApi');
      const result = await updateSheetHeadersFromFieldMappings(spreadsheetId);
      
      if (result) {
        console.log('Successfully updated Google Sheet headers based on field mappings');
      } else {
        console.warn('Failed to update Google Sheet headers');
      }
      
      return result;
    } catch (sheetUpdateError) {
      console.error('Error updating sheet headers:', sheetUpdateError);
      return false;
    }
  } catch (error) {
    console.error('Error syncing field mappings with Google Sheet:', error);
    return false;
  }
};

/**
 * Updates column_mapping values to be sequential (A, B, C...) based on display_order
 * @param userId User ID
 * @param enabledMappings Array of enabled field mappings sorted by display_order
 * @returns True if update was successful
 */
async function updateColumnMappingsToSequential(
  userId: string, 
  enabledMappings: FieldMapping[]
): Promise<boolean> {
  try {
    console.log('Updating column mappings to be sequential based on display_order');
    
    // Skip if no enabled mappings
    if (enabledMappings.length === 0) {
      console.log('No enabled mappings to update');
      return true;
    }
    
    // Log current column mappings for debugging
    console.log('Current mappings before updates:', enabledMappings.map(m => ({
      name: m.name,
      display_order: m.display_order,
      current_column: m.column_mapping,
      target_column: String.fromCharCode(65 + enabledMappings.findIndex(em => em.field_id === m.field_id))
    })));
    
    // STEP 1: First, use a single batch call to change all columns to unique temporary columns
    // This avoids constraint conflicts by ensuring all columns have non-letter values first
    const timestamp = Date.now();
    let batchUpdates: any[] = [];

    for (let i = 0; i < enabledMappings.length; i++) {
      const mapping = enabledMappings[i];
      // Create a unique temporary column name with index and timestamp
      const tempColumnName = `TEMP_${i}_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
      
      // Add to batch
      batchUpdates.push({
        user_id: userId,
        field_id: mapping.field_id,
        column_mapping: tempColumnName,
        updated_at: new Date().toISOString()
      });
      
      console.log(`Preparing temp column for ${mapping.name}: ${tempColumnName}`);
    }
    
    // Apply all temporary column updates one by one to avoid constraint errors
    console.log('Applying temporary column updates individually');
    for (const update of batchUpdates) {
      try {
        const { error } = await supabase
          .from('user_field_mappings')
          .update({
            column_mapping: update.column_mapping,
            updated_at: update.updated_at
          })
          .eq('user_id', userId)
          .eq('field_id', update.field_id);
          
        if (error) {
          console.error(`Error setting temporary column for field ${update.field_id}:`, error);
        } else {
          console.log(`Set temporary column for field ${update.field_id}`);
        }
        
        // Small delay between updates to ensure they're processed in order
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`Exception updating temporary column for field ${update.field_id}:`, err);
      }
    }
    
    // Wait a moment to ensure all updates have propagated
    console.log('Waiting for temporary column updates to propagate');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // STEP 2: Now update with the correct sequential column mappings
    console.log('STEP 2: Updating to sequential column mappings');
    let success = true;
    
    // Apply final column mapping updates one by one
    for (let i = 0; i < enabledMappings.length; i++) {
      const mapping = enabledMappings[i];
      const columnLetter = String.fromCharCode(65 + i); // A=65, B=66, etc.
      
      console.log(`Setting final mapping for ${mapping.name} (originally ${mapping.column_mapping}) to column ${columnLetter}`);
      
      try {
        const { error } = await supabase
          .from('user_field_mappings')
          .update({
            column_mapping: columnLetter,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('field_id', mapping.field_id);
          
        if (error) {
          console.error(`Error updating final column mapping for field ${mapping.field_id}:`, error);
          success = false;
        } else {
          console.log(`Successfully set final column ${columnLetter} for field ${mapping.name}`);
        }
        
        // Small delay between updates
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`Exception updating final column for field ${mapping.field_id}:`, err);
        success = false;
      }
    }
    
    if (success) {
      console.log('All column mappings updated successfully to sequential order');
    } else {
      console.warn('Some column mappings failed to update to sequential order');
    }
    
    // Even with some errors, try to continue with sheet sync
    return true;
  } catch (error) {
    console.error('Error updating column mappings:', error);
    return false;
  }
}

/**
 * Updates field mapping and syncs changes with Google Sheet
 * @param userId User ID
 * @param fieldId Field ID
 * @param updates Updates to apply
 * @param syncWithSheet Whether to sync changes with Google Sheet (default: true)
 * @returns True if update was successful
 */
export const updateFieldMappingAndSync = async (
  userId: string,
  fieldId: string,
  updates: Partial<{
    is_enabled: boolean;
    column_mapping: string;
    display_order: number;
  }>,
  syncWithSheet: boolean = true
): Promise<boolean> => {
  try {
    console.log(`updateFieldMappingAndSync called for user ${userId}, field ${fieldId}`, updates);
    
    // First update the field mapping in Supabase
    const updated = await updateFieldMapping(userId, fieldId, updates);
    
    if (!updated) {
      console.error('Failed to update field mapping, skipping sheet sync');
      return false;
    }
    
    console.log('Field mapping updated successfully in database');
    
    // Then sync with Google Sheet if requested
    if (syncWithSheet) {
      console.log('Syncing updated field mappings with Google Sheet');
      const syncResult = await syncFieldMappingsWithSheet(userId);
      console.log('Sheet sync result:', syncResult);
      return syncResult;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating field mapping and syncing with sheet:', error);
    return false;
  }
}; 