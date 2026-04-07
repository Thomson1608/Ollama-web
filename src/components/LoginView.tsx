import React, { useState, useEffect } from 'react';
import { User, UserPlus, LogIn, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginViewProps {
  onLogin: (username: string) => void;
}

interface UserProfile {
  username: string;
  role: string;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      if (res.ok) {
        onLogin(newUsername.trim());
      }
    } catch (error) {
      console.error('Failed to create user:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-bg-primary">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-bg-secondary rounded-2xl shadow-xl p-8 border border-border-primary"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-primary/10 rounded-full mb-4">
            <User className="w-8 h-8 text-accent-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Welcome to Ollama Multi-User</h1>
          <p className="text-text-secondary mt-2">Select your profile or create a new one</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {users.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Existing Users</label>
                <div className="grid grid-cols-1 gap-2">
                  {users.map(user => (
                    <button
                      key={user.username}
                      onClick={() => onLogin(user.username)}
                      className="flex items-center justify-between p-3 rounded-xl border border-border-primary hover:border-accent-primary hover:bg-accent-primary/10 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-bg-tertiary rounded-full flex items-center justify-center group-hover:bg-accent-primary/20">
                          <User className="w-4 h-4 text-text-secondary group-hover:text-accent-primary" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="font-medium text-text-primary group-hover:text-accent-primary">{user.username}</span>
                          {user.role === 'admin' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full mt-0.5">
                              Admin
                            </span>
                          )}
                        </div>
                      </div>
                      <LogIn className="w-4 h-4 text-text-secondary group-hover:text-accent-primary" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-primary"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-bg-secondary text-text-secondary">Or create new</span>
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-text-secondary">New Username</label>
                <input
                  id="username"
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full p-3 bg-bg-primary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                  disabled={isCreating}
                />
              </div>
              <button
                type="submit"
                disabled={!newUsername.trim() || isCreating}
                className="w-full flex items-center justify-center gap-2 p-3 bg-accent-primary text-white rounded-xl font-medium hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-accent-primary/20"
              >
                {isCreating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <UserPlus className="w-5 h-5" />
                )}
                Create Profile
              </button>
            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
}
