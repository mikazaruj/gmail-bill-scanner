import React, { useState, useEffect } from 'react';
import { Mail, FileSpreadsheet, ChevronDown, Loader, RefreshCw, PlusCircle } from 'lucide-react';
import CollapsibleSection from '../CollapsibleSection';
import { useConnectionManager } from '../../hooks/settings/useConnectionManager';
import { useSettingsApi } from '../../hooks/settings/useSettingsApi';
import { UserSheet } from '../../../services/connectedServices';

interface ConnectedServicesSectionProps {
  userId: string | null;
}

// Create a separate modal component to avoid TypeScript errors
const CreateSheetModal = ({ 
  isOpen, 
  onClose, 
  sheetName, 
  onSheetNameChange, 
  onCreateSheet 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  sheetName: string; 
  onSheetNameChange: (value: string) => void; 
  onCreateSheet: () => void;
}) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-3">Create New Sheet</h3>
        <div className="mb-4">
          <label className="block text-sm text-gray-700 mb-1">Sheet Name</label>
          <input
            type="text"
            className="w-full p-2 border border-gray-300 rounded"
            value={sheetName}
            onChange={(e) => onSheetNameChange(e.target.value)}
            placeholder="Enter sheet name"
          />
        </div>
        <div className="flex justify-end space-x-2">
          <button
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded"
            onClick={onCreateSheet}
            disabled={!sheetName.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

const ConnectedServicesSection = ({ userId }: ConnectedServicesSectionProps) => {
  const {
    userConnection,
    userSheets,
    isConnectionLoading,
    isSheetDropdownOpen,
    availableSheets,
    isLoadingSheets,
    sheetError,
    isCreateSheetModalOpen,
    setIsCreateSheetModalOpen,
    newSheetName,
    setNewSheetName,
    loadConnectionsFromStorage,
    loadConnectionsFromDatabase,
    handleSheetDropdownClick,
    handleSelectSheet,
    handleCreateNewSheet,
    handleReconnectGmail
  } = useConnectionManager();

  const {
    userSettingsData,
    setUserSettingsData
  } = useSettingsApi();

  // Load connection data on component mount
  useEffect(() => {
    // Only update settings data if we have a valid userId
    if (!userId) return;

    const updateSettingsFromSheets = async () => {
      try {
        // Find the default sheet
        const defaultSheet = userSheets.find(sheet => sheet.is_default);
        
        // Update user settings data if we have a default sheet
        if (defaultSheet) {
          setUserSettingsData(prev => prev ? {
            ...prev,
            spreadsheet_id: defaultSheet.sheet_id,
            spreadsheet_name: defaultSheet.sheet_name,
          } : {
            spreadsheet_id: defaultSheet.sheet_id,
            spreadsheet_name: defaultSheet.sheet_name,
            scan_frequency: 'manual',
          });
        }
      } catch (error) {
        console.error('Error updating settings from sheets:', error);
      }
    };
    
    // Run this effect when userSheets changes
    if (userSheets.length > 0) {
      updateSettingsFromSheets();
    }
  }, [userId, userSheets, setUserSettingsData]);

  // Get default sheet
  const defaultSheet = userSheets.find(sheet => sheet.is_default);

  // Callback for when a sheet is selected
  const onSheetSelected = (sheet: UserSheet) => {
    setUserSettingsData(prev => ({
      ...prev,
      spreadsheet_id: sheet.sheet_id,
      spreadsheet_name: sheet.sheet_name,
      scan_frequency: prev?.scan_frequency || 'manual'
    }));
  };

  // Callback for when a new sheet is created
  const onSheetCreated = (sheet: UserSheet) => {
    setUserSettingsData(prev => ({
      ...prev,
      spreadsheet_id: sheet.sheet_id,
      spreadsheet_name: sheet.sheet_name,
      scan_frequency: prev?.scan_frequency || 'manual'
    }));
  };

  // Render the component with the modal outside of CollapsibleSection
  return (
    <>
      <CollapsibleSection title="Connected Services" defaultOpen={true}>
        <div className="space-y-1.5">
          <div className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center mr-2">
                  <Mail size={14} className="text-red-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Gmail</div>
                  <div className="text-xs text-gray-500">
                    {isConnectionLoading 
                      ? 'Loading...' 
                      : userConnection?.gmail_email || 'user@gmail.com'}
                  </div>
                </div>
              </div>
              <div 
                className={`px-2 py-0.5 text-xs ${
                  !isConnectionLoading && userConnection?.gmail_connected
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800 cursor-pointer hover:bg-yellow-200'
                } rounded-full font-medium`}
                onClick={() => {
                  if (!isConnectionLoading && !userConnection?.gmail_connected) {
                    handleReconnectGmail();
                  }
                }}
                role="button"
                aria-label={userConnection?.gmail_connected ? "Connected" : "Click to reconnect Gmail"}
              >
                {isConnectionLoading 
                  ? 'Loading...' 
                  : userConnection?.gmail_connected ? 'Connected' : 'Reconnect'}
              </div>
            </div>
          </div>
          
          <div className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center mr-2">
                  <FileSpreadsheet size={14} className="text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Google Sheets</div>
                  {isConnectionLoading ? (
                    <div className="text-xs text-gray-500">Loading...</div>
                  ) : defaultSheet?.sheet_id || userSettingsData?.spreadsheet_id ? (
                    <div className="text-xs text-gray-500">
                      {(defaultSheet?.sheet_name || userSettingsData?.spreadsheet_name)}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic">No sheet connected</div>
                  )}
                </div>
              </div>
              <button 
                className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors flex items-center"
                onClick={handleSheetDropdownClick}
                disabled={isConnectionLoading}
                aria-expanded={isSheetDropdownOpen}
                aria-controls="sheet-dropdown"
              >
                {isConnectionLoading && (
                  <Loader size={12} className="animate-spin mr-1" />
                )}
                {!isConnectionLoading && (
                  <>
                    {isSheetDropdownOpen 
                      ? 'Cancel'
                      : defaultSheet?.sheet_id || userSettingsData?.spreadsheet_id 
                        ? 'Change Sheet' 
                        : 'Choose Sheet'
                    }
                    {!isSheetDropdownOpen && (
                      <ChevronDown size={12} className="ml-1" />
                    )}
                  </>
                )}
              </button>
            </div>
            
            {/* Sheet selection dropdown - always rendered but conditionally visible */}
            <div 
              id="sheet-dropdown" 
              className={`mt-2 p-1 bg-white border border-gray-200 rounded-md shadow-md ${isSheetDropdownOpen ? '' : 'hidden'}`}
            >
              {isLoadingSheets ? (
                <div className="p-3 flex items-center justify-center">
                  <Loader size={16} className="animate-spin mr-2" />
                  <span className="text-xs text-gray-500">Loading your sheets...</span>
                </div>
              ) : sheetError ? (
                <div className="p-3">
                  <div className="text-xs text-red-500 mb-1">{sheetError}</div>
                  <button 
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center"
                    onClick={() => handleSheetDropdownClick()}
                  >
                    <RefreshCw size={10} className="mr-1" /> Try Again
                  </button>
                </div>
              ) : availableSheets.length === 0 ? (
                <div className="p-3">
                  <div className="text-xs text-gray-500 mb-2">No spreadsheets found.</div>
                  <button 
                    className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md flex items-center"
                    onClick={() => setIsCreateSheetModalOpen(true)}
                  >
                    <PlusCircle size={10} className="mr-1" /> Create New Sheet
                  </button>
                </div>
              ) : (
                <div>
                  <div className="max-h-36 overflow-y-auto">
                    {availableSheets.map(sheet => (
                      <div 
                        key={sheet.id}
                        className="p-2 text-xs hover:bg-gray-100 cursor-pointer rounded-md flex items-center"
                        onClick={() => handleSelectSheet(
                          {
                            id: sheet.id,
                            user_id: userId || 'local-user',
                            sheet_id: sheet.id,
                            sheet_name: sheet.name,
                            is_default: true,
                            is_connected: true,
                            last_connected_at: new Date().toISOString(),
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                          },
                          onSheetSelected
                        )}
                      >
                        <FileSpreadsheet size={12} className="text-green-600 mr-1.5" />
                        {sheet.name}
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <div 
                      className="p-2 text-xs hover:bg-blue-50 cursor-pointer rounded-md flex items-center text-blue-600"
                      onClick={() => setIsCreateSheetModalOpen(true)}
                    >
                      <PlusCircle size={12} className="mr-1.5" />
                      Create New Sheet
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>
      
      <CreateSheetModal 
        isOpen={isCreateSheetModalOpen}
        onClose={() => setIsCreateSheetModalOpen(false)}
        sheetName={newSheetName}
        onSheetNameChange={setNewSheetName}
        onCreateSheet={() => {
          setIsCreateSheetModalOpen(false);
          handleCreateNewSheet(newSheetName, onSheetCreated);
        }}
      />
    </>
  );
};

export default ConnectedServicesSection; 