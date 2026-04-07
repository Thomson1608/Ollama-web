import React, { useState } from 'react';
import { Rocket, Layout, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface ProjectInitViewProps {
  onInit: (name: string, details: string) => void;
  isLoading: boolean;
}

export const ProjectInitView: React.FC<ProjectInitViewProps> = ({ onInit, isLoading }) => {
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && details.trim()) {
      onInit(name, details);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-bg-primary overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-bg-secondary rounded-3xl shadow-xl border border-border-primary p-8 md:p-12"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-accent-primary rounded-2xl flex items-center justify-center shadow-lg shadow-accent-primary/20">
            <Rocket className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Khởi tạo Project mới</h1>
            <p className="text-text-secondary">Hãy cho AI biết bạn muốn xây dựng điều gì.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-text-secondary ml-1">
              <Layout size={16} className="text-accent-primary" />
              Tên Project
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Ứng dụng Quản lý Chi tiêu"
              className="w-full px-4 py-3 rounded-xl border border-border-primary bg-bg-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all outline-none text-text-primary placeholder:text-text-secondary/50"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-text-secondary ml-1">
              <FileText size={16} className="text-accent-primary" />
              Chi tiết Project
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Mô tả chi tiết các tính năng, công nghệ sử dụng, hoặc yêu cầu cụ thể..."
              className="w-full px-4 py-3 rounded-xl border border-border-primary bg-bg-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all outline-none text-text-primary placeholder:text-text-secondary/50 min-h-[200px] resize-none"
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !name.trim() || !details.trim()}
            className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/90 disabled:bg-bg-tertiary text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-accent-primary/20 active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Đang khởi tạo không gian làm việc...</span>
              </>
            ) : (
              <>
                <span>Bắt đầu Project</span>
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-border-primary flex items-center justify-center gap-8 text-xs text-text-secondary font-medium">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            AI Developer Ready
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
            Workspace Connected
          </div>
        </div>
      </motion.div>
    </div>
  );
};
