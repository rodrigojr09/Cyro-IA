import React from 'react';
import {
  PanelLeft,
  FolderPlus,
  Search,
  MessagesSquare,
  Settings2,
  LogOut,
  Paperclip,
  Mic,
  ArrowUp,
  Volume2,
  Square,
  Ellipsis,
  FolderSearch,
  History,
  Mail,
  Lightbulb,
  BookOpen,
  FileText,
  ShieldCheck,
  Music,
  MessageCircle,
  Calendar,
  Globe,
  Gamepad2,
  GitBranch,
  Plus,
  ChevronRight,
  ChevronDown,
} from 'lucide';
const nodes = {
  'panel-left': PanelLeft,
  'folder-plus': FolderPlus,
  search: Search,
  plus: Plus,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'messages-square': MessagesSquare,
  settings: Settings2,
  logout: LogOut,
  paperclip: Paperclip,
  mic: Mic,
  'arrow-up': ArrowUp,
  volume: Volume2,
  stop: Square,
  ellipsis: Ellipsis,
  'folder-search': FolderSearch,
  history: History,
  mail: Mail,
  idea: Lightbulb,
  book: BookOpen,
  text: FileText,
  shield: ShieldCheck,
  music: Music,
  message: MessageCircle,
  calendar: Calendar,
  globe: Globe,
  game: Gamepad2,
  git: GitBranch,
};
export function Icon({ name, className = '' }) {
  return (
    <svg
      className={'lucide ' + className}
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(nodes[name] || FileText).map(([tag, attributes], index) =>
        React.createElement(tag, { ...attributes, key: index }),
      )}
    </svg>
  );
}
