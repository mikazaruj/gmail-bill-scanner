import React, { useEffect, useState } from "react";
import { isAuthenticated, authenticate, signOut } from "../services/auth/googleAuth";
import { scanEmailsForBills } from "../services/gmail/gmailService";
import { exportBillsToSheet, createBillsSpreadsheet } from "../services/sheets/sheetsService";
import ScanResults from "./components/ScanResults";
import ScannedBill from "../types/ScannedBill";
import "../globals.css";

export default function Popup() {
  const [isAuth, setIsAuth] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanResults, setScanResults] = useState<ScannedBill[]>([]);
  const [scanning, setScanning] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<'recent' | 'all'>('recent');

  useEffect(() => {
    checkAuthStatus();
  }, []);

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
      setScanResults([]);
    } catch (error) {
      setError("Failed to sign out");
      console.error("Logout error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleScanEmails = async () => {
    if (!isAuth) return;
    
    setScanning(true);
    setError(null);
    
    try {
      // In a real implementation, this would use the actual Gmail API service
      // For development, we'll use a small number to limit API calls
      const maxResults = 5;
      const bills = await scanEmailsForBills(maxResults);
      
      setScanResults(bills);
    } catch (error) {
      setError("Failed to scan emails");
      console.error("Scan error:", error);
    } finally {
      setScanning(false);
    }
  };

  const handleExportToSheets = async () => {
    if (!isAuth || scanResults.length === 0) return;
    
    setExporting(true);
    setError(null);
    
    try {
      // Export bills to Google Sheets
      // If no spreadsheet ID is set, it will create a new one
      const success = await exportBillsToSheet(scanResults);
      
      if (success) {
        // Show success message
        setError(null);
        alert("Bills successfully exported to Google Sheets!");
      } else {
        setError("Failed to export bills to Google Sheets");
      }
    } catch (error) {
      setError("Error exporting to Google Sheets");
      console.error("Export error:", error);
    } finally {
      setExporting(false);
    }
  };

  const handleCreateNewSheet = async () => {
    if (!isAuth) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const spreadsheetId = await createBillsSpreadsheet();
      
      if (spreadsheetId) {
        setError(null);
        alert(`New spreadsheet created with ID: ${spreadsheetId}`);
      } else {
        setError("Failed to create new spreadsheet");
      }
    } catch (error) {
      setError("Error creating spreadsheet");
      console.error("Spreadsheet creation error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-80 h-96 flex items-center justify-center p-4 bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="w-80 h-96 p-4 bg-gray-50 flex flex-col">
        <h1 className="text-xl font-bold text-center mb-4">Gmail Bill Scanner</h1>
        <p className="text-sm text-gray-600 mb-8 text-center">
          Scan your emails for bills and export them to Google Sheets
        </p>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}
        
        <div className="flex-grow"></div>
        
        <button
          onClick={handleLogin}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors w-full"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 h-96 p-4 bg-gray-50 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Gmail Bill Scanner</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          Sign out
        </button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}
      
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => setCurrentTab('recent')}
          className={`flex-1 py-2 text-sm font-medium rounded-md ${
            currentTab === 'recent'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Recent Bills
        </button>
        <button
          onClick={() => setCurrentTab('all')}
          className={`flex-1 py-2 text-sm font-medium rounded-md ${
            currentTab === 'all'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All Bills
        </button>
      </div>
      
      <div className="flex-grow overflow-auto">
        {scanning ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-sm text-gray-600">Scanning emails for bills...</p>
            </div>
          </div>
        ) : scanResults.length > 0 ? (
          <ScanResults bills={scanResults} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-gray-600 text-center">
              No bills found. Click the scan button to get started.
            </p>
          </div>
        )}
      </div>
      
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={handleScanEmails}
          disabled={scanning}
          className={`py-2 px-4 rounded-md text-sm font-medium ${
            scanning
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          Scan Emails
        </button>
        <button
          onClick={handleExportToSheets}
          disabled={scanResults.length === 0 || scanning || exporting}
          className={`py-2 px-4 rounded-md text-sm font-medium ${
            scanResults.length === 0 || scanning || exporting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {exporting ? "Exporting..." : "Export to Sheets"}
        </button>
      </div>
      
      <div className="mt-2">
        <button
          onClick={handleCreateNewSheet}
          disabled={scanning || exporting}
          className="text-xs text-blue-600 hover:text-blue-800 underline w-full text-center"
        >
          Create new Google Sheet
        </button>
      </div>
    </div>
  );
} 