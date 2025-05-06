import React, { useState, useEffect } from 'react';
import { extractTextFromPdfFile } from '../content/pdfProcessor';
import { createClient } from '@supabase/supabase-js';
import '../styles/BillDataExtractor.css';

// Types
type BillData = Record<string, any>;

// Component props
interface BillDataExtractorProps {
  userId: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

/**
 * Component for extracting structured bill data from PDF files
 * using dynamic field mappings from Supabase
 */
const BillDataExtractor = ({
  userId,
  supabaseUrl,
  supabaseKey
}: BillDataExtractorProps): React.ReactElement => {
  // State
  const [file, setFile] = useState<File | null>(null);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [language, setLanguage] = useState<string>('hu');
  const [supabase, setSupabase] = useState<any>(null);
  
  // Initialize Supabase client when URL and key are available
  useEffect(() => {
    if (supabaseUrl && supabaseKey) {
      const client = createClient(supabaseUrl, supabaseKey);
      setSupabase(client);
    }
  }, [supabaseUrl, supabaseKey]);
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setBillData(null);
      setRawText('');
      setError('');
    }
  };
  
  // Process the selected PDF file
  const handleProcess = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      // Extract text from PDF with field extraction
      const extractedText = await extractTextFromPdfFile(file, language, userId, true);
      setRawText(extractedText);
      
      // Try to get the bill data from session storage (set by pdfProcessor)
      try {
        const storedData = sessionStorage.getItem('lastExtractedBillData');
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          setBillData(parsedData);
          // Clear the storage to avoid stale data
          sessionStorage.removeItem('lastExtractedBillData');
        } else {
          // Fallback if no stored data
          setError('No bill data found in the PDF');
        }
      } catch (storageError) {
        console.error('Error reading session storage:', storageError);
        setError('Could not retrieve bill data');
      }
    } catch (err) {
      console.error('Error processing PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to process PDF');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Change language handler
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value);
    setBillData(null);
  };
  
  // Render the component
  return (
    <div className="bill-extractor">
      <h2>Bill Data Extractor</h2>
      
      <div className="language-selector">
        <label htmlFor="language-select">Document Language:</label>
        <select 
          id="language-select" 
          value={language} 
          onChange={handleLanguageChange}
        >
          <option value="hu">Hungarian</option>
          <option value="en">English</option>
        </select>
      </div>
      
      <div className="file-input">
        <label htmlFor="pdf-file">Select Bill PDF:</label>
        <input
          type="file"
          id="pdf-file"
          accept=".pdf"
          onChange={handleFileChange}
        />
      </div>
      
      <button 
        onClick={handleProcess} 
        disabled={!file || isLoading}
        className="process-button"
      >
        {isLoading ? 'Processing...' : 'Extract Data'}
      </button>
      
      {error && <div className="error-message">{error}</div>}
      
      {billData && (
        <div className="results-container">
          <h3>Extracted Bill Data</h3>
          <div className="bill-data">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(billData)
                  .filter(([key]) => !key.startsWith('extraction_'))
                  .map(([key, value]) => (
                    <tr key={key}>
                      <td>{key.replace(/_/g, ' ')}</td>
                      <td>{value}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {rawText && (
        <div className="raw-text-container">
          <h3>Raw Text (Debug)</h3>
          <details>
            <summary>Show/Hide Raw Text</summary>
            <pre className="raw-text">{rawText}</pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default BillDataExtractor; 