import React, { useEffect, useState } from "react";
import { isAuthenticated, authenticate, signOut } from "../services/auth/googleAuth";
import { getSpreadsheetId, setSpreadsheetId, listUserSpreadsheets } from "../services/sheets/sheetsService";
import "../globals.css";

interface SpreadsheetOption {
  id: string;
  name: string;
}

export default function Options() {
  const [isAuth, setIsAuth] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [spreadsheetId, setCurrentSpreadsheetId] = useState<string>("");
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetOption[]>([]);
  const [loadingSpreadsheets, setLoadingSpreadsheets] = useState<boolean>(false);
  const [scanPreferences, setScanPreferences] = useState({
    scanAttachments: true,
    scanSubject: true,
    scanBody: true,
    daysToScan: 30,
    maxResults: 50,
  });
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (isAuth) {
      loadSpreadsheetId();
      loadSpreadsheets();
      loadPreferences();
    }
  }, [isAuth]);

  const checkAuthStatus = async () => {
    try {
      const authStatus = await isAuthenticated();
      setIsAuth(authStatus);
    } catch (error) {
      setError("Failed to check authentication status");
      console.error("Auth check error:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSpreadsheetId = async () => {
    const id = getSpreadsheetId() || "";
    setCurrentSpreadsheetId(id);
  };

  const loadSpreadsheets = async () => {
    if (!isAuth) return;
    
    setLoadingSpreadsheets(true);
    setError(null);
    
    try {
      const sheets = await listUserSpreadsheets();
      setSpreadsheets(sheets);
    } catch (error) {
      setError("Failed to load spreadsheets");
      console.error("Error loading spreadsheets:", error);
    } finally {
      setLoadingSpreadsheets(false);
    }
  };

  const loadPreferences = async () => {
    try {
      // Get scan preferences from storage
      chrome.storage.local.get(["scanPreferences"], (result) => {
        if (result.scanPreferences) {
          setScanPreferences(result.scanPreferences);
        }
      });
    } catch (error) {
      console.error("Error loading preferences:", error);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await authenticate();
      
      if (result.success) {
        setIsAuth(true);
      } else {
        setError(result.error || "Authentication failed");
      }
    } catch (error) {
      setError("An unexpected error occurred during authentication");
      console.error("Auth error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await signOut();
      setIsAuth(false);
    } catch (error) {
      setError("Failed to sign out");
      console.error("Logout error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpreadsheetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentSpreadsheetId(e.target.value);
  };

  const handleManualSpreadsheetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentSpreadsheetId(e.target.value);
  };

  const handleScanPreferenceChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    setScanPreferences(prev => ({
      ...prev,
      [name]: type === "checkbox" 
        ? (e.target as HTMLInputElement).checked 
        : type === "number" 
          ? parseInt(value, 10) 
          : value
    }));
  };

  const handleSaveSettings = async () => {
    setError(null);
    setSaveSuccess(false);
    
    try {
      // Save spreadsheet ID
      setSpreadsheetId(spreadsheetId);
      
      // Save preferences to storage
      chrome.storage.local.set({ scanPreferences }, () => {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      });
    } catch (error) {
      setError("Failed to save settings");
      console.error("Error saving settings:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-center mb-6">Gmail Bill Scanner Options</h1>
          <p className="text-gray-600 mb-8 text-center">
            Please sign in with your Google account to configure the extension.
          </p>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Extension Options</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Sign out
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {saveSuccess && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            Settings saved successfully!
          </div>
        )}
        
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Google Sheets Integration</h2>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">
              Select a Google Sheet:
            </label>
            <div className="flex gap-2">
              <select
                value={spreadsheetId}
                onChange={handleSpreadsheetChange}
                className="block w-full p-2 border border-gray-300 rounded"
                disabled={loadingSpreadsheets}
              >
                <option value="">-- Select a spreadsheet --</option>
                {spreadsheets.map(sheet => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name}
                  </option>
                ))}
              </select>
              <button
                onClick={loadSpreadsheets}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
                disabled={loadingSpreadsheets}
              >
                {loadingSpreadsheets ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">
              Or enter a Spreadsheet ID manually:
            </label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={handleManualSpreadsheetIdChange}
              placeholder="Enter Google Spreadsheet ID"
              className="block w-full p-2 border border-gray-300 rounded"
            />
            <p className="text-xs text-gray-500 mt-1">
              You can find the ID in the URL of your Google Sheet: 
              https://docs.google.com/spreadsheets/d/<span className="font-mono">SPREADSHEET_ID</span>/edit
            </p>
          </div>
        </div>
        
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Scan Preferences</h2>
          
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="scanAttachments"
                  checked={scanPreferences.scanAttachments}
                  onChange={handleScanPreferenceChange}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span>Scan PDF attachments</span>
              </label>
            </div>
            
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="scanSubject"
                  checked={scanPreferences.scanSubject}
                  onChange={handleScanPreferenceChange}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span>Scan email subject</span>
              </label>
            </div>
            
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="scanBody"
                  checked={scanPreferences.scanBody}
                  onChange={handleScanPreferenceChange}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span>Scan email body</span>
              </label>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-1">
                Days to scan:
              </label>
              <select
                name="daysToScan"
                value={scanPreferences.daysToScan}
                onChange={handleScanPreferenceChange}
                className="block w-full p-2 border border-gray-300 rounded"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            
            <div>
              <label className="block text-gray-700 mb-1">
                Maximum emails to scan:
              </label>
              <input
                type="number"
                name="maxResults"
                value={scanPreferences.maxResults}
                onChange={handleScanPreferenceChange}
                min={1}
                max={200}
                className="block w-full p-2 border border-gray-300 rounded"
              />
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSaveSettings}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
} 