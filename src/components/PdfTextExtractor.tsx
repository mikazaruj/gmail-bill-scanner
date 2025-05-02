import React, { useState, ChangeEvent } from 'react';
import { extractTextFromPdfFile, extractTextFromPdfUrl } from '../content/pdfProcessor';
import '../styles/PdfTextExtractor.css';

/**
 * Component for extracting text from PDF files
 */
const PdfTextExtractor: React.FC = () => {
  const [text, setText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string>('');

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
    
    try {
      const extractedText = await extractTextFromPdfFile(file);
      setText(extractedText);
    } catch (err) {
      setError(`Error extracting text: ${err instanceof Error ? err.message : String(err)}`);
      setText('');
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
    
    try {
      const extractedText = await extractTextFromPdfUrl(pdfUrl);
      setText(extractedText);
    } catch (err) {
      setError(`Error extracting text: ${err instanceof Error ? err.message : String(err)}`);
      setText('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pdf-extractor">
      <h2>PDF Text Extractor</h2>
      
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
      
      {text && (
        <div className="result">
          <h3>Extracted Text:</h3>
          <pre>{text}</pre>
        </div>
      )}
    </div>
  );
};

export default PdfTextExtractor; 