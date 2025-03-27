import { defineManifest } from '@plasmohq/messaging';
import packageJson from '../package.json';

const { name, displayName, version, description } = packageJson;

export default defineManifest(() => ({
  name: displayName,
  description,
  version,
  manifest_version: 3,
  icons: {
    '16': 'assets/icon16.png',
    '32': 'assets/icon32.png',
    '48': 'assets/icon48.png',
    '128': 'assets/icon128.png',
  },
  background: {
    service_worker: 'background/index.ts',
    type: 'module',
  },
  action: {
    default_popup: 'popup.html',
    default_icon: {
      '16': 'assets/icon16.png',
      '32': 'assets/icon32.png',
      '48': 'assets/icon48.png',
      '128': 'assets/icon128.png',
    },
  },
  options_page: 'options.html',
  permissions: ['storage', 'identity'],
  host_permissions: [
    'https://mail.google.com/*',
    'https://www.googleapis.com/*',
    'https://accounts.google.com/*',
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
})); 