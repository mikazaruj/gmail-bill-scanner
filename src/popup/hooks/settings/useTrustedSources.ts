import { useState, useCallback } from 'react';
import { 
  getTrustedSourcesView, 
  addTrustedSource, 
  removeTrustedSource, 
  deleteTrustedSource, 
  TrustedSourceView 
} from '../../../services/trustedSources';
import { resolveUserIdentity } from '../../../services/identity/userIdentityService';

export function useTrustedSources() {
  // Trusted sources state
  const [trustedSources, setTrustedSources] = useState<TrustedSourceView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [emailToDelete, setEmailToDelete] = useState<string>('');
  const [isDeleteAction, setIsDeleteAction] = useState<boolean>(false);
  
  // Plan limits
  const [maxTrustedSources, setMaxTrustedSources] = useState<number>(3);
  const [isLimited, setIsLimited] = useState<boolean>(true);

  // Helper function to ensure Google ID is available in headers
  const ensureGoogleIdHeader = async (userId: string) => {
    try {
      // First check if we have a Google ID in storage
      const { google_user_id } = await chrome.storage.local.get('google_user_id');
      
      if (!google_user_id) {
        console.log('No Google user ID found in storage, fetching from server');
        
        // Attempt to get Google ID by calling the background service
        const response = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ 
            type: 'GET_GOOGLE_USER_ID', 
            userId 
          }, (response) => {
            resolve(response || { success: false });
          });
        });
        
        if (response && response.google_user_id) {
          console.log('Received Google ID from server:', response.google_user_id);
          await chrome.storage.local.set({ 'google_user_id': response.google_user_id });
          return response.google_user_id;
        } else {
          console.error('Failed to get Google ID from server');
        }
      } else {
        console.log('Found existing Google ID in storage:', google_user_id);
      }
      
      return google_user_id;
    } catch (e) {
      console.error('Error ensuring Google ID header:', e);
      return null;
    }
  };

  const loadTrustedSources = useCallback(async (userId: string) => {
    try {
      setIsLoading(true);
      const sources = await getTrustedSourcesView(userId);
      setTrustedSources(sources);
      
      // Set plan limits based on first trusted source
      if (sources.length > 0) {
        setMaxTrustedSources(sources[0].max_trusted_sources);
        setIsLimited(sources[0].is_limited);
      }
      
      return sources;
    } catch (error) {
      console.error('Error loading trusted sources:', error);
      setTrustedSources([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleShowAddModal = () => {
    setIsAddModalOpen(true);
  };
  
  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
  };
  
  const handleAddSource = async (email: string, description?: string) => {
    try {
      setIsLoading(true);
      
      // Get user identity
      const identity = await resolveUserIdentity();
      if (!identity.supabaseId) {
        console.error('No user ID available, cannot add trusted source to Supabase');
        throw new Error('User not authenticated');
      }
      
      console.log('Adding trusted source:', { email, description, userId: identity.supabaseId });
      
      // Ensure Google ID is in headers/storage
      const googleId = await ensureGoogleIdHeader(identity.supabaseId);
      if (!googleId) {
        console.warn('Could not retrieve Google ID, RLS policies might fail');
      } else {
        console.log('Using Google ID for RLS:', googleId);
      }

      console.log('About to call addTrustedSource service function');
      
      // Call the addTrustedSource service function with the userId parameter
      const updatedSources = await addTrustedSource(email, identity.supabaseId, description);
      console.log('Trusted sources updated, response:', updatedSources);
      
      console.log('About to refresh trusted sources from view');
      // Refresh trusted sources from the view to get updated counts
      const sources = await getTrustedSourcesView(identity.supabaseId);
      console.log('Received sources from view:', sources);
      setTrustedSources(sources);
      
      // Update plan limits based on first trusted source
      if (sources.length > 0) {
        setMaxTrustedSources(sources[0].max_trusted_sources);
        setIsLimited(sources[0].is_limited);
      }
      
      // Show success message (you can implement this with a toast notification or similar)
      console.log('Successfully added trusted source:', email);
      
      // Close the modal
      handleCloseAddModal();
      
      return true;
    } catch (error) {
      console.error('Error adding trusted source:', error);
      // Show error message to user
      alert(`Failed to add trusted source: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleShowDeleteModal = (email: string, isDelete: boolean = false) => {
    setEmailToDelete(email);
    setIsDeleteAction(isDelete);
    setIsDeleteModalOpen(true);
  };
  
  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setEmailToDelete('');
    setIsDeleteAction(false);
  };
  
  const handleDeleteSource = async () => {
    if (!emailToDelete) return false;
    
    console.log('Starting handleDeleteSource with email:', emailToDelete, 'isDelete:', isDeleteAction);
    
    try {
      setIsLoading(true);
      
      // Get user identity
      const identity = await resolveUserIdentity();
      if (!identity.supabaseId) {
        console.error('No user ID available, cannot remove/delete trusted source');
        throw new Error('User not authenticated');
      }
      
      console.log('User ID available:', identity.supabaseId);
      
      // Ensure Google ID is in headers/storage
      const googleId = await ensureGoogleIdHeader(identity.supabaseId);
      if (!googleId) {
        console.warn('Could not retrieve Google ID, RLS policies might fail');
      } else {
        console.log('Using Google ID for RLS:', googleId);
      }
      
      console.log('About to call trusted source service function');
      
      // Call the appropriate function based on the action type
      let result;
      if (isDeleteAction) {
        console.log('Permanently deleting trusted source:', emailToDelete);
        result = await deleteTrustedSource(emailToDelete, identity.supabaseId);
        console.log('Delete response:', result);
      } else {
        console.log('Removing (deactivating) trusted source:', emailToDelete);
        result = await removeTrustedSource(emailToDelete, identity.supabaseId);
        console.log('Remove response:', result);
      }
      
      console.log('Successfully completed delete/remove operation, response:', result);
      
      console.log('About to refresh trusted sources from view');
      // Refresh trusted sources from the view to get updated counts
      const sources = await getTrustedSourcesView(identity.supabaseId);
      console.log('Received sources from view:', sources);
      setTrustedSources(sources);
      
      // Update plan limits based on first trusted source
      if (sources.length > 0) {
        setMaxTrustedSources(sources[0].max_trusted_sources);
        setIsLimited(sources[0].is_limited);
      }
      
      // Close the modal
      handleCloseDeleteModal();
      
      return true;
    } catch (error) {
      console.error('Error removing/deleting trusted source:', error);
      // Show error message to user
      alert(`Failed to ${isDeleteAction ? 'delete' : 'remove'} trusted source: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    trustedSources,
    setTrustedSources,
    isLoading,
    setIsLoading,
    isAddModalOpen,
    setIsAddModalOpen,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    emailToDelete,
    setEmailToDelete,
    isDeleteAction,
    setIsDeleteAction,
    maxTrustedSources,
    setMaxTrustedSources,
    isLimited,
    setIsLimited,
    loadTrustedSources,
    handleShowAddModal,
    handleCloseAddModal,
    handleAddSource,
    handleShowDeleteModal,
    handleCloseDeleteModal,
    handleDeleteSource
  };
} 