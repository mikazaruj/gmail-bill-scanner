/**
 * Service Worker Context Management
 * 
 * This module safely handles service worker context and provides
 * a way to access service worker APIs without breaking modularization.
 */

import logger from '../utils/logger';

// Declare the service worker global scope
declare const self: ServiceWorkerGlobalScope;

// ServiceWorkerContext class to provide safe access to the SW APIs
export class ServiceWorkerContext {
  // Check if we're in a service worker environment
  static isServiceWorkerEnvironment(): boolean {
    return typeof self !== 'undefined' && 
           typeof (self as any).ServiceWorkerGlobalScope !== 'undefined' && 
           self instanceof (self as any).ServiceWorkerGlobalScope;
  }
  
  // Safely get the service worker scope
  static getScope(): ServiceWorkerGlobalScope | null {
    if (this.isServiceWorkerEnvironment()) {
      return self;
    }
    return null;
  }
  
  // Safely access clients API
  static async matchAllClients(options?: ClientQueryOptions): Promise<readonly Client[]> {
    const scope = this.getScope();
    if (!scope || !scope.clients) {
      return [];
    }
    
    try {
      return await scope.clients.matchAll(options);
    } catch (error) {
      logger.error('Error accessing clients.matchAll:', error);
      return [];
    }
  }
  
  // Safely post a message to all clients
  static async postMessageToClients(message: any): Promise<void> {
    try {
      const clients = await this.matchAllClients();
      
      clients.forEach(client => {
        try {
          client.postMessage(message);
        } catch (error) {
          logger.error('Error posting message to client:', error);
        }
      });
    } catch (error) {
      logger.error('Error posting message to clients:', error);
    }
  }
  
  // Safely add an event listener to the service worker
  static addEventListener<K extends keyof ServiceWorkerGlobalScopeEventMap>(
    type: K,
    listener: (this: ServiceWorkerGlobalScope, ev: ServiceWorkerGlobalScopeEventMap[K]) => any
  ): void {
    const scope = this.getScope();
    if (scope) {
      scope.addEventListener(type, listener as any);
    } else {
      logger.warn(`Cannot add event listener for ${type}: not in service worker context`);
    }
  }
  
  // Safely register install handler
  static onInstall(callback: (event: ExtendableEvent) => void): void {
    this.addEventListener('install', (event) => {
      callback(event);
    });
  }
  
  // Safely register activate handler
  static onActivate(callback: (event: ExtendableEvent) => void): void {
    this.addEventListener('activate', (event) => {
      callback(event);
    });
  }
  
  // Safely register unload handler (using addEventListener since there's no direct onunload)
  static onUnload(callback: () => void): void {
    const scope = this.getScope();
    if (scope) {
      scope.addEventListener('unload', () => {
        callback();
      });
    }
  }
  
  // Safely claim clients
  static async claimClients(): Promise<boolean> {
    const scope = this.getScope();
    if (!scope || !scope.clients) {
      return false;
    }
    
    try {
      await scope.clients.claim();
      return true;
    } catch (error) {
      logger.error('Error claiming clients:', error);
      return false;
    }
  }
  
  // Safely skip waiting
  static async skipWaiting(): Promise<boolean> {
    const scope = this.getScope();
    if (!scope) {
      return false;
    }
    
    try {
      await scope.skipWaiting();
      return true;
    } catch (error) {
      logger.error('Error skipping waiting:', error);
      return false;
    }
  }
}

// Re-export functions for easier imports
export const isServiceWorker = ServiceWorkerContext.isServiceWorkerEnvironment.bind(ServiceWorkerContext);
export const getServiceWorkerScope = ServiceWorkerContext.getScope.bind(ServiceWorkerContext);
export const matchAllClients = ServiceWorkerContext.matchAllClients.bind(ServiceWorkerContext);
export const postMessageToClients = ServiceWorkerContext.postMessageToClients.bind(ServiceWorkerContext);
export const onInstall = ServiceWorkerContext.onInstall.bind(ServiceWorkerContext);
export const onActivate = ServiceWorkerContext.onActivate.bind(ServiceWorkerContext);
export const onUnload = ServiceWorkerContext.onUnload.bind(ServiceWorkerContext);
export const claimClients = ServiceWorkerContext.claimClients.bind(ServiceWorkerContext);
export const skipWaiting = ServiceWorkerContext.skipWaiting.bind(ServiceWorkerContext); 