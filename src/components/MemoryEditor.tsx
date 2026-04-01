import React, { useState, useMemo } from 'react';
import { Trash2, Edit2, Check, X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface MemoryEditorProps {
  facts: string[];
  onChange: (facts: string[]) => void;
}

export const MemoryEditor: React.FC<MemoryEditorProps> = ({ facts, onChange }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const similarityGroups = useMemo(() => {
    const groups: { [key: number]: number[] } = {};
    const processed = new Set<number>();

    const getSimilarity = (s1: string, s2: string) => {
      const words1 = s1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const words2 = s2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words1.length === 0 || words2.length === 0) return 0;
      
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      return intersection.size / union.size;
    };

    for (let i = 0; i < facts.length; i++) {
      if (processed.has(i)) continue;
      const similar: number[] = [];
      for (let j = i + 1; j < facts.length; j++) {
        if (processed.has(j)) continue;
        if (getSimilarity(facts[i], facts[j]) > 0.4) {
          similar.push(j);
          processed.add(j);
        }
      }
      if (similar.length > 0) {
        groups[i] = similar;
        processed.add(i);
      }
    }
    return groups;
  }, [facts]);

  const handleDelete = (index: number) => {
    const newFacts = facts.filter((_, i) => i !== index);
    onChange(newFacts);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditValue(facts[index]);
  };

  const saveEdit = () => {
    if (editingIndex !== null) {
      const newFacts = [...facts];
      newFacts[editingIndex] = editValue;
      onChange(newFacts);
      setEditingIndex(null);
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const isSimilar = (index: number) => {
    return Object.entries(similarityGroups).some(([root, similar]) => 
      parseInt(root) === index || similar.includes(index)
    );
  };

  const getGroupColor = (index: number) => {
    const entries = Object.entries(similarityGroups);
    for (let i = 0; i < entries.length; i++) {
      const [root, similar] = entries[i];
      if (parseInt(root) === index || similar.includes(index)) {
        const colors = ['bg-amber-50 border-amber-200', 'bg-orange-50 border-orange-200', 'bg-yellow-50 border-yellow-200'];
        return colors[i % colors.length];
      }
    }
    return 'bg-white border-gray-100';
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm font-mono text-[11px]">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Memory Editor</span>
        <span className="text-[10px] text-gray-400">{facts.length} lines</span>
      </div>
      
      <div className="max-h-[500px] overflow-y-auto">
        {facts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 italic">
            No facts stored in long-term memory yet.
          </div>
        ) : (
          facts.map((fact, index) => {
            const similar = isSimilar(index);
            const groupColor = getGroupColor(index);
            
            return (
              <div 
                key={index} 
                className={cn(
                  "group flex items-start border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors",
                  similar && groupColor
                )}
              >
                {/* Line Number */}
                <div className="w-10 flex-shrink-0 py-2 text-right pr-3 text-gray-300 select-none border-r border-gray-50 bg-gray-50/50 group-hover:text-blue-300">
                  {index + 1}
                </div>

                {/* Content */}
                <div className="flex-1 py-2 px-3 min-w-0 relative">
                  {editingIndex === index ? (
                    <div className="flex items-center gap-2">
                      <input 
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="flex-1 bg-white border border-blue-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button onClick={saveEdit} className="text-green-600 hover:text-green-700">
                        <Check size={14} />
                      </button>
                      <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-gray-700 break-words leading-relaxed">
                        {fact}
                        {similar && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-100/50 px-1.5 py-0.5 rounded border border-amber-200">
                            <AlertTriangle size={8} />
                            SIMILAR
                          </span>
                        )}
                      </span>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button 
                          onClick={() => startEditing(index)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
                          title="Edit fact"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button 
                          onClick={() => handleDelete(index)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
                          title="Delete fact"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <div className="bg-gray-50 border-t border-gray-200 p-3">
        <div className="flex gap-2">
          <input 
            placeholder="Add new fact manually..."
            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400 transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = e.currentTarget.value.trim();
                if (val) {
                  onChange([...facts, val]);
                  e.currentTarget.value = '';
                }
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};
