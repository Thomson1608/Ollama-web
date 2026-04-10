/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: string[];
}

export interface ModelParameters {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stop?: string[];
  jsonMode?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
  systemPrompt?: string;
  parameters?: ModelParameters;
  isClosed?: boolean;
}

export interface AIModel {
  name: string;
  model: string;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface Project {
  id: string;
  name: string;
  details: string;
  type: 'research' | 'coding';
  createdAt: number;
  lastPackageJsonHash?: string;
}

export type ViewType = 'chat' | 'settings' | 'project-init' | 'project-list';
export type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

export interface Memory {
  facts: string[];
}

export interface Config {
  systemPrompt: string;
  parameters: ModelParameters;
}

export interface WorkspaceFile {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
}

export interface ToolCall {
  tool: 'write_file' | 'read_file' | 'list_files' | 'delete_file';
  args: any;
}
