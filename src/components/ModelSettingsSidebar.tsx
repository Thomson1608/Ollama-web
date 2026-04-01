import React from 'react';
import { 
  Settings2, 
  X, 
  Info,
  ChevronDown,
  ChevronUp,
  Hash,
  Type,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ModelSettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  parameters: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    stop?: string[];
    jsonMode?: boolean;
  };
  onUpdateParameters: (params: any) => void;
}

export const ModelSettingsSidebar: React.FC<ModelSettingsSidebarProps> = ({
  isOpen,
  onClose,
  parameters,
  onUpdateParameters
}) => {
  if (!isOpen) return null;

  const updateParam = (key: string, value: any) => {
    onUpdateParameters({ ...parameters, [key]: value });
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white h-full flex flex-col shadow-xl z-20 overflow-y-auto">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <Settings2 size={18} className="text-blue-600" />
          <span>Model Settings</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-6 space-y-8">
        {/* Temperature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              Temperature
              <Info size={14} className="text-gray-400 cursor-help" />
            </label>
            <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
              {(parameters.temperature ?? 0.7).toFixed(1)}
            </span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="2" 
            step="0.1"
            value={parameters.temperature ?? 0.7}
            onChange={(e) => updateParam('temperature', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 font-medium">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>

        {/* Top P */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              Top P
              <Info size={14} className="text-gray-400 cursor-help" />
            </label>
            <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
              {(parameters.topP ?? 0.9).toFixed(2)}
            </span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01"
            value={parameters.topP ?? 0.9}
            onChange={(e) => updateParam('topP', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        {/* Top K */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              Top K
              <Info size={14} className="text-gray-400 cursor-help" />
            </label>
            <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
              {parameters.topK ?? 40}
            </span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="100" 
            step="1"
            value={parameters.topK ?? 40}
            onChange={(e) => updateParam('topK', parseInt(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        {/* Max Tokens */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              Max Tokens
              <Info size={14} className="text-gray-400 cursor-help" />
            </label>
          </div>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="number" 
              placeholder="Default"
              value={parameters.maxTokens ?? ''}
              onChange={(e) => updateParam('maxTokens', e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Stop Sequences */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              Stop Sequences
              <Info size={14} className="text-gray-400 cursor-help" />
            </label>
          </div>
          <div className="relative">
            <Type className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="e.g. \n, User:, ###"
              value={parameters.stop?.join(', ') ?? ''}
              onChange={(e) => updateParam('stop', e.target.value ? e.target.value.split(',').map(s => s.trim()) : undefined)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <p className="text-[10px] text-gray-400">Separate multiple sequences with commas.</p>
        </div>

        {/* JSON Mode */}
        <div className="pt-4 border-t border-gray-100">
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                JSON Mode
                <Zap size={14} className="text-amber-500" />
              </span>
              <span className="text-[10px] text-gray-400">Force the model to output valid JSON.</span>
            </div>
            <div className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={parameters.jsonMode ?? false}
                onChange={(e) => updateParam('jsonMode', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </div>
          </label>
        </div>
      </div>

      <div className="mt-auto p-6 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <Info size={14} />
          <span>Context Window</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 w-[15%]" />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-400 font-medium">
          <span>~1.2k tokens</span>
          <span>128k limit</span>
        </div>
      </div>
    </div>
  );
};
