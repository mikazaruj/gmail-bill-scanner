/**
 * PDF Extraction Test Module
 * 
 * Use this module to test PDF extraction functionality in different environments.
 * You can execute these functions from the background service worker or content script
 * to verify that PDF extraction is working correctly.
 */

import { extractPdfText, extractTextFromPdfBuffer } from './main';
import { isServiceWorkerContext } from './cleanPdfExtractor';

/**
 * Test basic PDF extraction
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @returns Test result summary
 */
export async function testPdfExtraction(pdfData: ArrayBuffer | Uint8Array): Promise<string> {
  console.log('[PDF Test] Starting PDF extraction test');
  
  try {
    // Log environment information
    const inServiceWorker = isServiceWorkerContext();
    console.log(`[PDF Test] Running in service worker context: ${inServiceWorker}`);
    
    // Test main extraction function
    console.log('[PDF Test] Testing main extraction function');
    const startTime = performance.now();
    const result = await extractPdfText(pdfData, {
      includePosition: true,
      timeout: 30000
    });
    const duration = Math.round(performance.now() - startTime);
    
    // Log results
    console.log(`[PDF Test] Extraction completed in ${duration}ms`);
    console.log(`[PDF Test] Success: ${result.success}`);
    console.log(`[PDF Test] Text length: ${result.text?.length || 0} characters`);
    console.log(`[PDF Test] Pages: ${result.pages?.length || 0}`);
    
    if (!result.success) {
      console.error(`[PDF Test] Error: ${result.error}`);
      return `❌ PDF Extraction Failed: ${result.error}`;
    }
    
    // Test simple text extraction
    console.log('[PDF Test] Testing simple text extraction');
    const textOnly = await extractTextFromPdfBuffer(pdfData);
    console.log(`[PDF Test] Simple extraction: ${textOnly.length} characters`);
    
    return `✅ PDF Extraction Successful\n- Duration: ${duration}ms\n- Text length: ${result.text.length} characters\n- Pages: ${result.pages?.length || 0}`;
  } catch (error) {
    console.error('[PDF Test] Unexpected error:', error);
    return `❌ PDF Extraction Exception: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Test worker-based PDF extraction
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @returns Test result summary
 */
export async function testWorkerExtraction(pdfData: ArrayBuffer | Uint8Array): Promise<string> {
  console.log('[PDF Test] Starting worker-based PDF extraction test');
  
  try {
    // Check if we're in a context that supports Worker
    if (typeof Worker === 'undefined') {
      return '❌ Worker API not available in this context';
    }
    
    // Create a promise that will resolve when the worker responds
    return new Promise((resolve, reject) => {
      try {
        // Create PDF worker
        const worker = new Worker('../workers/pdf-worker.js');
        const startTime = performance.now();
        
        // Set up message handler
        worker.addEventListener('message', (event) => {
          const duration = Math.round(performance.now() - startTime);
          
          if (event.data.success) {
            const result = event.data.result;
            console.log(`[PDF Test] Worker extraction completed in ${duration}ms`);
            console.log(`[PDF Test] Text length: ${result.text?.length || 0} characters`);
            console.log(`[PDF Test] Pages: ${result.pages?.length || 0}`);
            
            // Terminate worker
            worker.terminate();
            
            resolve(`✅ Worker PDF Extraction Successful\n- Duration: ${duration}ms\n- Text length: ${result.text.length} characters\n- Pages: ${result.pages?.length || 0}`);
          } else {
            console.error(`[PDF Test] Worker extraction error: ${event.data.error}`);
            
            // Terminate worker
            worker.terminate();
            
            resolve(`❌ Worker PDF Extraction Failed: ${event.data.error}`);
          }
        });
        
        // Handle errors
        worker.addEventListener('error', (event) => {
          console.error('[PDF Test] Worker error:', event);
          worker.terminate();
          resolve(`❌ Worker Error: ${event.message}`);
        });
        
        // Send the PDF data to the worker
        const requestId = Date.now().toString();
        worker.postMessage({
          pdfData: pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData),
          options: {
            includePosition: true
          },
          requestId
        });
        
        console.log(`[PDF Test] Sent PDF data to worker (${pdfData instanceof ArrayBuffer ? pdfData.byteLength : pdfData.length} bytes)`);
      } catch (workerError) {
        console.error('[PDF Test] Error creating or using worker:', workerError);
        resolve(`❌ Worker Creation Error: ${workerError instanceof Error ? workerError.message : 'Unknown error'}`);
      }
    });
  } catch (error) {
    console.error('[PDF Test] Unexpected error in worker test:', error);
    return `❌ Worker Test Exception: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Test all PDF extraction methods
 * 
 * @param pdfData PDF data as ArrayBuffer or Uint8Array
 * @returns Test results summary
 */
export async function testAllExtractionMethods(pdfData: ArrayBuffer | Uint8Array): Promise<string> {
  const directResult = await testPdfExtraction(pdfData);
  
  // Only test worker in browser context
  let workerResult = 'Worker test skipped (not applicable in this context)';
  if (typeof Worker !== 'undefined') {
    workerResult = await testWorkerExtraction(pdfData);
  }
  
  return `
=== PDF Extraction Test Results ===

Direct Extraction:
${directResult}

Worker Extraction:
${workerResult}
`;
} 