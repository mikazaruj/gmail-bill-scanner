import React, { useEffect, useState } from "react";
import * as ReactDOM from 'react-dom/client';
import { isAuthenticated, authenticate, signOut } from "../services/auth/googleAuth";
import { getSpreadsheetId, setSpreadsheetId, listUserSpreadsheets, createBillsSpreadsheet } from "../services/sheets/sheetsService";
import "../globals.css";
import { AccountManagement } from './AccountManagement';
import { BillFieldConfig } from '../types/Message';

interface SpreadsheetOption {
  id: string;
  name: string;
}

// Default bill fields
const DEFAULT_BILL_FIELDS: BillFieldConfig[] = [
  {
    id: 'company',
    name: 'Company',
    type: 'string',
    required: true,
    description: 'Company or vendor name'
  },
  {
    id: 'amount',
    name: 'Amount',
    type: 'number',
    required: true,
    description: 'Bill amount'
  },
  {
    id: 'dueDate',
    name: 'Due Date',
    type: 'date',
    required: true,
    description: 'Date when payment is due'
  },
  {
    id: 'category',
    name: 'Category',
    type: 'string',
    required: false,
    description: 'Bill category (e.g., Utilities, Internet)'
  }
];

const Options = () => {
  const [isAuth, setIsAuth] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [spreadsheetId, setSpreadsheetIdState] = useState<string>("");
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetOption[]>([]);
  const [loadingSpreadsheets, setLoadingSpreadsheets] = useState<boolean>(false);
  const [newSheetName, setNewSheetName] = useState<string>("");
  const [isCreatingSheet, setIsCreatingSheet] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [showFirstRun, setShowFirstRun] = useState<boolean>(true);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [activeTab, setActiveTab] = useState('settings');
  const [billFields, setBillFields] = useState<BillFieldConfig[]>([]);
  const [newField, setNewField] = useState<Partial<BillFieldConfig>>({
    type: 'string',
    required: false
  });
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuth) {
      loadSpreadsheets();
    }
  }, [isAuth]);

  useEffect(() => {
    // Load saved fields on mount
    chrome.storage.sync.get(['billFields'], (result) => {
      if (result.billFields) {
        setBillFields(result.billFields);
      } else {
        // Initialize with default fields if none exist
        chrome.storage.sync.set({ billFields: DEFAULT_BILL_FIELDS }, () => {
          setBillFields(DEFAULT_BILL_FIELDS);
        });
      }
    });
  }, []);

  const checkAuth = async () => {
    try {
      const authStatus = await isAuthenticated();
      setIsAuth(authStatus);
      setIsLoading(false);
      
      // Check if this is first run
      const firstRun = await chrome.storage.local.get('firstRun');
      if (firstRun.firstRun === undefined) {
        setShowFirstRun(true);
        await chrome.storage.local.set({ firstRun: true });
      } else {
        setShowFirstRun(false);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      const result = await authenticate();
      if (result.success) {
        setIsAuth(true);
        await loadSpreadsheets();
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to authenticate');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setIsAuth(false);
      setSpreadsheetIdState("");
      setSpreadsheets([]);
    } catch (error) {
      console.error('Logout error:', error);
      setError('Failed to sign out');
    }
  };

  const loadSpreadsheets = async () => {
    try {
      setLoadingSpreadsheets(true);
      const sheets = await listUserSpreadsheets();
      setSpreadsheets(sheets);
      
      const currentId = await getSpreadsheetId();
      if (currentId) {
        setSpreadsheetIdState(currentId);
      }
      
      setLoadingSpreadsheets(false);
    } catch (error) {
      console.error('Error loading spreadsheets:', error);
      setError('Failed to load spreadsheets');
      setLoadingSpreadsheets(false);
    }
  };

  const handleSpreadsheetChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = event.target.value;
    try {
      await setSpreadsheetId(newId);
      setSpreadsheetIdState(newId);
      setError("");
    } catch (error) {
      console.error('Error setting spreadsheet:', error);
      setError('Failed to set spreadsheet');
    }
  };

  const handleCreateNewSheet = async () => {
    if (!newSheetName) {
      setError('Please enter a name for the new spreadsheet');
      return;
    }
    
    try {
      setIsCreatingSheet(true);
      const spreadsheetId = await createBillsSpreadsheet();
      await loadSpreadsheets();
      setSpreadsheetIdState(spreadsheetId);
      await setSpreadsheetId(spreadsheetId);
      setNewSheetName("");
      setError("");
      setIsCreatingSheet(false);
      
      if (showFirstRun) {
        setCurrentStep(3);
      }
    } catch (error) {
      console.error('Error creating spreadsheet:', error);
      setError(error instanceof Error ? error.message : 'Failed to create spreadsheet');
      setIsCreatingSheet(false);
    }
  };

  const handleNextStep = () => {
    setCurrentStep(prev => prev + 1);
  };

  const handleFinishSetup = async () => {
    setShowFirstRun(false);
    await chrome.storage.local.set({ firstRun: false });
  };

  const createNewSheet = async () => {
    setIsCreatingSheet(true);
    setError("");
    try {
      const spreadsheetId = await createBillsSpreadsheet();
      setSpreadsheetIdState(spreadsheetId);
      await setSpreadsheetId(spreadsheetId);
      setNewSheetName("");
      setError("");
      await loadSpreadsheets();
      setIsCreatingSheet(false);
    } catch (error) {
      console.error('Error creating spreadsheet:', error);
      setError(error instanceof Error ? error.message : 'Failed to create spreadsheet');
      setIsCreatingSheet(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // First get the current token
      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(token || '');
          }
        });
      });

      // Call Supabase to delete account
      const { signOut, deleteAccount } = await import('../services/supabase/client');
      await deleteAccount();
      await signOut();
      
      // Revoke Google access if we have a token
      if (token) {
        await chrome.identity.removeCachedAuthToken({ token });
      }
      
      // Clear extension storage
      await chrome.storage.local.clear();
      await chrome.storage.sync.clear();
      
      // Close options page
      window.close();
    } catch (error) {
      console.error('Error deleting account:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete account');
    }
  };

  const handleRevokeAccess = async () => {
    try {
      // First get the current token
      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(token || '');
          }
        });
      });

      // Revoke Google access if we have a token
      if (token) {
        await chrome.identity.removeCachedAuthToken({ token });
      }
      
      // Clear Google-related storage
      await chrome.storage.local.remove(['gmail_bill_scanner_auth_token']);
      
      // Sign out of Supabase but keep account
      const { signOut } = await import('../services/supabase/client');
      await signOut();
      
      // Close options page
      window.close();
    } catch (error) {
      console.error('Error revoking access:', error);
      setError(error instanceof Error ? error.message : 'Failed to revoke access');
    }
  };

  const handleAddField = () => {
    if (!newField.name || !newField.id) {
      setError('Name and ID are required');
      return;
    }

    const updatedFields = [...billFields, newField as BillFieldConfig];
    chrome.storage.sync.set({ billFields: updatedFields }, () => {
      setBillFields(updatedFields);
      setNewField({ type: 'string', required: false });
      setStatus('Field added successfully');
      setTimeout(() => setStatus(''), 3000);
    });
  };

  const handleRemoveField = (id: string) => {
    const updatedFields = billFields.filter(field => field.id !== id);
    chrome.storage.sync.set({ billFields: updatedFields }, () => {
      setBillFields(updatedFields);
      setStatus('Field removed successfully');
      setTimeout(() => setStatus(''), 3000);
    });
  };

  const handleResetFields = () => {
    chrome.storage.sync.set({ billFields: DEFAULT_BILL_FIELDS }, () => {
      setBillFields(DEFAULT_BILL_FIELDS);
      setStatus('Fields reset to default');
      setTimeout(() => setStatus(''), 3000);
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
        <div className="relative py-3 sm:max-w-xl sm:mx-auto">
          <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
            <div className="max-w-md mx-auto">
              <div className="divide-y divide-gray-200">
                <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                  <p className="text-center">Loading...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showFirstRun) {
    return (
      <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
        <div className="relative py-3 sm:max-w-xl sm:mx-auto">
          <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
            <div className="max-w-md mx-auto">
              <div className="divide-y divide-gray-200">
                <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                  <h1 className="text-2xl font-bold mb-4">Welcome to Gmail Bill Scanner!</h1>
                  
                  {currentStep === 1 && (
                    <div>
                      <p className="mb-4">Let's get you set up in a few quick steps.</p>
                      <p className="mb-4">First, you'll need to sign in with your Google account to allow access to Gmail and Google Sheets.</p>
                      {!isAuth ? (
          <button
            onClick={handleLogin}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Sign in with Google
          </button>
                      ) : (
                        <button
                          onClick={handleNextStep}
                          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                        >
                          Continue
                        </button>
                      )}
                    </div>
                  )}
                  
                  {currentStep === 2 && (
                    <div>
                      <p className="mb-4">Great! Now let's set up a Google Sheet to store your bill data.</p>
                      <p className="mb-4">You can either select an existing spreadsheet or create a new one.</p>
                      
                      {loadingSpreadsheets ? (
                        <p>Loading spreadsheets...</p>
                      ) : (
                        <div>
                          <select
                            className="w-full p-2 border rounded mb-4"
                            value={spreadsheetId}
                            onChange={handleSpreadsheetChange}
                          >
                            <option value="">-- Select an existing spreadsheet --</option>
                            {spreadsheets.map((sheet) => (
                              <option key={sheet.id} value={sheet.id}>
                                {sheet.name}
                              </option>
                            ))}
                          </select>
                          
                          <p className="mb-2">Or create a new spreadsheet:</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newSheetName}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSheetName(e.target.value)}
                              placeholder="Enter spreadsheet name"
                              className="flex-1 p-2 border rounded"
                            />
                            <button
                              onClick={handleCreateNewSheet}
                              disabled={isCreatingSheet}
                              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
                            >
                              {isCreatingSheet ? 'Creating...' : 'Create'}
                            </button>
                          </div>
                          
                          {spreadsheetId && (
                            <button
                              onClick={handleNextStep}
                              className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                            >
                              Continue
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {currentStep === 3 && (
                    <div>
                      <p className="mb-4">Perfect! You're all set up and ready to start scanning bills.</p>
                      <p className="mb-4">You can now:</p>
                      <ul className="list-disc list-inside mb-4">
                        <li>Scan your Gmail for bills</li>
                        <li>Export bill data to your selected spreadsheet</li>
                        <li>Configure scanning preferences</li>
                      </ul>
                      <button
                        onClick={handleFinishSetup}
                        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                      >
                        Get Started
                      </button>
                    </div>
                  )}
                  
                  {error && (
                    <p className="text-red-500 mt-4">{error}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="options-container">
      <h1>Gmail Bill Scanner Settings</h1>
      
      <div className="tabs">
        <button 
          className={activeTab === 'settings' ? 'active' : ''} 
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
          <button
          className={activeTab === 'account' ? 'active' : ''} 
          onClick={() => setActiveTab('account')}
          >
          Account
          </button>
        </div>
        
      {activeTab === 'settings' ? (
        <div className="settings-section">
          <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
            <div className="relative py-3 sm:max-w-xl sm:mx-auto">
              <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
                <div className="max-w-md mx-auto">
                  <div className="divide-y divide-gray-200">
                    <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                      <h1 className="text-2xl font-bold mb-4">Gmail Bill Scanner Settings</h1>
                      
                      <div className="mb-6">
                        <h2 className="text-xl font-semibold mb-4">Authentication</h2>
                        {!isAuth ? (
                          <button
                            onClick={handleLogin}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                          >
                            Sign in with Google
                          </button>
                        ) : (
                          <div>
                            <p className="mb-2">✓ Signed in to Google</p>
                            <button
                              onClick={handleLogout}
                              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                            >
                              Sign Out
                            </button>
          </div>
        )}
          </div>
        
        <div className="mb-6">
                        <h2 className="text-xl font-semibold mb-4">Google Sheets Integration</h2>
                        {isAuth ? (
                          <div>
                            {loadingSpreadsheets ? (
                              <p>Loading spreadsheets...</p>
                            ) : (
                              <>
          <div className="mb-4">
                                  <label className="block text-gray-700 text-sm font-bold mb-2">
                                    Select a Google Sheet
            </label>
              <select
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                value={spreadsheetId}
                onChange={handleSpreadsheetChange}
              >
                <option value="">-- Select a spreadsheet --</option>
                                    {spreadsheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name}
                  </option>
                ))}
              </select>
          </div>
          
          <div className="mb-4">
                                  <label className="block text-gray-700 text-sm font-bold mb-2">
                                    Or create a new spreadsheet
            </label>
                                  <div className="flex gap-2">
            <input
              type="text"
                                      value={newSheetName}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSheetName(e.target.value)}
                                      placeholder="Enter spreadsheet name"
                                      className="flex-1 shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                    />
                                    <button
                                      onClick={handleCreateNewSheet}
                                      disabled={isCreatingSheet}
                                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
                                    >
                                      {isCreatingSheet ? 'Creating...' : 'Create'}
                                    </button>
          </div>
        </div>
        
                                {spreadsheetId && (
                                  <div className="mt-4 p-4 bg-green-100 rounded">
                                    <p className="text-green-700">✓ Spreadsheet selected and ready for bill data</p>
                                    <p className="text-sm text-green-600 mt-1">ID: {spreadsheetId}</p>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-500">Please sign in to configure Google Sheets integration</p>
                        )}
            </div>
            
                      {error && (
                        <div className="text-red-500 mt-4">{error}</div>
                      )}
            </div>
            </div>
          </div>
            </div>
            </div>
          </div>
        </div>
      ) : (
        <AccountManagement 
          onDeleteAccount={handleDeleteAccount}
          onRevokeAccess={handleRevokeAccess}
        />
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<Options />);