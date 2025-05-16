/**
 * Logging utility for consistent and configurable logging
 */

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

// Default configuration
let config = {
  level: LogLevel.INFO,  // Default level
  enabled: true,         // Enable/disable all logging
  prefix: '[GBS]',       // Common prefix
  enableVerboseLogging: false,  // Detailed logging for development
  enableNetworkLogging: false,  // Network request/response logging
  enableTimestamps: true,       // Add timestamps to logs
  enableTrace: false            // Include stack traces for errors
};

/**
 * Configure the logger settings
 */
export function configureLogger(options: Partial<typeof config>): void {
  config = { ...config, ...options };
}

/**
 * Check if debugging is enabled based on current log level
 */
export function isDebugEnabled(): boolean {
  return config.enabled && config.level >= LogLevel.DEBUG;
}

/**
 * Format log message with timestamp and prefix
 */
function formatMessage(message: string): string {
  const parts = [config.prefix];
  
  if (config.enableTimestamps) {
    parts.push(`[${new Date().toISOString()}]`);
  }
  
  parts.push(message);
  return parts.join(' ');
}

/**
 * Log an error message (always shown unless logging is disabled)
 */
export function error(message: string, ...args: any[]): void {
  if (!config.enabled) return;
  
  console.error(formatMessage(message), ...args);
  
  // Add stack trace for the last error argument if it's an Error object
  if (config.enableTrace) {
    const errorArg = args.find(arg => arg instanceof Error);
    if (errorArg && errorArg.stack) {
      console.error(formatMessage('Stack trace:'), errorArg.stack);
    }
  }
}

/**
 * Log a warning message
 */
export function warn(message: string, ...args: any[]): void {
  if (!config.enabled || config.level < LogLevel.WARN) return;
  
  console.warn(formatMessage(message), ...args);
}

/**
 * Log an info message
 */
export function info(message: string, ...args: any[]): void {
  if (!config.enabled || config.level < LogLevel.INFO) return;
  
  console.info(formatMessage(message), ...args);
}

/**
 * Log a debug message (only shown when debug level is enabled)
 */
export function debug(message: string, ...args: any[]): void {
  if (!config.enabled || config.level < LogLevel.DEBUG) return;
  
  console.log(formatMessage(message), ...args);
}

/**
 * Log detailed trace information (only shown when trace level is enabled)
 */
export function trace(message: string, ...args: any[]): void {
  if (!config.enabled || config.level < LogLevel.TRACE) return;
  
  console.log(formatMessage(`TRACE: ${message}`), ...args);
}

/**
 * Log network request details (only when network logging is enabled)
 */
export function logNetworkRequest(url: string, method: string, data?: any): void {
  if (!config.enabled || !config.enableNetworkLogging) return;
  
  console.log(formatMessage(`Network Request: ${method} ${url}`));
  if (data && config.level >= LogLevel.DEBUG) {
    console.log(formatMessage('Request data:'), data);
  }
}

/**
 * Log network response details (only when network logging is enabled)
 */
export function logNetworkResponse(url: string, status: number, data?: any): void {
  if (!config.enabled || !config.enableNetworkLogging) return;
  
  console.log(formatMessage(`Network Response: ${status} from ${url}`));
  if (data && config.level >= LogLevel.DEBUG) {
    console.log(formatMessage('Response data:'), data);
  }
}

/**
 * Utility to time operations and log the duration
 */
export function timeOperation(name: string, operation: () => any): any {
  if (!config.enabled || config.level < LogLevel.DEBUG) {
    // Just run the operation without timing if logging is disabled
    return operation();
  }
  
  console.time(formatMessage(`Operation: ${name}`));
  try {
    return operation();
  } finally {
    console.timeEnd(formatMessage(`Operation: ${name}`));
  }
}

/**
 * Async utility to time operations and log the duration
 */
export async function timeAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
  if (!config.enabled || config.level < LogLevel.DEBUG) {
    // Just run the operation without timing if logging is disabled
    return operation();
  }
  
  console.time(formatMessage(`Async Operation: ${name}`));
  try {
    return await operation();
  } finally {
    console.timeEnd(formatMessage(`Async Operation: ${name}`));
  }
}

// Export default object for convenience
export default {
  error,
  warn,
  info,
  debug,
  trace,
  isDebugEnabled,
  configureLogger,
  timeOperation,
  timeAsync,
  logNetworkRequest,
  logNetworkResponse
}; 