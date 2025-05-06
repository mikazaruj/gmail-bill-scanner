import { defineManifest } from './utils/manifest-utils';
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
  content_scripts: [
    {
      matches: ["https://mail.google.com/*"],
      js: ["content/index.ts"],
      run_at: "document_end"
    }
  ],
  options_page: 'options.html',
  permissions: ['storage', 'identity', 'tabs'],
  host_permissions: [
    'https://mail.google.com/*',
    'https://www.googleapis.com/*',
    'https://accounts.google.com/*',
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
  web_accessible_resources: [
    {
      resources: [
        "assets/*",
        "pdfHandler.html",
        "test/*",
        "pdf.worker.min.js"
      ],
      matches: ["<all_urls>"]
    }
  ]
})); 