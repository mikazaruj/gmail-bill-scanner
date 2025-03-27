/**
 * Chrome API type definitions
 */

// Extend the Window interface to include chrome for global usage
interface Window {
  chrome: typeof chrome;
}

// Basic Chrome namespace definition
declare namespace chrome {
  // Chrome Runtime API
  export namespace runtime {
    export const lastError: {
      message: string;
    } | undefined;

    // Event listeners
    export interface RuntimeEvent<T extends Function> {
      addListener(callback: T): void;
      removeListener(callback: T): void;
      hasListener(callback: T): boolean;
    }

    // Message events
    export interface MessageSender {
      tab?: chrome.tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
      tlsChannelId?: string;
    }

    export type MessageCallback = (
      message: any,
      sender: MessageSender,
      sendResponse: (response?: any) => void
    ) => void | boolean;

    export const onMessage: RuntimeEvent<MessageCallback>;
    
    // Install and update events
    export interface InstalledDetails {
      reason: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
      previousVersion?: string;
      id?: string;
    }
    
    export const onInstalled: RuntimeEvent<(details: InstalledDetails) => void>;
  }
  
  // Chrome Identity API
  export namespace identity {
    export function getRedirectURL(): string;
    export function launchWebAuthFlow(
      options: {
        url: string;
        interactive: boolean;
      },
      callback: (redirectUrl?: string) => void
    ): void;
  }
  
  // Chrome Storage API
  export namespace storage {
    export interface StorageArea {
      get(keys: string | string[] | null | Record<string, any>, callback: (items: Record<string, any>) => void): void;
      set(items: Record<string, any>, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
      clear(callback?: () => void): void;
    }
    
    export const local: StorageArea;
    export const sync: StorageArea;
  }

  // Chrome Tabs API
  export namespace tabs {
    export interface Tab {
      id?: number;
      index: number;
      windowId: number;
      highlighted: boolean;
      active: boolean;
      pinned: boolean;
      url?: string;
      title?: string;
      favIconUrl?: string;
      status?: string;
      incognito: boolean;
      audible?: boolean;
      muted?: boolean;
      width?: number;
      height?: number;
      sessionId?: string;
    }

    export function query(queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
      url?: string | string[];
    }, callback: (result: Tab[]) => void): void;

    export function sendMessage(
      tabId: number,
      message: any,
      options?: { frameId?: number },
      callback?: (response: any) => void
    ): void;
  }
} 