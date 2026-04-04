import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { simpleGit, SimpleGit } from 'simple-git';
import si from 'systeminformation';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

const DATA_DIR = path.join(__dirname, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const SYSTEM_LOG_FILE = path.join(DATA_DIR, 'system.log');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: 'Server-side (No Auth Context)',
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Database Service (MVVM-like Service Layer)
const dbService = {
  // User operations
  getUsers: async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
    }
  },
  getUser: async (username: string) => {
    try {
      const q = query(collection(db, 'users'), where('username', '==', username));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return snapshot.docs[0].data();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users?username=${username}`);
    }
  },
  createUser: async (username: string, role: string = 'user') => {
    try {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
      const userRef = doc(db, 'users', id);
      await setDoc(userRef, { id, username, role });
      
      // Initialize default config for new user
      const configRef = doc(db, 'users', id, 'configs', 'default');
      await setDoc(configRef, {
        userId: id,
        systemPrompt: `You are a helpful assistant for ${username}.`,
        parameters: { temperature: 0.7, topP: 0.9, topK: 40 }
      });
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  },
  updateUserRole: async (username: string, role: string) => {
    try {
      const user = await dbService.getUser(username) as any;
      if (user) {
        await updateDoc(doc(db, 'users', user.id), { role });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${username}`);
    }
  },

  // Config operations
  getConfig: async (username: string) => {
    try {
      const user = await dbService.getUser(username) as any;
      if (!user) return null;
      const configRef = doc(db, 'users', user.id, 'configs', 'default');
      const configSnap = await getDoc(configRef);
      if (!configSnap.exists()) return null;
      const config = configSnap.data();
      return {
        systemPrompt: config.systemPrompt,
        parameters: config.parameters || {}
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${username}/configs/default`);
    }
  },
  saveConfig: async (username: string, config: any) => {
    try {
      const user = await dbService.getUser(username) as any;
      if (!user) return;
      const configRef = doc(db, 'users', user.id, 'configs', 'default');
      await setDoc(configRef, {
        userId: user.id,
        systemPrompt: config.systemPrompt,
        parameters: config.parameters || {}
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${username}/configs/default`);
    }
  },

  // Stats operations
  getStats: async () => {
    try {
      const snapshot = await getDocs(collection(db, 'stats'));
      const stats: any = { sent: 0, success: 0, fail: 0 };
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        stats[data.key] = data.value;
      });
      return stats;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'stats');
    }
  },
  updateStat: async (type: 'sent' | 'success' | 'fail') => {
    try {
      const statRef = doc(db, 'stats', type);
      const statSnap = await getDoc(statRef);
      if (statSnap.exists()) {
        await updateDoc(statRef, { value: statSnap.data().value + 1 });
      } else {
        await setDoc(statRef, { key: type, value: 1 });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `stats/${type}`);
    }
  },

  // Project operations
  getProjects: async (userId: string) => {
    try {
      const q = query(collection(db, 'projects'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `projects?userId=${userId}`);
    }
  },
  getProject: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'projects', id));
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `projects/${id}`);
    }
  },
  updateProject: async (id: string, data: any) => {
    try {
      await updateDoc(doc(db, 'projects', id), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
    }
  },
  createProject: async (userId: string, name: string, details: string) => {
    try {
      const id = 'proj_' + Date.now().toString();
      await setDoc(doc(db, 'projects', id), {
        id, userId, name, details, createdAt: Date.now()
      });
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    }
  },
  deleteProject: async (id: string) => {
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
    }
  },

  // Chat operations
  getChats: async (projectId: string) => {
    try {
      const q = query(collection(db, 'projects', projectId, 'chats'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const chats = snapshot.docs.map(doc => doc.data());
      return await Promise.all(chats.map(async (chat: any) => ({
        ...chat,
        parameters: chat.parameters || {},
        messages: await dbService.getMessages(projectId, chat.id)
      })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `projects/${projectId}/chats`);
    }
  },
  createChat: async (projectId: string, chat: any) => {
    try {
      await setDoc(doc(db, 'projects', projectId, 'chats', chat.id), {
        id: chat.id,
        projectId,
        title: chat.title,
        model: chat.model,
        systemPrompt: chat.systemPrompt || '',
        parameters: chat.parameters || {},
        createdAt: chat.createdAt || Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/chats/${chat.id}`);
    }
  },
  updateChatTitle: async (projectId: string, id: string, title: string) => {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'chats', id), { title });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/chats/${id}`);
    }
  },
  deleteChat: async (projectId: string, id: string) => {
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'chats', id));
      // Note: Subcollections messages should also be deleted, but Firestore doesn't delete them automatically.
      // For simplicity in this refactor, we leave them or delete them in a loop if needed.
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}/chats/${id}`);
    }
  },

  // Message operations
  getMessages: async (projectId: string, chatId: string) => {
    try {
      const q = query(collection(db, 'projects', projectId, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `projects/${projectId}/chats/${chatId}/messages`);
    }
  },
  addMessage: async (projectId: string, chatId: string, msg: any) => {
    try {
      const id = 'msg_' + Date.now().toString() + Math.random().toString(36).substring(2, 5);
      await setDoc(doc(db, 'projects', projectId, 'chats', chatId, 'messages', id), {
        id,
        chatId,
        role: msg.role,
        content: msg.content,
        images: msg.images || [],
        timestamp: msg.timestamp || Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/chats/${chatId}/messages`);
    }
  },

  // Memory operations
  getMemory: async (projectId: string) => {
    try {
      const q = query(collection(db, 'projects', projectId, 'memories'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data().content);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `projects/${projectId}/memories`);
    }
  },
  saveMemory: async (projectId: string, content: string) => {
    try {
      const id = 'mem_' + Date.now().toString();
      await setDoc(doc(db, 'projects', projectId, 'memories', id), {
        id, projectId, content, timestamp: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/memories`);
    }
  }
};

// Helper to get user-specific paths
function getUserPaths(username: string, projectId?: string) {
  const userDir = path.join(USERS_DIR, username);
  const projectDir = projectId ? path.join(userDir, 'projects', projectId) : userDir;
  return {
    dir: userDir,
    projectDir: projectDir,
    workspace: path.join(projectDir, 'workspace')
  };
}

async function isAdmin(username: string) {
  if (username === 'admin') return true;
  try {
    const user = await dbService.getUser(username);
    return user?.role === 'admin';
  } catch (e) {
    return false;
  }
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug'; // 'debug' or 'release'



const logger = {
  debug: (message: string, data?: any) => {
    if (LOG_LEVEL === 'debug') {
      const logMsg = `[DEBUG] ${new Date().toISOString()} - ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
      process.stdout.write(logMsg);
      try {
        fsSync.appendFileSync(SYSTEM_LOG_FILE, logMsg);
      } catch (e) {}
    }
  },
  release: (message: string, data?: any) => {
    const logMsg = `[RELEASE] ${new Date().toISOString()} - ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
    process.stdout.write(logMsg);
    try {
      fsSync.appendFileSync(SYSTEM_LOG_FILE, logMsg);
    } catch (e) {}
  },
  error: (message: string, error?: any) => {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      ...(error as any)
    } : error;
    const logMsg = `[ERROR] ${new Date().toISOString()} - ${message}${errorData ? ' ' + JSON.stringify(errorData, null, 2) : ''}\n`;
    process.stderr.write(logMsg);
    try {
      fsSync.appendFileSync(SYSTEM_LOG_FILE, logMsg);
    } catch (e) {}
  }
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureUserDir(username: string) {
  const paths = getUserPaths(username);
  try {
    await fs.mkdir(paths.dir, { recursive: true });
    
    // Ensure user exists in DB
    let user = await dbService.getUser(username);
    if (!user) {
      await dbService.createUser(username, username === 'admin' ? 'admin' : 'user');
    }
  } catch (error) {
    logger.error(`Failed to ensure user dir for ${username}`, error);
  }
}

async function initializeDefaultUsers() {
  const defaultUsers = ['admin', 'Thompson', 'BuPro', 'Khanh', 'Bao'];
  for (const user of defaultUsers) {
    await ensureUserDir(user);
  }
}

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(USERS_DIR, { recursive: true });
    await initializeDefaultUsers();
  } catch (e) {}
}

interface Chat {
  id: string;
  title: string;
  messages: any[];
  model: string;
  createdAt: number;
  systemPrompt?: string;
}

interface ActiveGeneration {
  chatId: string;
  model: string;
  userMessage: any;
  assistantMessage: any;
  username: string;
}
const activeGenerations = new Map<string, ActiveGeneration>();

async function startServer() {
  await ensureDataDir();
  
  // Test Firestore Connection
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    logger.release('Đã kết nối thành công với Firestore');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      logger.error("Vui lòng kiểm tra cấu hình Firebase của bạn.");
    }
  }

  logger.release('Đang khởi tạo server...');
  
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;
  logger.release(`Server configuration: PORT=${PORT}, LOG_LEVEL=${LOG_LEVEL}`);

  async function autoCommit(username: string, message: string, projectId?: string) {
    try {
      const paths = getUserPaths(username, projectId);
      const git: SimpleGit = simpleGit(paths.workspace);
      await git.add('.');
      const status = await git.status();
      if (status.staged.length > 0 || status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0) {
        await git.commit(message);
        logger.debug(`Auto-commit for ${username}: ${message}`);
        io.emit(`workspace:history_updated:${username}`);
      }
    } catch (error) {
      logger.error(`Auto-commit failed for ${username}`, error);
    }
  }

  app.use(express.json({ limit: '50mb' }));

  // Socket.io logic
  io.on('connection', (socket) => {
    logger.release(`Socket.io: Client connected: ${socket.id}`);
    logger.debug(`Socket.io: Connection details for ${socket.id}`, {
      handshake: socket.handshake,
      address: socket.handshake.address
    });

    const active = Array.from(activeGenerations.values());
    if (active.length > 0) {
      socket.emit('chat:active_generations', active);
    }

    socket.on('disconnect', (reason) => {
      logger.release(`Socket.io: Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  async function updateStats(type: 'sent' | 'success' | 'fail') {
    try {
      await dbService.updateStat(type);
    } catch (error) {
      logger.error('Không thể cập nhật thống kê:', error);
    }
  }

  // API: Get all users
  app.get('/api/users', async (req, res) => {
    try {
      const users = await dbService.getUsers();
      res.json(users);
    } catch (error) {
      logger.error('Không thể liệt kê người dùng:', error);
      res.status(500).json({ error: 'Không thể liệt kê người dùng' });
    }
  });

  // API: Create/Login user
  app.post('/api/users', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Yêu cầu tên đăng nhập' });
    try {
      await ensureUserDir(username);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Không thể tạo người dùng' });
    }
  });

  // --- Project API ---
  app.get('/api/projects', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    try {
      const user = await dbService.getUser(username);
      if (!user) return res.json([]);
      const projects = await dbService.getProjects(user.id);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: 'Không thể lấy danh sách dự án' });
    }
  });

  app.post('/api/projects', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    const { name, details } = req.body;
    try {
      const user = await dbService.getUser(username);
      if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
      const projectId = await dbService.createProject(user.id, name, details);
      
      // Ensure project workspace exists
      const paths = getUserPaths(username, projectId);
      await fs.mkdir(paths.workspace, { recursive: true });
      
      // Init git for project
      const git = simpleGit(paths.workspace);
      await git.init();
      await fs.writeFile(path.join(paths.workspace, '.gitkeep'), '');
      await git.add('.');
      await git.commit('Initial project commit');

      res.json({ id: projectId, name, details, createdAt: Date.now() });
    } catch (error) {
      logger.error('Không thể tạo dự án:', error);
      res.status(500).json({ error: 'Không thể tạo dự án' });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    const { id } = req.params;
    try {
      await dbService.deleteProject(id);
      // Optionally delete project directory
      const paths = getUserPaths(username, id);
      await fs.rm(paths.projectDir, { recursive: true, force: true }).catch(() => {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Không thể xóa dự án' });
    }
  });

  // API: Get all chats
  app.get('/api/chats', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    if (!projectId) return res.status(400).json({ error: 'Yêu cầu ProjectId' });
    try {
      const chats = await dbService.getChats(projectId);
      
      // Merge active generations
      const active = Array.from(activeGenerations.values()).filter(g => g.username === username);
      for (const gen of active) {
        const chatIndex = chats.findIndex(c => c.id === gen.chatId);
        if (chatIndex !== -1) {
          const chat = chats[chatIndex];
          const lastMsg = chat.messages[chat.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.timestamp === gen.assistantMessage.timestamp) {
            lastMsg.content = gen.assistantMessage.content;
          } else {
            chat.messages.push({ ...gen.assistantMessage });
          }
        }
      }

      res.json({
        chats,
        generatingChatIds: active.map(g => g.chatId)
      });
    } catch (error) {
      res.status(500).json({ error: 'Không thể đọc danh sách chat' });
    }
  });

  // API: Save all chats (Legacy/Sync)
  app.post('/api/chats', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    if (!projectId) return res.status(400).json({ error: 'Yêu cầu ProjectId' });
    try {
      const chats = req.body;
      for (const chat of chats) {
        // Check if chat exists (Firestore check)
        const chatRef = doc(db, 'projects', projectId, 'chats', chat.id);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
          await dbService.createChat(projectId, chat);
          for (const msg of chat.messages) {
            await dbService.addMessage(projectId, chat.id, msg);
          }
        } else {
          await dbService.updateChatTitle(projectId, chat.id, chat.title);
        }
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Không thể lưu danh sách chat' });
    }
  });

  app.post('/api/chats/:id/close', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const { projectId } = req.body;
    const { id } = req.params;
    if (!username || !projectId) return res.status(400).json({ error: 'Username and ProjectId required' });
    try {
      const chatRef = doc(db, 'projects', projectId, 'chats', id);
      await updateDoc(chatRef, { isClosed: true });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to close chat' });
    }
  });

  // API: Install dependencies
  app.post('/api/workspace/install', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const { projectId } = req.body;
    if (!username || !projectId) return res.status(400).json({ error: 'Username and ProjectId required' });
    
    try {
      const paths = getUserPaths(username, projectId);
      
      logger.release(`Workspace: Installing dependencies for ${username} in ${projectId}...`);
      const { stdout, stderr } = await execAsync('npm install', { cwd: paths.workspace });
      
      logger.release(`Workspace: npm install complete for ${username}`);
      res.json({ success: true, stdout, stderr });
    } catch (error) {
      logger.error(`Workspace: npm install failed for ${username}`, error);
      res.status(500).json({ error: 'Failed to install dependencies', details: error instanceof Error ? error.message : String(error) });
    }
  });

  // API: Check package.json and install if changed
  app.post('/api/workspace/check-package-json', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const { projectId } = req.body;
    if (!username || !projectId) return res.status(400).json({ error: 'Username and ProjectId required' });
    
    try {
      const paths = getUserPaths(username, projectId);
      const packageJsonPath = path.join(paths.workspace, 'package.json');
      
      if (!fsSync.existsSync(packageJsonPath)) {
        return res.json({ success: true, changed: false, message: 'package.json not found' });
      }
      
      const packageJsonContent = fsSync.readFileSync(packageJsonPath, 'utf-8');
      const crypto = await import('crypto');
      const currentHash = crypto.createHash('md5').update(packageJsonContent).digest('hex');
      
      const project = await dbService.getProject(projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      
      if (project.lastPackageJsonHash !== currentHash) {
        logger.release(`Workspace: package.json changed for ${username} in ${projectId}. Auto-installing...`);
        
        // Update hash FIRST to prevent concurrent installs if possible
        await dbService.updateProject(projectId, { lastPackageJsonHash: currentHash });
        
        const { stdout, stderr } = await execAsync('npm install', { cwd: paths.workspace });
        
        logger.release(`Workspace: Auto npm install complete for ${username}`);
        return res.json({ success: true, changed: true, stdout, stderr });
      }
      
      res.json({ success: true, changed: false });
    } catch (error) {
      logger.error(`Workspace: package.json check failed for ${username}`, error);
      res.status(500).json({ error: 'Failed to check package.json', details: error instanceof Error ? error.message : String(error) });
    }
  });

  // API: Get config
  app.get('/api/config', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });

    try {
      const config = await dbService.getConfig(username);
      if (!config) {
        return res.json({
          systemPrompt: `Bạn là một trợ lý hữu ích cho ${username}.`,
          parameters: { temperature: 0.7, topP: 0.9, topK: 40, maxTokens: null, stop: [], jsonMode: false }
        });
      }
      res.json(config);
    } catch (error) {
      logger.error('Không thể đọc cấu hình:', error);
      res.status(500).json({ error: 'Không thể đọc cấu hình' });
    }
  });

  // API: Save config
  app.post('/api/config', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });

    try {
      const config = req.body;
      await dbService.saveConfig(username, config);
      
      io.emit(`config:updated:${username}`, config);
      res.json({ success: true });
    } catch (error) {
      logger.error('Không thể lưu cấu hình:', error);
      res.status(500).json({ error: 'Không thể lưu cấu hình' });
    }
  });

  // API: Get memory
  app.get('/api/memory', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    if (!projectId) return res.status(400).json({ error: 'Yêu cầu ProjectId' });
    try {
      const facts = await dbService.getMemory(projectId);
      res.json({ facts });
    } catch (error) {
      res.status(500).json({ error: 'Không thể đọc bộ nhớ' });
    }
  });

  // API: Save memory
  app.post('/api/memory', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    if (!projectId) return res.status(400).json({ error: 'Yêu cầu ProjectId' });
    try {
      const { facts } = req.body;
      // facts is usually an array of strings in the app, but dbService.saveMemory takes a string
      // Let's handle both or just save the latest fact if it's a string
      if (Array.isArray(facts)) {
        for (const fact of facts) {
          await dbService.saveMemory(projectId, fact);
        }
      } else {
        await dbService.saveMemory(projectId, facts);
      }
      io.emit(`memory:updated:${username}`, { facts });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Không thể lưu bộ nhớ' });
    }
  });

  // API: Get stats
  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await dbService.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Không thể đọc thống kê' });
    }
  });

  // API: Get logs with filtering
  app.get('/api/logs', async (req, res) => {
    try {
      const type = req.query.type as string; // 'debug', 'release', 'error', 'all'
      const data = await fs.readFile(SYSTEM_LOG_FILE, 'utf-8');
      const entries = data.split(/(?=\[(?:DEBUG|ERROR|RELEASE)\])/);
      
      let filteredLogs = entries;
      if (type && type !== 'all') {
        const prefix = `[${type.toUpperCase()}]`;
        filteredLogs = entries.filter(entry => entry.startsWith(prefix));
      }
      
      res.json({ logs: filteredLogs.slice(-100) }); // Get last 100 entries
    } catch (error) {
      res.status(500).json({ error: 'Không thể đọc nhật ký' });
    }
  });

  // API: Get error logs (legacy support)
  app.get('/api/logs/errors', async (req, res) => {
    try {
      const data = await fs.readFile(SYSTEM_LOG_FILE, 'utf-8');
      const entries = data.split(/(?=\[(?:DEBUG|ERROR|RELEASE)\])/);
      const errorLogs = entries.filter(entry => entry.includes('[ERROR]')).slice(-50);
      res.json({ logs: errorLogs });
    } catch (error) {
      res.status(500).json({ error: 'Không thể đọc nhật ký lỗi' });
    }
  });

  // API: Get chat debug logs (legacy support)
  app.get('/api/logs/chat-debug', async (req, res) => {
    try {
      const data = await fs.readFile(SYSTEM_LOG_FILE, 'utf-8');
      const entries = data.split(/(?=\[(?:DEBUG|ERROR|RELEASE)\])/);
      const debugLogs = entries.filter(entry => entry.includes('[CHAT_DEBUG]')).slice(-50);
      res.json({ logs: debugLogs });
    } catch (error) {
      res.status(500).json({ error: 'Không thể đọc nhật ký gỡ lỗi chat' });
    }
  });

  // API: Get system stats (CPU, Memory, Disk)
  app.get('/api/system/stats', async (req, res) => {
    try {
      const [cpu, mem, fsSize] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize()
      ]);
      res.json({ cpu, mem, fsSize });
    } catch (error) {
      logger.error('Failed to get system stats', error);
      res.status(500).json({ error: 'Failed to get system stats' });
    }
  });

  // API: Get processes
  app.get('/api/system/processes', async (req, res) => {
    try {
      const processes = await si.processes();
      res.json(processes);
    } catch (error) {
      logger.error('Failed to get processes', error);
      res.status(500).json({ error: 'Failed to get processes' });
    }
  });

  // API: Kill process
  app.post('/api/system/processes/kill', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });

    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) {
        return res.status(403).json({ error: 'Access denied. Only administrators can kill processes.' });
      }

      const { pid } = req.body;
      if (!pid) return res.status(400).json({ error: 'PID is required' });
      
      // Using sudo to allow non-root users (like thompson) to kill processes if configured in sudoers
      exec(`sudo kill -9 ${pid}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to kill process ${pid} for ${username}`, error);
          return res.status(500).json({ error: error.message });
        }
        logger.release(`Process ${pid} killed by ${username}`);
        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to kill process' });
    }
  });

  // API: Get services
  app.get('/api/system/services', async (req, res) => {
    try {
      const services = await si.services('*');
      res.json(services);
    } catch (error) {
      logger.error('Failed to get services', error);
      res.status(500).json({ error: 'Failed to get services' });
    }
  });

  // API: Control service
  app.post('/api/system/services/control', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });

    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) {
        return res.status(403).json({ error: 'Access denied. Only administrators can control services.' });
      }

      const { service, action } = req.body; // action: start, stop, restart
      if (!service || !action) return res.status(400).json({ error: 'Service and action are required' });
      
      // Using sudo to allow non-root users (like thompson) to control services if configured in sudoers
      exec(`sudo systemctl ${action} ${service}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to ${action} service ${service} for ${username}`, error);
          return res.status(500).json({ error: error.message });
        }
        logger.release(`Service ${service} ${action}ed by ${username}`);
        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to control service' });
    }
  });

  // API: Shutdown
  app.post('/api/system/shutdown', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });

    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) {
        return res.status(403).json({ error: 'Access denied. Only administrators can shutdown the system.' });
      }

      logger.release(`System shutdown initiated by ${username}`);
      exec('sudo shutdown +1', (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to initiate shutdown for ${username}`, error);
          return res.status(500).json({ error: error.message });
        }
        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to initiate shutdown' });
    }
  });

  // API: Terminal execute
  app.post('/api/system/terminal', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    
    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) {
        logger.error(`Truy cập terminal trái phép bởi ${username}`);
        return res.status(403).json({ error: 'Truy cập bị từ chối. Chỉ quản trị viên mới có thể sử dụng terminal.' });
      }

      const { command } = req.body;
      if (!command) return res.status(400).json({ error: 'Yêu cầu lệnh thực thi' });
      
      logger.release(`Terminal: Thực thi lệnh cho ${username}: ${command}`);
      // Add common sbin and bin paths to PATH so management commands are found
      const env = { 
        ...process.env, 
        PATH: `${process.env.PATH || ''}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` 
      };
      
      exec(command, { env }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Lệnh terminal thất bại: ${command}`, error);
        }
        if (stdout) logger.debug(`Terminal STDOUT: ${stdout}`);
        if (stderr) logger.debug(`Terminal STDERR: ${stderr}`);

        res.json({
          stdout,
          stderr,
          error: error ? error.message : null
        });
      });
    } catch (error) {
      logger.error('Lỗi thực thi terminal:', error);
      res.status(500).json({ error: 'Không thể thực thi lệnh' });
    }
  });

  // API: Terminal completion
  app.post('/api/system/terminal/complete', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });

    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) return res.json({ suggestions: [] });

      const { command } = req.body;
      if (!command) return res.json({ suggestions: [] });
      
      // Basic completion using bash compgen
      // We look at the last word of the command
      const lastWord = command.split(' ').pop() || '';
      // Use bash -c to run compgen. We include both files (-f) and commands (-c)
      const cmd = `bash -c "compgen -f ${lastWord} && compgen -c ${lastWord}"`;
      
      exec(cmd, (error, stdout, stderr) => {
        // Filter out empty strings and duplicates
        const suggestions = Array.from(new Set(stdout.split('\n').map(s => s.trim()).filter(s => s !== ''))).slice(0, 20);
        res.json({ suggestions });
      });
    } catch (error) {
      res.json({ suggestions: [] });
    }
  });



  // Helper: Get all files recursively
  async function getAllFiles(dirPath: string, baseDir: string): Promise<any[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath, baseDir);
        return [{ name: relativePath, isDirectory: true }, ...subFiles];
      } else {
        const stats = await fs.stat(fullPath);
        return { name: relativePath, isDirectory: false, size: stats.size, mtime: stats.mtime };
      }
    }));
    return files.flat();
  }

  // API: List workspace files
  app.get('/api/workspace', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username, projectId);
      if (!fsSync.existsSync(paths.workspace)) {
        await fs.mkdir(paths.workspace, { recursive: true });
      }
      const stats = await getAllFiles(paths.workspace, paths.workspace);
      res.json(stats);
    } catch (error) {
      logger.error('Failed to list workspace', error);
      res.status(500).json({ error: 'Failed to list workspace' });
    }
  });

  // API: Read workspace file
  app.get('/api/workspace/read', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const paths = getUserPaths(username, projectId);
      const safeName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(paths.workspace, safeName);
      const content = await fs.readFile(filePath, 'utf-8');
      res.json({ content });
    } catch (error) {
      logger.error('Failed to read file', error);
      res.status(500).json({ error: 'Failed to read file' });
    }
  });

  // API: Write workspace file
  app.post('/api/workspace/write', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const { name, content } = req.body;
      if (!name) return res.status(400).json({ error: 'Missing filename' });
      const paths = getUserPaths(username, projectId);
      const safeName = path.normalize(name).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(paths.workspace, safeName);
      const dirPath = path.dirname(filePath);
      
      // Ensure directory exists
      await fs.mkdir(dirPath, { recursive: true });
      
      await fs.writeFile(filePath, content, 'utf-8');
      io.emit(`workspace:updated:${username}`);
      res.json({ success: true });
      
      // Auto commit after writing
      const git = simpleGit(paths.workspace);
      try {
        await git.add('.');
        const status = await git.status();
        if (status.staged.length > 0 || status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0) {
          await git.commit(`Update ${safeName}`);
          io.emit(`workspace:history_updated:${username}`);
        }
      } catch (e) {
        logger.error('Auto commit failed', e);
      }
    } catch (error) {
      logger.error('Failed to write file', error);
      res.status(500).json({ error: 'Failed to write file' });
    }
  });

  // API: Delete workspace file
  app.delete('/api/workspace/delete', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const paths = getUserPaths(username, projectId);
      const safeName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(paths.workspace, safeName);
      await fs.rm(filePath, { recursive: true, force: true });
      io.emit(`workspace:updated:${username}`);
      res.json({ success: true });
      
      // Auto commit after deleting
      const git = simpleGit(paths.workspace);
      try {
        await git.add('.');
        const status = await git.status();
        if (status.staged.length > 0 || status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0) {
          await git.commit(`Delete ${safeName}`);
          io.emit(`workspace:history_updated:${username}`);
        }
      } catch (e) {
        logger.error('Auto commit failed', e);
      }
    } catch (error) {
      logger.error('Failed to delete file or folder', error);
      res.status(500).json({ error: 'Failed to delete file or folder' });
    }
  });

  // API: Get workspace history
  app.get('/api/workspace/history', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username, projectId);
      const git = simpleGit(paths.workspace);
      const log = await git.log();
      res.json({ history: log.all });
    } catch (error: any) {
      res.json({ history: [] });
    }
  });

  // API: Execute arbitrary command in workspace
  app.post('/api/workspace/exec', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const { command } = req.body;
      if (!command) return res.status(400).json({ error: 'Missing command' });
      const paths = getUserPaths(username, projectId);
      
      logger.debug(`API: Executing command for ${username} in project ${projectId}: ${command}`);
      
      // Execute command in workspace directory
      const { stdout, stderr } = await execAsync(command, { cwd: paths.workspace });
      
      res.json({ stdout, stderr });
      io.emit(`workspace:updated:${username}`);
    } catch (error: any) {
      logger.error('Failed to execute command', error);
      res.status(500).json({ 
        error: 'Failed to execute command', 
        stdout: error.stdout || '', 
        stderr: error.stderr || error.message 
      });
    }
  });

  // API: Get commit details
  app.get('/api/workspace/commit-details', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const hash = req.query.hash as string;
      if (!hash) return res.status(400).json({ error: 'Missing hash' });
      const paths = getUserPaths(username, projectId);
      const git = simpleGit(paths.workspace);
      
      let files = [];
      try {
        const diffSummary = await git.diffSummary([`${hash}^`, hash]);
        files = await Promise.all(diffSummary.files.map(async (f) => {
          let oldContent = '';
          let newContent = '';
          try { oldContent = await git.show([`${hash}^:${f.file}`]); } catch (e) {}
          try { newContent = await git.show([`${hash}:${f.file}`]); } catch (e) {}
          return { name: f.file, oldContent, newContent };
        }));
      } catch (e) {
        try {
          const show = await git.show([hash, '--name-only', '--pretty=format:']);
          const fileNames = show.split('\n').filter(Boolean);
          files = await Promise.all(fileNames.map(async (f) => {
            let newContent = '';
            try { newContent = await git.show([`${hash}:${f}`]); } catch (e) {}
            return { name: f, oldContent: '', newContent };
          }));
        } catch (innerError) {
           logger.error('Failed to get first commit details', innerError);
        }
      }
      res.json({ files });
    } catch (error) {
      logger.error('Failed to get commit details', error);
      res.status(500).json({ error: 'Failed to get commit details' });
    }
  });

  // API: Serve workspace files for preview
  app.use('/preview/:username', (req, res, next) => {
    const username = req.params.username;
    const paths = getUserPaths(username);
    express.static(paths.workspace)(req, res, next);
  });
  app.use('/preview/:username', (req, res) => {
    res.status(404).send('File not found in workspace');
  });

  // API: Delete workspace file
  app.delete('/api/workspace/delete', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const paths = getUserPaths(username);
      const safeName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(paths.workspace, safeName);
      await fs.rm(filePath, { recursive: true, force: true });
      io.emit(`workspace:updated:${username}`);
      res.json({ success: true });
      
      // Auto commit after deleting
      const git = simpleGit(paths.workspace);
      try {
        await git.add('.');
        const status = await git.status();
        if (status.staged.length > 0 || status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0) {
          await git.commit(`Delete ${safeName}`);
          io.emit(`workspace:history_updated:${username}`);
        }
      } catch (e) {
        logger.error('Auto commit failed', e);
      }
    } catch (error) {
      logger.error('Failed to delete file or folder', error);
      res.status(500).json({ error: 'Failed to delete file or folder' });
    }
  });

  // API: Get commit details
  app.get('/api/workspace/commit-details', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const hash = req.query.hash as string;
      if (!hash) return res.status(400).json({ error: 'Missing hash' });
      const paths = getUserPaths(username);
      const git = simpleGit(paths.workspace);
      
      let files = [];
      try {
        const diffSummary = await git.diffSummary([`${hash}^`, hash]);
        files = await Promise.all(diffSummary.files.map(async (f) => {
          let oldContent = '';
          let newContent = '';
          try { oldContent = await git.show([`${hash}^:${f.file}`]); } catch (e) {}
          try { newContent = await git.show([`${hash}:${f.file}`]); } catch (e) {}
          return { name: f.file, oldContent, newContent };
        }));
      } catch (e) {
        try {
          const show = await git.show([hash, '--name-only', '--pretty=format:']);
          const fileNames = show.split('\n').filter(Boolean);
          files = await Promise.all(fileNames.map(async (f) => {
            let newContent = '';
            try { newContent = await git.show([`${hash}:${f}`]); } catch (e) {}
            return { name: f, oldContent: '', newContent };
          }));
        } catch (innerError) {
           logger.error('Failed to get first commit details', innerError);
        }
      }
      res.json({ files });
    } catch (error) {
      logger.error('Failed to get commit details', error);
      res.status(500).json({ error: 'Failed to get commit details' });
    }
  });

  // API: Serve workspace files for preview
  app.use('/preview/:username', (req, res, next) => {
    const username = req.params.username;
    const paths = getUserPaths(username);
    express.static(paths.workspace)(req, res, next);
  });

  const workspaceProcesses = new Map<string, ChildProcess>();
  const WORKSPACE_PORTS = new Map<string, number>();
  let nextPort = 3001;

  app.post('/api/workspace/run', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      logger.debug(`API: Running workspace for ${username}...`);
      
      if (workspaceProcesses.has(username)) {
        logger.debug(`Killing existing workspace process for ${username}`);
        workspaceProcesses.get(username)?.kill();
        workspaceProcesses.delete(username);
      }

      const packageJsonPath = path.join(paths.workspace, 'package.json');
      if (await fileExists(packageJsonPath)) {
        logger.release(`Starting workspace app for ${username}...`);
        
        let port = WORKSPACE_PORTS.get(username);
        if (!port) {
          port = nextPort++;
          WORKSPACE_PORTS.set(username, port);
        }

        const pkgContent = await fs.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        let startCmd = 'npm run dev';
        if (pkg.scripts?.dev) {
          startCmd = `npm run dev -- --port ${port}`;
        } else if (pkg.scripts?.start) {
          startCmd = `npm start`;
        }

        let installCmd = 'npm install --no-audit --no-fund --prefer-offline --no-progress --loglevel=error && ';
        const nodeModulesPath = path.join(paths.workspace, 'node_modules');
        
        if (await fileExists(nodeModulesPath)) {
          const pkgStat = await fs.stat(packageJsonPath);
          const nmStat = await fs.stat(nodeModulesPath);
          if (pkgStat.mtime <= nmStat.mtime) {
            installCmd = '';
          }
        }

        const proc = spawn(`${installCmd}${startCmd}`, {
          cwd: paths.workspace,
          shell: true,
          env: { ...process.env, PORT: port.toString(), VITE_PORT: port.toString() }
        });

        workspaceProcesses.set(username, proc);

        let logBuffer = '';
        let logTimeout: NodeJS.Timeout | null = null;
        const emitLogs = () => {
          if (logBuffer) {
            io.emit(`workspace:log:${username}`, logBuffer);
            logBuffer = '';
          }
          logTimeout = null;
        };

        const queueLog = (data: string) => {
          logBuffer += data;
          if (!logTimeout) {
            logTimeout = setTimeout(emitLogs, 100);
          }
        };

        proc.stdout?.on('data', (data) => queueLog(data.toString()));
        proc.stderr?.on('data', (data) => queueLog(data.toString()));
        proc.on('error', (err) => {
          logger.error(`Workspace process error for ${username}`, err);
          io.emit(`workspace:log:${username}`, `Process error: ${err.message}\n`);
        });
        proc.on('close', (code) => {
          emitLogs();
          io.emit(`workspace:log:${username}`, `Process exited with code ${code}\n`);
          workspaceProcesses.delete(username);
        });

        res.json({ success: true, type: 'node', port });
      } else {
        res.json({ success: true, type: 'static' });
      }
    } catch (error) {
      logger.error('Failed to run workspace', error);
      res.status(500).json({ error: 'Failed to run workspace' });
    }
  });

  app.post('/api/workspace/stop', (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    
    if (workspaceProcesses.has(username)) {
      workspaceProcesses.get(username)?.kill();
      workspaceProcesses.delete(username);
      io.emit(`workspace:log:${username}`, 'Process stopped by user');
    }
    res.json({ success: true });
  });

  app.use('/workspace-preview/:username', (req, res, next) => {
    const username = req.params.username;
    const port = WORKSPACE_PORTS.get(username);
    if (!port) return res.status(404).send('Workspace not running');
    
    createProxyMiddleware({
      target: `http://localhost:${port}`,
      changeOrigin: true,
      ws: true,
      pathRewrite: {
        [`^/workspace-preview/${username}`]: '',
      },
      on: {
        error: (err, req, res) => {
          if ('writeHead' in res) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Workspace app is starting or not running.');
          }
        }
      }
    })(req, res, next);
  });

  // --- Ollama Proxy Endpoints ---

  // List models
  app.get('/api/ollama/tags', async (req, res) => {
    try {
      logger.debug(`Ollama Proxy: Fetching tags from ${OLLAMA_URL}/api/tags`);
      const response = await fetch(`${OLLAMA_URL}/api/tags`).catch(err => {
        throw new Error(`Connection failed: ${err.message}`);
      });
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      logger.debug('Ollama Proxy: Tags fetched successfully', { count: data.models?.length });
      res.json(data);
    } catch (error) {
      logger.error('Ollama Proxy Error: Tags fetch failed', error);
      res.status(500).json({ error: 'Failed to fetch models from Ollama' });
    }
  });

  // List running models
  app.get('/api/ollama/ps', async (req, res) => {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/ps`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error('Ollama PS Error:', error);
      res.status(500).json({ error: 'Failed to fetch running models from Ollama' });
    }
  });

  // Chat with streaming
  app.post('/api/ollama/chat', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });

    const { chatId, projectId, messages, model, parameters, systemPrompt: bodySystemPrompt } = req.body;
    if (!projectId) return res.status(400).json({ error: 'ProjectId required' });
    
    await updateStats('sent');

    logger.release(`Proxy: Starting chat session for ${chatId} (${username}) in project ${projectId} using ${model}`);
    
    try {
      const paths = getUserPaths(username, projectId);
      
      // Save user message to DB immediately
      try {
        const userMsg = messages[messages.length - 1];
        const chatRef = doc(db, 'projects', projectId, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
          await dbService.addMessage(projectId, chatId, userMsg);
        } else {
          const newChat = {
            id: chatId,
            title: userMsg.content ? (userMsg.content.slice(0, 30) + (userMsg.content.length > 30 ? '...' : '')) : 'Image Chat',
            messages: [userMsg],
            model: model,
            createdAt: Date.now()
          };
          await dbService.createChat(projectId, newChat);
          await dbService.addMessage(projectId, chatId, userMsg);
        }
        // Notify client about chat update
        io.emit(`chats:updated:${username}`, { projectId });
      } catch (e) {
        logger.error(`Failed to pre-save user message for chat ${chatId}`, e);
      }

      const config = await dbService.getConfig(username);
      const facts = await dbService.getMemory(projectId);

      // Inject memory into system prompt
      const systemPrompt = bodySystemPrompt || config?.systemPrompt || '';
      const memoryContext = facts.length > 0 
        ? `\n\nUser Context (Long-term Memory):\n${facts.map((f: string) => `- ${f}`).join('\n')}`
        : '';
      
      const enrichedMessages = [...messages];
      const systemMsgIndex = enrichedMessages.findIndex(m => m.role === 'system');
      if (systemMsgIndex !== -1) {
        enrichedMessages[systemMsgIndex].content += memoryContext;
      } else {
        enrichedMessages.unshift({ role: 'system', content: systemPrompt + memoryContext });
      }

      const options: any = {};
      if (parameters) {
        if (parameters.temperature !== undefined) options.temperature = parameters.temperature;
        if (parameters.topP !== undefined) options.top_p = parameters.topP;
        if (parameters.topK !== undefined) options.top_k = parameters.topK;
        if (parameters.maxTokens !== undefined) options.num_predict = parameters.maxTokens;
        if (parameters.stop !== undefined) options.stop = parameters.stop;
      }

      const requestBody: any = {
        model,
        messages: enrichedMessages,
        stream: true,
        options,
      };

      if (parameters?.jsonMode) {
        requestBody.format = 'json';
      }

      logger.debug(`[CHAT_DEBUG] Request to model ${model} for ${username}:`, requestBody);

      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`Ollama Proxy Error: Chat request failed for ${chatId} (${username})`, error);
        return res.status(response.status).send(error);
      }

      // Set headers for streaming
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      let lastProcessedToolCallIndex = 0;
      let buffer = '';
      const decoder = new TextDecoder();
      
      const userMessage = messages[messages.length - 1];
      const assistantMessage = { role: 'assistant', content: '', timestamp: Date.now() };

      activeGenerations.set(chatId, {
        chatId,
        username,
        model,
        userMessage,
        assistantMessage
      });

      // Emit start event via Socket.io
      io.emit(`chat:start:${username}`, {
        chatId,
        model,
        userMessage,
        assistantMessage
      });
      io.emit(`chat:status:${username}`, { loading: true, chatId });

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            try {
              const json = JSON.parse(buffer);
              if (json.message?.content) {
                assistantContent += json.message.content;
                const gen = activeGenerations.get(chatId);
                if (gen) gen.assistantMessage.content = assistantContent;
                io.emit(`chat:chunk:${username}`, { chatId, chunk: json.message.content });
              }
            } catch (e) {}
          }
          
          const newContent = assistantContent.substring(lastProcessedToolCallIndex);
          let latestIndex = lastProcessedToolCallIndex;

          const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
          let match;
          while ((match = xmlRegex.exec(newContent)) !== null) {
            try {
              let jsonString = match[1].trim();
              if (jsonString.startsWith('```')) {
                jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
              }
              const call = JSON.parse(jsonString);
              if (call.tool && call.args) {
                executeToolCall(chatId, call, username, projectId);
              }
            } catch (e) {
              logger.error(`Stream Tool Error: Failed to parse tool call in ${chatId}`, e);
            }
            latestIndex = Math.max(latestIndex, lastProcessedToolCallIndex + match.index + match[0].length);
          }

          const mdRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
          while ((match = mdRegex.exec(newContent)) !== null) {
            try {
              const jsonString = match[1].trim();
              let calls;
              try {
                calls = JSON.parse(jsonString);
                if (!Array.isArray(calls)) {
                  calls = [calls];
                }
              } catch (e) {
                // Heuristic: If it's not JSON, check if there's a filename hint before the block
                // Look for [filename.ts] or similar in the text before the match
                const textBefore = newContent.substring(0, match.index);
                const filenameHintRegex = /(?:\[|`|file:?\s*)([\w./-]+\.[\w]+)(?:\]|`|:?)/i;
                const hintMatch = textBefore.match(filenameHintRegex);
                
                if (hintMatch && username === 'admin') {
                  const filename = hintMatch[1];
                  logger.release(`Heuristic: Detected code block for ${filename} for ${username}`);
                  executeToolCall(chatId, {
                    tool: 'write_file',
                    args: { name: filename, content: jsonString }
                  }, username, projectId);
                }
                continue;
              }
              
              for (const call of calls) {
                if (call && call.tool && call.args && ['list_files', 'read_file', 'write_file', 'delete_file'].includes(call.tool)) {
                  const isInsideXml = newContent.substring(0, match.index).lastIndexOf('<tool_call>') > newContent.substring(0, match.index).lastIndexOf('</tool_call>');
                  if (!isInsideXml) {
                    executeToolCall(chatId, call, username, projectId);
                  }
                }
              }
            } catch (e) {}
            latestIndex = Math.max(latestIndex, lastProcessedToolCallIndex + match.index + match[0].length);
          }

          lastProcessedToolCallIndex = latestIndex;
          io.emit(`chat:status:${username}`, { loading: false, chatId });
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              const contentChunk = json.message.content;
              assistantContent += contentChunk;
              const gen = activeGenerations.get(chatId);
              if (gen) gen.assistantMessage.content = assistantContent;
              
              io.emit(`chat:chunk:${username}`, { chatId, chunk: contentChunk });
              
              const newContent = assistantContent.substring(lastProcessedToolCallIndex);
              let latestIndex = lastProcessedToolCallIndex;

              const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
              let match;
              while ((match = xmlRegex.exec(newContent)) !== null) {
                try {
                  let jsonString = match[1].trim();
                  if (jsonString.startsWith('```')) {
                    jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                  }
                  const call = JSON.parse(jsonString);
                  if (call.tool && call.args) {
                    executeToolCall(chatId, call, username, projectId);
                  }
                } catch (e) {
                  logger.error(`Stream Tool Error: Failed to parse tool call in ${chatId}`, e);
                }
                latestIndex = Math.max(latestIndex, lastProcessedToolCallIndex + match.index + match[0].length);
              }

              const mdRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
              while ((match = mdRegex.exec(newContent)) !== null) {
                try {
                  const jsonString = match[1].trim();
                  let calls = JSON.parse(jsonString);
                  if (!Array.isArray(calls)) {
                    calls = [calls];
                  }
                  
                      for (const call of calls) {
                        if (call && call.tool && call.args && ['list_files', 'read_file', 'write_file', 'delete_file'].includes(call.tool)) {
                          const isInsideXml = newContent.substring(0, match.index).lastIndexOf('<tool_call>') > newContent.substring(0, match.index).lastIndexOf('</tool_call>');
                          if (!isInsideXml) {
                            executeToolCall(chatId, call, username, projectId);
                          }
                        }
                      }
                } catch (e) {}
                latestIndex = Math.max(latestIndex, lastProcessedToolCallIndex + match.index + match[0].length);
              }

              lastProcessedToolCallIndex = latestIndex;
            }
          } catch (e) {}
        }
        
        res.write(value);
      }

      activeGenerations.delete(chatId);
      io.emit(`chat:end:${username}`, { chatId, finalContent: assistantContent });
      io.emit(`chat:status:${username}`, { loading: false, chatId });
      logger.release(`Ollama Proxy: Chat session complete for ${chatId} (${username}) in project ${projectId}`);
      
      // Save assistant message to DB
      await dbService.addMessage(projectId, chatId, { role: 'assistant', content: assistantContent, timestamp: Date.now() });
      io.emit(`chats:updated:${username}`, { projectId });

      // Post-chat logic
      extractMemory(chatId, model, [...messages, { role: 'assistant', content: assistantContent, timestamp: Date.now() }], username, projectId);
      autoCommit(username, `AI update in chat ${chatId}`, projectId);
      
      res.end();
      await updateStats('success');
      
    } catch (error) {
      activeGenerations.delete(chatId);
      logger.error('Ollama Chat Error:', error);
      await updateStats('fail');
      io.emit(`chat:status:${username}`, { loading: false, chatId });
      res.status(500).json({ error: 'Failed to communicate with Ollama' });
    }
  });

  // Pull model with streaming
  app.post('/api/ollama/pull', async (req, res) => {
    const { name } = req.body;
    logger.release(`Ollama Proxy: Pulling model ${name}`);
    try {
      const response = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stream: true }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`Ollama Proxy Error: Pull failed for ${name}`, error);
        return res.status(response.status).send(error);
      }

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStr = new TextDecoder().decode(value);
        const lines = chunkStr.split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            // Emit pull progress via Socket.io
            io.emit('ollama:pull:progress', { name, ...json });
          } catch (e) {}
        }

        res.write(value);
      }
      res.end();
    } catch (error) {
      logger.error('Ollama Pull Error:', error);
      res.status(500).json({ error: 'Failed to pull model from Ollama' });
    }
  });

  // Delete model
  app.delete('/api/ollama/delete', async (req, res) => {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error('Ollama Delete Error:', error);
      res.status(500).json({ error: 'Failed to delete model from Ollama' });
    }
  });

  // --- End Ollama Proxy Endpoints ---

  async function executeToolCall(chatId: string, call: any, username: string, projectId: string) {
    try {
      const paths = getUserPaths(username, projectId);
      
      // Check if user is admin for workspace tools
      if (username !== 'admin' && ['list_files', 'read_file', 'write_file', 'delete_file'].includes(call.tool)) {
        logger.error(`Unauthorized tool access attempt by ${username}: ${call.tool}`);
        io.emit(`tool:result:${username}`, { 
          chatId, 
          tool: call.tool, 
          result: `Error: Access denied. Only administrators can perform workspace operations.` 
        });
        return;
      }

      logger.debug(`Executing tool ${call.tool} for ${username}`, call.args);
      switch (call.tool) {
        case 'list_files':
          try {
            const allFiles = await getAllFiles(paths.workspace, paths.workspace);
            io.emit(`tool:result:${username}`, { chatId, tool: 'list_files', result: allFiles.map(f => f.name) });
            logger.release(`Tool list_files success for ${username}: ${allFiles.length} files`);
          } catch (e) {
            logger.error(`Tool list_files failed for ${username}`, e);
            throw e;
          }
          break;
        case 'read_file':
          if (call.args.name) {
            const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
            const filePath = path.join(paths.workspace, safeName);
            try {
              const fileContent = await fs.readFile(filePath, 'utf-8');
              io.emit(`tool:result:${username}`, { chatId, tool: 'read_file', result: fileContent });
              logger.release(`Tool read_file success for ${username}: ${safeName}`);
            } catch (e) {
              logger.error(`Tool read_file failed for ${username}: ${safeName}`, e);
              throw e;
            }
          }
          break;
        case 'write_file':
          if (call.args.name && call.args.content !== undefined) {
            const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
            const filePath = path.join(paths.workspace, safeName);
            const dirPath = path.dirname(filePath);
            
            try {
              // Ensure directory exists
              await fs.mkdir(dirPath, { recursive: true });
              await fs.writeFile(filePath, call.args.content, 'utf-8');
              io.emit(`workspace:updated:${username}`);
              io.emit(`tool:result:${username}`, { chatId, tool: 'write_file', result: `Successfully wrote to ${safeName}` });
              logger.release(`Tool write_file success for ${username}: ${safeName}`);
            } catch (e) {
              logger.error(`Tool write_file failed for ${username}: ${safeName}`, e);
              throw e;
            }
          }
          break;
        case 'delete_file':
          if (call.args.name) {
            const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
            const filePath = path.join(paths.workspace, safeName);
            try {
              await fs.unlink(filePath);
              io.emit(`workspace:updated:${username}`);
              io.emit(`tool:result:${username}`, { chatId, tool: 'delete_file', result: `Successfully deleted ${safeName}` });
              logger.release(`Tool delete_file success for ${username}: ${safeName}`);
            } catch (e) {
              logger.error(`Tool delete_file failed for ${username}: ${safeName}`, e);
              throw e;
            }
          }
          break;
      }
    } catch (error) {
      logger.error(`Tool execution failed (${call.tool}) for ${chatId} (${username})`, error);
    }
  }

  async function extractMemory(chatId: string, model: string, messages: any[], username: string, projectId: string) {
    // Memory Extraction
    if (chatId !== 'memory-extraction') {
      try {
        logger.debug(`Post-chat logic: Starting memory extraction for ${chatId} (${username}) in project ${projectId}`);
        const currentFacts = await dbService.getMemory(projectId);
        
        const context = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
        
        const memoryResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { 
                role: 'system', 
                content: `You are a memory consolidation module. Your task is to maintain a concise, deduplicated list of facts, preferences, and project goals about the user.
                
                Current Memory:
                ${JSON.stringify(currentFacts)}
                
                Instructions:
                1. Extract any NEW facts from the conversation snippet.
                2. Combine them with the Current Memory.
                3. CRITICAL: Review the combined list and REMOVE any semantic duplicates, redundancies, or overlapping information. Merge related facts into single, comprehensive sentences if possible.
                4. Output ONLY a JSON array of strings representing the FINAL, consolidated memory list. You MUST include the existing facts from the Current Memory unless they are superseded or merged with new facts. Do not output markdown code blocks, just the JSON array.` 
              },
              { role: 'user', content: `Conversation snippet:\n${context}` }
            ],
            stream: false
          }),
        });

        if (memoryResponse.ok) {
          const json = await memoryResponse.json();
          const memoryContent = json.message?.content || '[]';
          logger.debug(`Post-chat logic: Raw memory extraction response for ${chatId} (${username}) in project ${projectId}`, memoryContent);
          const match = memoryContent.match(/\[.*\]/s);
          if (match) {
            const consolidatedFacts = JSON.parse(match[0]);
            if (Array.isArray(consolidatedFacts)) {
              for (const fact of consolidatedFacts) {
                await dbService.saveMemory(projectId, fact);
              }
              io.emit(`memory:updated:${username}`, { facts: consolidatedFacts });
              logger.release(`Post-chat logic: Memory consolidated for ${username} in project ${projectId}. Total facts: ${consolidatedFacts.length}`);
            }
          }
        } else {
          logger.error(`Post-chat logic Error: Memory extraction request failed for ${chatId} (${username}) in project ${projectId}`);
        }
      } catch (error) {
        logger.error(`Post-chat logic Error: Memory extraction failed for ${chatId} (${username}) in project ${projectId}`, error);
      }
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // API: Fix workspace permissions
  app.post('/api/system/fix-permissions', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      logger.release(`Fixing workspace permissions for ${username}...`);
      // Use chmod -R 777 as a broad fix for permission issues in the workspace
      await execAsync(`chmod -R 777 ${paths.workspace}`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error(`Failed to fix permissions for ${username}`, error);
      res.status(500).json({ error: error.message });
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.release(`Server status: Running on http://localhost:${PORT}`);
    logger.debug(`Server configuration:`, {
      OLLAMA_URL,
      LOG_LEVEL,
      DATA_DIR
    });
  });
}

startServer();
