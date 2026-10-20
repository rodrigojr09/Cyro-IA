import {marked} from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import {createIcons,icons} from 'lucide';
window.jarvisVendor={marked,DOMPurify,hljs,refreshIcons:()=>createIcons({icons})};
