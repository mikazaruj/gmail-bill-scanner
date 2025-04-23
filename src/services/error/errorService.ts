/**
 * Error handling service
 * 
 * Provides consistent error handling across the application
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorOptions {
  severity?: ErrorSeverity;
  shouldNotify?: boolean;
  context?: Record<string, any>;
}

/**
 * Handles errors consistently across the application
 * 
 * @param error The error to handle
 * @param options Options for handling the error
 */
export async function handleError(
  error: Error | string,
  options: ErrorOptions = {}
): Promise<void> {
  const { severity = 'medium', shouldNotify = false, context = {} } = options;
  
  // 1. Log error
  console.error(`[${severity.toUpperCase()}] Error:`, error, context);
  
  // 2. Send to UI if needed
  if (shouldNotify) {
    chrome.runtime.sendMessage({
      type: 'ERROR_NOTIFICATION',
      error: typeof error === 'string' ? error : error.message,
      severity,
      context
    });
  }
  
  // 3. Record error in analytics or logs if critical
  if (severity === 'critical') {
    try {
      // Store in local storage for analysis
      const errorData = await chrome.storage.local.get('error_log');
      const errorLog = errorData.error_log || [];
      
      errorLog.push({
        timestamp: new Date().toISOString(),
        message: typeof error === 'string' ? error : error.message,
        stack: error instanceof Error ? error.stack : undefined,
        context,
        severity
      });
      
      // Keep last 20 errors
      await chrome.storage.local.set({ 
        error_log: errorLog.slice(-20) 
      });
    } catch (e) {
      console.error('Failed to log error:', e);
    }
  }
} 