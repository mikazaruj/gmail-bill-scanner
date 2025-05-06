import React, { useState, ChangeEvent } from 'react';
import { extractTextFromPdfFile, extractTextFromPdfUrl } from '../content/pdfProcessor';
import { HungarianBillData, extractHungarianBillData } from '../services/pdf/hungarianBillExtractor';
import '../styles/PdfTextExtractor.css';

/**
 * Component for extracting text from PDF files
 * 
 * NOTE: Much of this component's functionality is now provided by BillDataExtractor.tsx,
 * which uses the more robust field mapping approach. Consider using BillDataExtractor
 * for new implementations. This component is kept for backward compatibility and
 * simpler use cases where field mapping isn't required.
 */
const PdfTextExtractor: React.FC = () => {
  const [text, setText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [billData, setBillData] = useState<HungarianBillData | null>(null);
  const [language, setLanguage] = useState<string>('en');

  /**
   * Process extracted text to find structured bill data
   */
  const processBillData = (extractedText: string) => {
    setText(extractedText);
    
    // If Hungarian language is selected, try to extract structured bill data
    if (language === 'hu') {
      try {
        const hungarianData = extractHungarianBillData(extractedText);
        setBillData(hungarianData);
      } catch (err) {
        console.error('Error extracting bill data:', err);
        setBillData(null);
      }
    } else {
      setBillData(null);
    }
  };

  /**
   * Handle file input change
   */
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    // Type assertion to make TypeScript happy
    const fileInput = e.target as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) return;
    
    const file = fileInput.files[0];
    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setBillData(null);
    
    try {
      const extractedText = await extractTextFromPdfFile(file, language);
      processBillData(extractedText);
    } catch (err) {
      setError(`Error extracting text: ${err instanceof Error ? err.message : String(err)}`);
      setText('');
      setBillData(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle URL input submission
   */
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pdfUrl) {
      setError('Please enter a PDF URL');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setBillData(null);
    
    try {
      const extractedText = await extractTextFromPdfUrl(pdfUrl, language);
      processBillData(extractedText);
    } catch (err) {
      setError(`Error extracting text: ${err instanceof Error ? err.message : String(err)}`);
      setText('');
      setBillData(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle language change
   */
  const handleLanguageChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value);
    
    // If we already have text, try to extract bill data with the new language
    if (text && e.target.value === 'hu') {
      try {
        const hungarianData = extractHungarianBillData(text);
        setBillData(hungarianData);
      } catch (err) {
        console.error('Error extracting bill data:', err);
        setBillData(null);
      }
    } else {
      setBillData(null);
    }
  };

  return (
    <div className="pdf-extractor">
      <h2>PDF Text Extractor</h2>
      
      <div className="language-selector">
        <label htmlFor="language-select">Document Language:</label>
        <select 
          id="language-select" 
          value={language}
          onChange={handleLanguageChange}
          disabled={isLoading}
        >
          <option value="en">English</option>
          <option value="hu">Hungarian</option>
        </select>
      </div>
      
      <div className="file-input-section">
        <h3>Upload a PDF file</h3>
        <input 
          type="file" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          disabled={isLoading}
        />
      </div>
      
      <div className="url-input-section">
        <h3>Or enter a PDF URL</h3>
        <form onSubmit={handleUrlSubmit}>
          <input
            type="url"
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            placeholder="https://example.com/sample.pdf"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            Extract Text
          </button>
        </form>
      </div>
      
      {isLoading && <div className="loading">Processing PDF...</div>}
      
      {error && <div className="error">{error}</div>}
      
      {billData && (
        <div className="bill-data">
          <h3>Extracted Bill Data:</h3>
          <table>
            <tbody>
              <tr>
                <td>Invoice Number:</td>
                <td>{billData.invoiceNumber || '(Not found)'}</td>
              </tr>
              <tr>
                <td>Total Amount:</td>
                <td>{billData.totalAmount ? `${billData.totalAmount} Ft` : '(Not found)'}</td>
              </tr>
              <tr>
                <td>Due Date:</td>
                <td>{billData.dueDate || '(Not found)'}</td>
              </tr>
              <tr>
                <td>Billing Period:</td>
                <td>{billData.billingPeriod || '(Not found)'}</td>
              </tr>
              <tr>
                <td>User ID:</td>
                <td>{billData.userId || '(Not found)'}</td>
              </tr>
              <tr>
                <td>Name:</td>
                <td>{billData.name || '(Not found)'}</td>
              </tr>
              <tr>
                <td>Provider:</td>
                <td>{billData.provider || '(Not detected)'}</td>
              </tr>
              <tr>
                <td>Category:</td>
                <td>{billData.category || '(Not detected)'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      
      {text && (
        <div className="result">
          <h3>Extracted Raw Text:</h3>
          <pre>{text}</pre>
        </div>
      )}
    </div>
  );
};

export default PdfTextExtractor; 