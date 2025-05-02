/**
 * Application Configuration
 * 
 * Centralizes access to environment variables and configuration settings
 */

// Config object with environment variables
export const config = {
  // Google API credentials
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  
  // Supabase configuration
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  
  // PDF processing
  pdfWorkerPath: 'pdf.worker.min.js',
  
  // Feature flags
  enableLogging: process.env.ENABLE_LOGGING === 'true',
  
  // Defaults
  defaultScanDays: 30,
  defaultMaxResults: 20,
  defaultLanguage: 'en',
  
  // API throttling
  maxRequestsPerMinute: 50,
};

/**
 * Validate that required configuration is present
 * @returns True if all required config is available, false otherwise
 */
export function validateConfig(): { valid: boolean; missing: string[] } {
  const requiredVars = ['googleClientId', 'supabaseUrl', 'supabaseAnonKey'];
  const missing = requiredVars.filter(key => !config[key]);
  
  return { 
    valid: missing.length === 0,
    missing
  };
}

/**
 * Get the current environment
 * @returns The current environment (development, production, etc.)
 */
export function getEnvironment(): string {
  return process.env.NODE_ENV || 'development';
}

// Export the config as default
export default config; 