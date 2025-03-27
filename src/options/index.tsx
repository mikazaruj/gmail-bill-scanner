import React, { useEffect, useState } from "react";
import * as ReactDOM from 'react-dom/client';
import { isAuthenticated, authenticate, signOut } from "../services/auth/googleAuth";
import { getSpreadsheetId, setSpreadsheetId, listUserSpreadsheets } from "../services/sheets/sheetsService";
import "../globals.css";

interface SpreadsheetOption {
  id: string;
  name: string;
}

const Options = () => {
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
  const [maxResults, setMaxResults] = useState(20);
  const [searchDays, setSearchDays] = useState(30);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkAuthStatus();
    loadSettings();
  }, []);

  useEffect(() => {
    if (isAuth) {
      loadSpreadsheetId();
      loadSpreadsheets();
      loadPreferences();
    }
  }, [isAuth]);

  const loadSettings = async () => {
    chrome.storage.sync.get(
      {
        spreadsheetId: '',
        maxResults: 20,
        searchDays: 30
      }, 
      (items) => {
        setCurrentSpreadsheetId(items.spreadsheetId);
        setMaxResults(items.maxResults);
        setSearchDays(items.searchDays);
        setLoading(false);
      }
    );
  };

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
    const newName = name as keyof typeof scanPreferences;
    
    setScanPreferences(prev => ({
      ...prev,
      [newName]: type === "checkbox" 
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

  const handleSave = () => {
    setIsSaving(true);
    setMessage('');

    chrome.storage.sync.set(
      {
        spreadsheetId,
        maxResults,
        searchDays
      },
      () => {
        setIsSaving(false);
        setMessage('Settings saved!');
        
        // Clear message after 3 seconds
        setTimeout(() => {
          setMessage('');
        }, 3000);
      }
    );
  };

  const handleCreateSheet = () => {
    setIsSaving(true);
    setMessage('');

    chrome.runtime.sendMessage({ type: "CREATE_SPREADSHEET" }, (response) => {
      setIsSaving(false);
      
      if (response.success && response.spreadsheetId) {
        setCurrentSpreadsheetId(response.spreadsheetId);
        setMessage('New spreadsheet created!');
      } else {
        setMessage('Error creating spreadsheet: ' + (response.error || 'Unknown error'));
      }
    });
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
          <h1 className="text-2xl font-bold text-center mb-6">Gmail Bill Scanner</h1>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <p className="text-gray-600 mb-6 text-center">
            Sign in with your Google account to use this extension.
          </p>
          
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
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Gmail Bill Scanner Settings</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {message && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {message}
        </div>
      )}
      
      {/* Google Authentication Section */}
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <h2 className="text-xl font-semibold mb-4">Google Account</h2>
        
        <div>
          <p className="mb-4">Successfully authenticated with Google!</p>
          <button
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            onClick={handleLogout}
            disabled={loading}
          >
            {loading ? "Processing..." : "Sign Out"}
          </button>
        </div>
      </div>
      
      {/* Scan Settings Section */}
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <h2 className="text-xl font-semibold mb-4">Scan Settings</h2>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Days to scan (past)
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            type="number"
            min="1"
            max="365"
            value={searchDays}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchDays(parseInt(e.target.value))}
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Maximum emails to scan
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            type="number"
            min="1"
            max="500"
            value={maxResults}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxResults(parseInt(e.target.value))}
          />
        </div>
        
        <div className="flex items-center justify-end">
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
      
      {/* Google Sheets Integration */}
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <h2 className="text-xl font-semibold mb-4">Google Sheets Integration</h2>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Select a Google Sheet
          </label>
          
          {loadingSpreadsheets ? (
            <p>Loading spreadsheets...</p>
          ) : (
            <select
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              value={spreadsheetId}
              onChange={handleSpreadsheetChange}
              disabled={!isAuth}
            >
              <option value="">-- Select a spreadsheet --</option>
              {spreadsheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.name}
                </option>
              ))}
            </select>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Or enter Spreadsheet ID manually
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            type="text"
            value={spreadsheetId}
            onChange={handleManualSpreadsheetIdChange}
            placeholder="Spreadsheet ID from URL"
            disabled={!isAuth}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <button
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            onClick={handleCreateSheet}
            disabled={!isAuth || loading}
          >
            Create New Sheet
          </button>
          
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            onClick={handleSaveSettings}
            disabled={!isAuth || !spreadsheetId || loading}
          >
            Save Sheet ID
          </button>
        </div>
      </div>
      
      <div className="text-center text-gray-500 text-xs">
        &copy; 2023 Gmail Bill Scanner. All rights reserved.
      </div>
    </div>
  );
};

// Create root element
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement as HTMLElement);
  root.render(<Options />);
} 