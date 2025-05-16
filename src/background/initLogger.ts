/**
 * Logger Initialization
 * 
 * Configures the logger based on global config settings
 */

import logger, { configureLogger } from '../utils/logger';
import config from '../config';

/**
 * Initialize the logger with current configuration
 */
export function initializeLogger(): void {
  configureLogger({
    level: config.logging.level,
    enabled: true,
    prefix: '[GBS]',
    enableVerboseLogging: config.logging.enableVerboseLogging,
    enableNetworkLogging: config.logging.enableNetworkLogging,
    enableTimestamps: config.logging.enableTimestamps,
    enableTrace: config.logging.enableTrace
  });
  
  logger.info('Logger initialized');
  
  if (config.Environment.isDevelopment) {
    logger.debug('Running in development mode');
  } else if (config.Environment.isProduction) {
    logger.info('Running in production mode');
  } else if (config.Environment.isTest) {
    logger.info('Running in test mode');
  }
  
  logger.debug('Logger configuration:', config.logging);
}

// Export the configured logger for convenience
export default logger; 