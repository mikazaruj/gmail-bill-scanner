/**
 * Chrome Offscreen API Type Definitions
 * 
 * This file contains type definitions for Chrome's offscreen API
 * which is not fully typed in the standard @types/chrome package.
 */

declare namespace chrome {
  namespace offscreen {
    interface CreateDocumentOptions {
      /**
       * The URL to load in the document.
       */
      url: string;
      
      /**
       * The reasons why the extension is creating the offscreen document.
       */
      reasons: OffscreenDocumentReason[];
      
      /**
       * A developer-provided string that explains the purpose of the document to
       * the user.
       */
      justification: string;
    }
    
    type OffscreenDocumentReason = 
      | 'AUDIO_PLAYBACK'
      | 'BLOBS'
      | 'CLIPBOARD'
      | 'COOKIES'
      | 'DOM_PARSER'
      | 'DOM_SCRAPING'
      | 'IFRAME_SCRIPTING'
      | 'TESTING'
      | 'WEB_RTC';
    
    /**
     * Creates a new offscreen document for the extension.
     */
    function createDocument(options: CreateDocumentOptions): Promise<void>;
    
    /**
     * Closes the active offscreen document for the extension.
     */
    function closeDocument(): Promise<void>;
  }
  
  namespace runtime {
    interface Context {
      contextId: string;
      documentUrl?: string;
      frameId?: number;
      tabId?: number;
      windowId?: number;
      incognito?: boolean;
      type: ContextType;
    }
    
    type ContextType = 
      | 'BACKGROUND'
      | 'OFFSCREEN_DOCUMENT'
      | 'POPUP'
      | 'TAB'
      | 'SIDE_PANEL';
    
    interface GetContextOptions {
      contextTypes: ContextType[];
    }
    
    /**
     * Gets information about the active contexts associated with this extension.
     */
    function getContexts(options: GetContextOptions): Promise<Context[]>;
  }
} 