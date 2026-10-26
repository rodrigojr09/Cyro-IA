import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { createIcons, icons } from 'lucide';
import { mountIntegrations } from './integrations-ui';
window.jarvisVendor = {
  marked,
  DOMPurify,
  hljs,
  mountIntegrations,
  refreshIcons: () => createIcons({ icons }),
};
