/**
 * MessageHandlerRegistry
 * 
 * A registry for background script message handlers.
 * Organizes message handlers and provides a central point for dispatching messages.
 */

type MessageHandler = (payload: any, sendResponse: (response: any) => void) => void | Promise<void>;
type MessageSender = chrome.runtime.MessageSender;
type SendResponseFunction = (response?: any) => void;

/**
 * Maintains a registry of message handlers for processing extension messages.
 */
class MessageHandlerRegistry {
  private handlers: Map<string, MessageHandler> = new Map();
  private priorityHandlers: Set<string> = new Set();
  
  /**
   * Register a message handler for a specific message type
   * @param type The message type to handle
   * @param handler The function to handle messages of this type
   * @param options Options for this handler
   */
  register(type: string, handler: MessageHandler, options: { priority?: boolean } = {}): void {
    this.handlers.set(type, handler);
    
    if (options.priority) {
      this.priorityHandlers.add(type);
    }
    
    console.log(`Registered handler for message type: ${type}`);
  }
  
  /**
   * Check if a handler exists for a message type
   * @param type The message type to check
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }
  
  /**
   * Get a handler for a message type
   * @param type The message type to get the handler for
   */
  getHandler(type: string): MessageHandler | undefined {
    return this.handlers.get(type);
  }
  
  /**
   * Check if a message type has a priority handler
   * @param type The message type to check
   */
  isPriorityHandler(type: string): boolean {
    return this.priorityHandlers.has(type);
  }
  
  /**
   * Handle a message using the registered handlers
   * @param message The message to handle
   * @param sender The sender of the message
   * @param sendResponse Function to send a response
   * @returns Whether the sendResponse function will be called asynchronously
   */
  handleMessage(
    message: { type: string; payload?: any; [key: string]: any },
    sender: MessageSender,
    sendResponse: SendResponseFunction
  ): boolean {
    const { type } = message;
    
    // Log the message for debugging (omit large payloads)
    if (type !== 'extractTextFromPdf' && type !== 'extractPdfWithTransfer') {
      console.log('Background received message:', type);
    } else {
      console.log('Background received PDF extraction request');
    }
    
    // Handle PING message for checking if background script is active
    if (type === 'PING') {
      sendResponse({ success: true, message: 'Background script is active' });
      return false;
    }
    
    // Check if we have a handler for this message type
    const handler = this.handlers.get(type);
    
    if (!handler) {
      console.warn(`Unknown message type: ${type}`);
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      return false;
    }
    
    try {
      // Extract payload from message or use the message itself
      const payload = message.payload !== undefined ? message.payload : message;
      
      // Call the handler with the payload and sendResponse function
      handler(payload, sendResponse);
      
      // For all known message types, keep the channel open for async responses
      console.log(`Handler for ${type} executed, keeping response channel open`);
      return true;
    } catch (error) {
      console.error(`Error handling message type ${type}:`, error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Error handling message'
      });
      return false;
    }
  }
}

// Create a singleton instance of the registry
const messageHandlerRegistry = new MessageHandlerRegistry();
export default messageHandlerRegistry; 