# Gmail Bill Scanner - Incremental Modularization Plan

## Overview

This document outlines the incremental modularization plan for the background service worker in the Gmail Bill Scanner extension. The goal is to break down the monolithic `background/index.ts` file into smaller, more maintainable modules without breaking functionality.

## Modularization Strategy

We're taking an incremental approach with the following key principles:

1. **Move utility functions first** - Extract pure utility functions into separate modules
2. **Refactor service worker context access** - Create a context management module to safely handle service worker context
3. **Improved error handling** - Replace nested try/catch with better patterns
4. **Reduce excessive logging** - Implement a centralized logging system with log levels
5. **Modularize message handlers** - Extract message handling logic into separate modules

## Completed Modules

1. **Utils/stringUtils.ts** 
   - Contains: `extractEmailAddress`, `fixEmailEncoding`, `fixHungarianPdfEncoding`, `parseUrlHash`
   - Pure utility functions for string manipulation

2. **Utils/billUtils.ts**
   - Contains: `transformBillToBillData`, `deduplicateBills`, `buildFieldTypeMap`
   - Functions for bill data processing and manipulation

3. **Utils/gmailUtils.ts**
   - Contains: `extractAttachmentIds`, `fetchAttachment`, `getEmailById`
   - Gmail API-related utility functions that don't need service worker context

4. **Utils/logger.ts**
   - Centralized logging system with configurable log levels
   - Replaces console.log statements throughout the codebase

5. **Utils/supabaseUtils.ts**
   - Contains: `safeSupabaseOperation`, `storeGoogleTokenSafely`
   - Safe operations for interacting with the Supabase backend

6. **Background/context.ts**
   - Service worker context management
   - Safe access to service worker APIs

7. **Background/initLogger.ts**
   - Logger initialization code

8. **Background/handlers/authHandler.ts**
   - Authentication-related functionality
   - Handles sign-in, sign-out, and authentication status checks

9. **Background/handlers/pdfWorkerHandler.ts**
   - PDF worker initialization and management
   - Handles on-demand initialization of PDF.js

10. **Config.ts**
    - Global configuration and feature flags
    - Environment detection

## Remaining Tasks

1. **Message Handlers**
   - Create modular message handlers for different functionality areas
   - Create a central message handling registry

2. **Background Index Updates**
   - Incrementally update the main index.ts file to use the new modules
   - Ensure backwards compatibility during transition

3. **Email Scanning Module**
   - Extract email scanning functionality into a dedicated handler

4. **Sheets Export Module**
   - Extract Google Sheets export functionality into a dedicated handler

5. **PDF Processing Module**
   - Complete PDF processing functionality extraction

6. **API/Error Handling**
   - Standardize error handling across all modules
   - Implement consistent API response patterns

## Implementation Plan

1. Update imports in background/index.ts to use the new modules
2. Replace console.log calls with the new logger
3. Extract more handlers from main index file
4. Update service worker lifecycle handling to use context module
5. Replace direct Supabase operations with the safe utility functions
6. Replace remaining functionality incrementally with modules
7. Add tests for each module

## Testing and Validation

After each incremental change:
1. Test the extension in Chrome
2. Verify all functionality still works
3. Check that error handling is improved
4. Ensure logging is consistent and useful for debugging 