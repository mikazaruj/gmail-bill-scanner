# Database Migration Guide

This folder contains SQL migration files to fix issues with Row Level Security (RLS) policies for the email_sources table.

## Issue with Trusted Email Sources

The main problem was with Row Level Security (RLS) policies for the `email_sources` table. The RLS policies were trying to use the Google user ID from request headers, but there were issues with how the policies were accessing this information.

## Migration Files

### 20240422_direct_header_rls.sql (Recommended)

This migration updates the RLS policies to directly use the Google ID from request headers:
```sql
WHERE google_user_id = current_setting('request.headers.google_user_id'::text, true)
```

This is the most efficient solution since it eliminates any unnecessary function calls and directly uses the header value.

### 20240422_debug_headers.sql

This migration adds a debugging function `debug_get_headers()` that helps diagnose issues by returning the headers being received by Supabase. This is useful for troubleshooting.

## How to Apply Migrations

You can apply these migrations using:

1. The Supabase MCP tool in the Chrome extension:
   ```
   npm run apply-migration:mcp
   ```

2. Direct SQL execution:
   - Connect to your Supabase database
   - Execute each SQL file in order

## Verifying the Fix

After applying the migrations:

1. Try adding a new trusted email source
2. Verify that existing trusted sources appear correctly
3. Test removing trusted sources

If the Chrome extension is still not working correctly, you can use the debug function to check what headers are being received:

```javascript
const { data: headers } = await supabase.rpc('debug_get_headers');
console.log('Headers being sent to Supabase:', headers);
```

## Client-Side Optimization

We've also updated the `trustedSources.ts` file to include better debugging and more efficient header handling. The client is already correctly setting the Google ID in request headers when it calls `getSupabaseClient()`, so no additional fetches are needed. 