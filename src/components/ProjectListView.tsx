import React from 'react';
import { Plus, Folder, Clock, ChevronRight, Layout, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Project } from '../types';

interface ProjectListViewProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string, e: React.MouseEvent) => void;
}

export const ProjectListView: React.FC<ProjectListViewProps> = ({ 
  projects, 
  onSelectProject, 
  onCreateProject,
  onDeleteProject
}) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50/50 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full p-6 md:p-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dự án của bạn</h1>
            <p className="text-gray-500 mt-1">Chọn một dự án để tiếp tục làm việc hoặc tạo mới.</p>
          </div>
          <button
            onClick={onCreateProject}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-blue-100 active:scale-[0.98]"
          >
            <Plus size={20} />
            <span>Tạo Project mới</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border-2 border-dashed border-gray-200 p-10 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                <Folder className="text-gray-300" size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Chưa có dự án nào</h3>
              <p className="text-gray-500 mt-2 max-w-xs">Hãy bắt đầu bằng cách tạo dự án đầu tiên của bạn để AI có thể hỗ trợ.</p>
              <button
                onClick={onCreateProject}
                className="mt-6 text-blue-600 font-bold hover:underline flex items-center gap-1"
              >
                Tạo ngay dự án đầu tiên <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelectProject(project)}
                  className="group bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all cursor-pointer relative"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                      <Layout className="text-blue-600 group-hover:text-white transition-colors" size={24} />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(project.id, e);
                      }}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      title="Xóa dự án"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 mb-2 truncate group-hover:text-blue-600 transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-gray-500 text-sm line-clamp-2 mb-6 min-h-[40px]">
                    {project.details}
                  </p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock size={14} />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-blue-600 font-bold text-sm flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                      Mở dự án <ChevronRight size={16} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
