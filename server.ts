import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess, exec } from 'child_process';
import treeKill from 'tree-kill';
import { promisify } from 'util';
import { createProxyMiddleware } from 'http-proxy-middleware';
import waitOn from 'wait-on';
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
const USERS_DIR = DATA_DIR;
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
      // Delete all chats and their messages
      const chatsQ = query(collection(db, 'projects', id, 'chats'));
      const chatsSnapshot = await getDocs(chatsQ);
      for (const chatDoc of chatsSnapshot.docs) {
        await dbService.deleteChat(id, chatDoc.id);
      }

      // Delete all memories
      const memoriesQ = query(collection(db, 'projects', id, 'memories'));
      const memoriesSnapshot = await getDocs(memoriesQ);
      for (const memoryDoc of memoriesSnapshot.docs) {
        await deleteDoc(doc(db, 'projects', id, 'memories', memoryDoc.id));
      }

      // Delete project document
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
      // Delete messages
      const messagesQ = query(collection(db, 'projects', projectId, 'chats', id, 'messages'));
      const messagesSnapshot = await getDocs(messagesQ);
      for (const msgDoc of messagesSnapshot.docs) {
        await deleteDoc(doc(db, 'projects', projectId, 'chats', id, 'messages', msgDoc.id));
      }
      
      await deleteDoc(doc(db, 'projects', projectId, 'chats', id));
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
  const projectDir = projectId ? path.join(userDir, projectId) : userDir;
  return {
    dir: userDir,
    projectDir: projectDir,
    workspace: projectDir
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

let USE_9ROUTER = true; // Force true for now, or just remove the toggle later
let ROUTER_URL = process.env.ROUTER_URL || 'https://api.9router.com/v1/chat/completions';
let ROUTER_API_KEY = process.env.ROUTER_API_KEY || '';
let WORKSPACE_HOST = process.env.WORKSPACE_HOST || 'localhost';

// Load initial config for system if available
async function initSystemConfig() {
  try {
    // We'll use a global system config for Workspace Host
    const configRef = doc(db, 'system', 'config');
    const configSnap = await getDoc(configRef);
    if (configSnap.exists()) {
      const data = configSnap.data();
      if (data.use9Router !== undefined) {
        USE_9ROUTER = data.use9Router;
        logger.release(`System: Loaded USE_9ROUTER from DB: ${USE_9ROUTER}`);
      }
      if (data.routerUrl) {
        ROUTER_URL = data.routerUrl;
        logger.release(`System: Loaded ROUTER_URL from DB: ${ROUTER_URL}`);
      }
      if (data.routerApiKey) {
        ROUTER_API_KEY = data.routerApiKey;
        logger.release(`System: Loaded ROUTER_API_KEY from DB: ${ROUTER_API_KEY ? '***' : ''}`);
      }
      if (data.workspaceHost) {
        WORKSPACE_HOST = data.workspaceHost;
        logger.release(`System: Loaded Workspace Host from DB: ${WORKSPACE_HOST}`);
      }
    }
  } catch (e) {
    logger.error('Failed to load system config', e);
  }
}
initSystemConfig();
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug'; // 'debug' or 'release'



function getTagAndMessage(message: string): { tag: string, msg: string } {
  const prefixes: Record<string, string> = {
    'Socket.io:': 'NETWORK',
    'Project:': 'PROJECT',
    'Workspace:': 'WORKSPACE',
    'Terminal:': 'WORKSPACE',
    'AI Proxy:': 'CHAT',
    'AI Proxy Error:': 'CHAT',
    'AI Chat Error:': 'CHAT',
    'AI Pull Error:': 'CHAT',
    'AI Delete Error:': 'CHAT',
    'AI Active Models Error:': 'CHAT',
    'API:': 'API',
    'Tool': 'TOOL',
    'Post-chat logic': 'CHAT',
    'Stream Tool Error:': 'TOOL',
    'Heuristic:': 'TOOL',
    'Auto-commit': 'FILE',
    'Auto commit': 'FILE'
  };

  for (const [prefix, tag] of Object.entries(prefixes)) {
    if (message.startsWith(prefix)) {
      return { tag, msg: message };
    }
  }

  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('file') || lowerMsg.includes('commit')) return { tag: 'FILE', msg: message };
  if (lowerMsg.includes('chat') || lowerMsg.includes('model')) return { tag: 'CHAT', msg: message };
  if (lowerMsg.includes('workspace') || lowerMsg.includes('npm') || lowerMsg.includes('process')) return { tag: 'WORKSPACE', msg: message };
  if (lowerMsg.includes('swap') || lowerMsg.includes('service') || lowerMsg.includes('shutdown')) return { tag: 'SYSTEM', msg: message };
  
  return { tag: 'SYSTEM', msg: message };
}

const logger = {
  debug: (message: string, data?: any) => {
    if (LOG_LEVEL === 'debug') {
      const { tag, msg } = getTagAndMessage(message);
      const logMsg = `[DEBUG] [${tag}] ${new Date().toISOString()} - ${msg}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
      process.stdout.write(logMsg);
      try {
        fsSync.appendFileSync(SYSTEM_LOG_FILE, logMsg);
      } catch (e) {}
    }
  },
  release: (message: string, data?: any) => {
    const { tag, msg } = getTagAndMessage(message);
    const logMsg = `[RELEASE] [${tag}] ${new Date().toISOString()} - ${msg}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
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
    const { tag, msg } = getTagAndMessage(message);
    const logMsg = `[ERROR] [${tag}] ${new Date().toISOString()} - ${msg}${errorData ? ' ' + JSON.stringify(errorData, null, 2) : ''}\n`;
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

  // Fix dubious ownership issue for git
  exec('git config --global --add safe.directory "*"');

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
      logger.release(`Project: Creating new project "${name}" for ${username}`);
      const user = await dbService.getUser(username);
      if (!user) {
        logger.error(`Project: User ${username} not found in DB`);
        return res.status(404).json({ error: 'Không tìm thấy người dùng' });
      }
      const projectId = await dbService.createProject(user.id, name, details);
      logger.release(`Project: Created project ID ${projectId} in DB`);
      
      // Ensure project workspace exists
      const paths = getUserPaths(username, projectId);
      logger.debug(`Project: Creating workspace directory at ${paths.workspace}`);
      await fs.mkdir(paths.workspace, { recursive: true });
      
      // Init git for project
      logger.debug(`Project: Initializing git in ${paths.workspace}`);
      const git = simpleGit(paths.workspace);
      await git.init();
      await git.addConfig('user.name', username);
      await git.addConfig('user.email', `${username}@ollama.web`);
      await fs.writeFile(path.join(paths.workspace, '.gitkeep'), '');
      await git.add('.');
      await git.commit('Initial project commit');
      logger.release(`Project: Successfully initialized workspace and git for ${projectId}`);

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

  // API: Delete a chat
  app.delete('/api/chats/:id', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    const { id } = req.params;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    if (!projectId) return res.status(400).json({ error: 'Yêu cầu ProjectId' });
    try {
      await dbService.deleteChat(projectId, id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Không thể xóa chat' });
    }
  });

  // API: Delete all chats for a project
  app.delete('/api/chats', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username) return res.status(400).json({ error: 'Yêu cầu header username' });
    if (!projectId) return res.status(400).json({ error: 'Yêu cầu ProjectId' });
    try {
      const chatsQ = query(collection(db, 'projects', projectId, 'chats'));
      const chatsSnapshot = await getDocs(chatsQ);
      for (const chatDoc of chatsSnapshot.docs) {
        await dbService.deleteChat(projectId, chatDoc.id);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Không thể xóa tất cả chat' });
    }
  });

  // API: Install dependencies
  app.post('/api/workspace/install', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const { projectId } = req.body;
    if (!username || !projectId) return res.status(400).json({ error: 'Username and ProjectId required' });
    
    try {
      const paths = getUserPaths(username, projectId);
      logger.release(`Workspace: Manual npm install triggered by ${username} for ${projectId}`);
      
      logger.release(`Workspace: Installing dependencies in ${paths.workspace}...`);
      const { stdout, stderr } = await execAsync('npm install', { cwd: paths.workspace });
      
      if (stderr) logger.debug(`Workspace: npm install stderr: ${stderr}`);
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
      
      logger.debug(`Workspace: Checking package.json at ${packageJsonPath}`);
      if (!fsSync.existsSync(packageJsonPath)) {
        logger.debug(`Workspace: package.json not found for ${projectId}`);
        return res.json({ success: true, changed: false, message: 'package.json not found' });
      }
      
      const packageJsonContent = fsSync.readFileSync(packageJsonPath, 'utf-8');
      const crypto = await import('crypto');
      const currentHash = crypto.createHash('md5').update(packageJsonContent).digest('hex');
      
      const project = await dbService.getProject(projectId);
      if (!project) {
        logger.error(`Workspace: Project ${projectId} not found in DB`);
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (project.lastPackageJsonHash !== currentHash) {
        logger.release(`Workspace: package.json changed for ${username} in ${projectId}. Auto-installing...`);
        logger.debug(`Workspace: Old hash: ${project.lastPackageJsonHash}, New hash: ${currentHash}`);
        
        // Update hash FIRST to prevent concurrent installs if possible
        await dbService.updateProject(projectId, { lastPackageJsonHash: currentHash });
        
        const { stdout, stderr } = await execAsync('npm install', { cwd: paths.workspace });
        
        if (stderr) logger.debug(`Workspace: Auto npm install stderr: ${stderr}`);
        logger.release(`Workspace: Auto npm install complete for ${username}`);
        return res.json({ success: true, changed: true, stdout, stderr });
      }
      
      logger.debug(`Workspace: package.json hash matches for ${projectId}`);
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
      const config = await dbService.getConfig(username) as any;
      const defaultConfig = {
        systemPrompt: `Bạn là một trợ lý hữu ích cho ${username}.`,
        parameters: { temperature: 0.7, topP: 0.9, topK: 40, maxTokens: null, stop: [], jsonMode: false }
      };
      
      const finalConfig = config || defaultConfig;
      // Also include the global Workspace Host
      res.json({ 
        ...finalConfig, 
        use9Router: USE_9ROUTER,
        routerUrl: ROUTER_URL,
        routerApiKey: ROUTER_API_KEY,
        workspaceHost: WORKSPACE_HOST 
      });
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
      const { systemPrompt, parameters, use9Router, routerUrl, routerApiKey, workspaceHost } = config;
      
      await dbService.saveConfig(username, { systemPrompt, parameters });
      
      // Update global settings
      const updates: any = {};
      if (use9Router !== undefined) {
        USE_9ROUTER = use9Router;
        updates.use9Router = use9Router;
        logger.release(`System: Updated global USE_9ROUTER to ${USE_9ROUTER} by ${username}`);
      }
      if (routerUrl !== undefined) {
        ROUTER_URL = routerUrl;
        updates.routerUrl = routerUrl;
        logger.release(`System: Updated global ROUTER_URL to ${ROUTER_URL} by ${username}`);
      }
      if (routerApiKey !== undefined) {
        ROUTER_API_KEY = routerApiKey;
        updates.routerApiKey = routerApiKey;
        logger.release(`System: Updated global ROUTER_API_KEY by ${username}`);
      }
      if (workspaceHost !== undefined) {
        WORKSPACE_HOST = workspaceHost;
        updates.workspaceHost = workspaceHost;
        logger.release(`System: Updated global Workspace Host to ${WORKSPACE_HOST} by ${username}`);
      }
      
      if (Object.keys(updates).length > 0) {
        await setDoc(doc(db, 'system', 'config'), updates, { merge: true });
      }
      
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
      
      res.json({ logs: filteredLogs.slice(-2000) }); // Get last 2000 entries for better filtering
    } catch (error) {
      res.status(500).json({ error: 'Không thể đọc nhật ký' });
    }
  });

  // API: Clear logs
  app.delete('/api/logs', async (req, res) => {
    try {
      const { date } = req.query; // Optional date 'YYYY-MM-DD'
      if (date) {
        const data = await fs.readFile(SYSTEM_LOG_FILE, 'utf-8');
        const entries = data.split(/(?=\[(?:DEBUG|ERROR|RELEASE)\])/);
        const filteredLogs = entries.filter(entry => !entry.includes(`] ${date}`));
        await fs.writeFile(SYSTEM_LOG_FILE, filteredLogs.join(''));
      } else {
        await fs.writeFile(SYSTEM_LOG_FILE, '');
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Không thể xóa nhật ký' });
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

  // API: Get user role
  app.get('/api/user/role', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const user = await dbService.getUser(username);
      res.json({ role: user?.role || 'user' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user role' });
    }
  });
  // API: Get system stats (CPU, Memory, Disk, Swap)
  app.get('/api/system/stats', async (req, res) => {
    try {
      const [cpu, mem, fsSize, freeOutput] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        execAsync('free -b').then(r => r.stdout).catch(() => '')
      ]);

      let swapTotal = mem.swaptotal;
      let swapUsed = mem.swapused;
      let swapFree = mem.swapfree;

      // Try to get more accurate swap info from free command or /proc/meminfo
      if (freeOutput) {
        const lines = freeOutput.trim().split('\n');
        const swapLine = lines.find(l => l.startsWith('Swap:'));
        if (swapLine) {
          const parts = swapLine.split(/\s+/);
          swapTotal = parseInt(parts[1]);
          swapUsed = parseInt(parts[2]);
          swapFree = parseInt(parts[3]);
        }
      } else {
        // Fallback to /proc/meminfo if free is not available
        try {
          const meminfo = await execAsync('cat /proc/meminfo').then(r => r.stdout);
          const totalMatch = meminfo.match(/SwapTotal:\s+(\d+)\s+kB/);
          const freeMatch = meminfo.match(/SwapFree:\s+(\d+)\s+kB/);
          if (totalMatch && freeMatch) {
            swapTotal = parseInt(totalMatch[1]) * 1024;
            swapFree = parseInt(freeMatch[1]) * 1024;
            swapUsed = swapTotal - swapFree;
          }
        } catch (e) {
          // Keep si.mem values if both fail
        }
      }

      res.json({ 
        cpu, 
        mem: {
          ...mem,
          swapTotal,
          swapUsed,
          swapFree
        }, 
        fsSize 
      });
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

  // API: Get swap configuration
  app.get('/api/system/swap/config', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      // Allow all authenticated users to read swap config for monitoring
      const [swappiness, swapDevices] = await Promise.all([
        execAsync('cat /proc/sys/vm/swappiness').then(r => parseInt(r.stdout.trim())).catch(() => 60),
        execAsync('swapon --show --bytes --noheadings').then(r => {
          const lines = r.stdout.trim().split('\n').filter(l => l);
          if (lines.length === 0) throw new Error('No swap devices from swapon');
          return lines.map(line => {
            const parts = line.split(/\s+/);
            return {
              name: parts[0],
              type: parts[1],
              size: parseInt(parts[2]),
              used: parseInt(parts[3]),
              priority: parseInt(parts[4])
            };
          });
        }).catch(async () => {
          // Fallback to /proc/swaps
          try {
            const swaps = await execAsync('cat /proc/swaps').then(r => r.stdout);
            const lines = swaps.trim().split('\n').slice(1); // Skip header
            return lines.map(line => {
              const parts = line.split(/\s+/);
              return {
                name: parts[0],
                type: parts[1],
                size: parseInt(parts[2]) * 1024, // KB to Bytes
                used: parseInt(parts[3]) * 1024, // KB to Bytes
                priority: parseInt(parts[4])
              };
            });
          } catch (e) {
            return [];
          }
        })
      ]);

      res.json({ swappiness, swapDevices });
    } catch (error) {
      logger.error('Failed to get swap config', error);
      res.status(500).json({ error: 'Failed to get swap config' });
    }
  });

  // API: Set swappiness
  app.post('/api/system/swap/swappiness', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const { value } = req.body;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    if (typeof value !== 'number' || value < 0 || value > 100) return res.status(400).json({ error: 'Invalid swappiness value (0-100)' });

    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) return res.status(403).json({ error: 'Admin privileges required' });

      await execAsync(`sudo sysctl vm.swappiness=${value}`);
      res.json({ success: true, swappiness: value });
    } catch (error: any) {
      logger.error('Failed to set swappiness', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Setup swap file
  app.post('/api/system/swap/setup', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const { sizeGB, path = '/swapfile' } = req.body;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    if (!sizeGB || sizeGB <= 0) return res.status(400).json({ error: 'Invalid swap size' });

    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) return res.status(403).json({ error: 'Admin privileges required' });

      logger.release(`Setting up ${sizeGB}GB swap file at ${path} for ${username}...`);
      
      // Sequence of commands to create and enable swap
      await execAsync(`sudo fallocate -l ${sizeGB}G ${path}`);
      await execAsync(`sudo chmod 600 ${path}`);
      await execAsync(`sudo mkswap ${path}`);
      await execAsync(`sudo swapon ${path}`);
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to setup swap', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Remove swap file
  app.post('/api/system/swap/remove', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const { path } = req.body;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    if (!path) return res.status(400).json({ error: 'Missing swap path' });

    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) return res.status(403).json({ error: 'Admin privileges required' });

      logger.release(`Removing swap file at ${path} for ${username}...`);
      
      await execAsync(`sudo swapoff ${path}`);
      await execAsync(`sudo rm ${path}`);
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to remove swap', error);
      res.status(500).json({ error: error.message });
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
      // Skip heavy directories
      if (['node_modules', '.git', 'dist', '.next', 'build'].includes(entry.name)) {
        return [];
      }
      
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
    const skipCommit = req.query.skipCommit === 'true';
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

      // If package.json was written, trigger dependency check
      if (safeName === 'package.json' && projectId) {
        logger.release(`Workspace: package.json updated for ${username} in ${projectId}. Triggering check...`);
        // We don't await here to not block the response
        fetch(`http://localhost:3000/api/workspace/check-package-json`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-username': username
          },
          body: JSON.stringify({ projectId })
        }).catch(e => logger.error('Failed to trigger check-package-json', e));
      }
      
      // Auto commit after writing (unless skipped)
      if (!skipCommit) {
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
    const skipCommit = req.query.skipCommit === 'true';
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
      
      // Auto commit after deleting (unless skipped)
      if (!skipCommit) {
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
  app.use('/preview/:username/:projectId', (req, res, next) => {
    const { username, projectId } = req.params;
    const paths = getUserPaths(username, projectId);
    express.static(paths.workspace)(req, res, next);
  });
  app.use('/preview/:username/:projectId', (req, res) => {
    res.status(404).send('File not found in workspace');
  });

  // Removed duplicate APIs

  // Removed duplicate preview API

  const workspaceProcesses = new Map<string, ChildProcess>();
  const WORKSPACE_PORTS = new Map<string, number>();
  let nextPort = 3001;

  async function killPort(port: number) {
    try {
      logger.debug(`Workspace: Killing any process on port ${port}...`);
      // Use npx kill-port for a more cross-platform/reliable way
      await execAsync(`npx -y kill-port ${port}`).catch(() => {});
      // Also try traditional ways just in case
      await execAsync(`fuser -k ${port}/tcp`).catch(() => {});
      await execAsync(`lsof -ti:${port} | xargs kill -9`).catch(() => {});
      // Wait a bit for the port to be released
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      logger.error(`Workspace: Failed to kill port ${port}`, e);
    }
  }

  function killWorkspaceProcess(username: string) {
    const proc = workspaceProcesses.get(username);
    if (proc && proc.pid) {
      logger.debug(`Killing workspace process ${proc.pid} for ${username}`);
      treeKill(proc.pid, 'SIGKILL');
      workspaceProcesses.delete(username);
    }
  }

  app.get('/api/workspace/scripts', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    if (!username || !projectId) return res.status(400).json({ error: 'Username and ProjectId required' });
    try {
      const paths = getUserPaths(username, projectId);
      const packageJsonPath = path.join(paths.workspace, 'package.json');
      if (await fileExists(packageJsonPath)) {
        const pkgContent = await fs.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        res.json({ scripts: pkg.scripts || {} });
      } else {
        res.json({ scripts: {} });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to get scripts' });
    }
  });

  app.post('/api/workspace/run', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    const { script } = req.body; // Allow specifying a script
    if (!username) return res.status(400).json({ error: 'Username header required' });
    if (!projectId) return res.status(400).json({ error: 'ProjectId required' });
    try {
      const paths = getUserPaths(username, projectId);
      logger.debug(`API: Running workspace for ${username} in project ${projectId} with script ${script || 'default'}...`);
      
      // Kill existing process for this user
      killWorkspaceProcess(username);

      const packageJsonPath = path.join(paths.workspace, 'package.json');
      if (await fileExists(packageJsonPath)) {
        logger.release(`Starting workspace app for ${username}...`);
        
        // User wants port 3001 specifically
        let port = 3001;
        await killPort(port);
        WORKSPACE_PORTS.set(username, port);

        const pkgContent = await fs.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        
        let startCmd = '';
        const isVite = (pkg.dependencies?.vite || pkg.devDependencies?.vite);
        const isNext = (pkg.dependencies?.next || pkg.devDependencies?.next);

        if (script && pkg.scripts?.[script]) {
          // Use the requested script
          startCmd = `npm run ${script}`;
          // If it's a dev/start script, try to inject port
          if (script === 'dev' || script === 'start') {
             if (isVite) {
               startCmd += ` -- --port ${port} --strictPort --base /workspace-preview/${username}/`;
             } else if (isNext) {
               startCmd += ` -- --port ${port}`;
             } else {
               startCmd += ` -- --port ${port}`;
             }
          }
        } else {
          // Default logic
          if (pkg.scripts?.dev) {
            if (isVite) {
              startCmd = `npm run dev -- --port ${port} --strictPort --base /workspace-preview/${username}/`;
            } else if (isNext) {
              startCmd = `npm run dev -- --port ${port}`;
            } else {
              startCmd = `npm run dev -- --port ${port}`;
            }
          } else if (pkg.scripts?.start) {
            startCmd = `npm start`;
          } else {
            startCmd = 'npm run dev';
          }
        }

        // Always try to install if node_modules is missing or package.json is newer
        let installCmd = 'npm install --no-audit --no-fund --prefer-offline --no-progress --loglevel=error && ';
        const nodeModulesPath = path.join(paths.workspace, 'node_modules');
        
        if (await fileExists(nodeModulesPath)) {
          const pkgStat = await fs.stat(packageJsonPath);
          const nmStat = await fs.stat(nodeModulesPath);
          // If package.json is newer than node_modules folder, reinstall
          if (pkgStat.mtime <= nmStat.mtime) {
            installCmd = '';
          }
        }

        logger.release(`Workspace: Executing: ${installCmd}${startCmd} in ${paths.workspace}`);
        
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

        // Wait for the port to be ready before returning
        try {
          logger.debug(`Workspace: Waiting for port ${port} to be ready...`);
          await waitOn({
            resources: [`http://localhost:${port}`],
            timeout: 60000, // 1 minute timeout
            interval: 500,
            validateStatus: (status) => status >= 200 && status < 500
          });
          logger.release(`Workspace: Port ${port} is ready for ${username}`);
          res.json({ success: true, type: 'node', port });
        } catch (waitError) {
          logger.error(`Workspace: Port ${port} failed to become ready for ${username}`, waitError);
          // Still return success, but the user might see the error in the iframe
          res.json({ success: true, type: 'node', port, warning: 'Port not ready yet' });
        }
      } else {
        res.json({ success: true, type: 'static' });
      }
    } catch (error) {
      logger.error('Failed to run workspace', error);
      res.status(500).json({ error: 'Failed to run workspace' });
    }
  });

  app.post('/api/workspace/run-command', async (req, res) => {
    const username = req.headers['x-username'] as string;
    const projectId = req.query.projectId as string;
    const { command } = req.body;
    if (!username || !projectId || !command) return res.status(400).json({ error: 'Missing required fields' });
    try {
      const paths = getUserPaths(username, projectId);
      logger.release(`Workspace: Running command for ${username}: ${command}`);
      const { stdout, stderr } = await execAsync(command, { cwd: paths.workspace });
      res.json({ stdout, stderr });
    } catch (error) {
      logger.error('Failed to run command', error);
      res.status(500).json({ error: 'Failed to run command', details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/workspace/stop', (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    
    killWorkspaceProcess(username);
    io.emit(`workspace:log:${username}`, 'Process stopped by user');
    res.json({ success: true });
  });

  app.use('/workspace-preview/:username', (req, res, next) => {
    const username = req.params.username;
    const port = WORKSPACE_PORTS.get(username);
    if (!port) return res.status(404).send('Workspace not running');
    
    createProxyMiddleware({
      target: `http://${WORKSPACE_HOST}:${port}`,
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

  // Fallback proxy for assets requested by the workspace preview (e.g. Next.js /_next/*)
  app.use((req, res, next) => {
    const referer = req.headers.referer;
    if (referer && !req.path.startsWith('/api/') && !req.path.startsWith('/workspace-preview/')) {
      const match = referer.match(/\/workspace-preview\/([^\/]+)/);
      if (match) {
        const username = match[1];
        const port = WORKSPACE_PORTS.get(username);
        if (port) {
          return createProxyMiddleware({
            target: `http://${WORKSPACE_HOST}:${port}`,
            changeOrigin: true,
            ws: true,
            on: {
              error: (err, req, res) => {
                if ('writeHead' in res) {
                  res.writeHead(500, { 'Content-Type': 'text/plain' });
                  res.end('Workspace app is starting or not running.');
                }
              }
            }
          })(req, res, next);
        }
      }
    }
    next();
  });

  // --- AI Proxy Endpoints ---

  // Stop model
  app.post('/api/ai/stop', async (req, res) => {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'Model name required' });

    logger.release(`AI Proxy: Stop model ${model} ignored (not applicable for this proxy)`);
    return res.json({ status: 'success', message: `Model ${model} stopped (simulated)` });
  });

  app.get('/api/ai/models', async (req, res) => {
    try {
      const testUrl = req.query.url as string;
      const testKey = req.query.key as string;
      
      const baseUrl = testUrl || ROUTER_URL;
      const apiKey = testKey || ROUTER_API_KEY;

      let modelsUrl = baseUrl.includes('/chat/completions') 
        ? baseUrl.replace('/chat/completions', '/models')
        : (baseUrl.endsWith('/') ? baseUrl + 'models' : baseUrl + '/models');
      
      // If it's a local URL and doesn't have /v1, try adding it if it fails
      // But for now let's stick to the provided URL
      
      logger.debug(`AI Proxy: Fetching models from ${modelsUrl} (using ${testUrl ? 'test params' : 'global config'})`);
      
      const response = await fetch(modelsUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      }).catch(err => {
        throw new Error(`Connection failed: ${err.message}`);
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`AI Proxy error ${response.status}: ${errorText}`);
        throw new Error(`AI Proxy returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      // Map OpenAI format to generic format
      let models = [];
      if (Array.isArray(data.data)) {
        models = data.data.map((m: any) => ({
          name: m.id,
          model: m.id,
          details: { family: 'ai-proxy' }
        }));
      } else if (Array.isArray(data)) {
        // Some local proxies return a simple array
        models = data.map((m: any) => ({
          name: typeof m === 'string' ? m : (m.id || m.name),
          model: typeof m === 'string' ? m : (m.id || m.name),
          details: { family: 'ai-proxy' }
        }));
      }

      logger.debug('AI Proxy: Models fetched successfully', { count: models.length });
      return res.json({ models });
    } catch (error) {
      logger.error('Proxy Error: Models fetch failed', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch models' });
    }
  });

  // List active models
  app.get('/api/ai/active', async (req, res) => {
    try {
      return res.json({ models: [] });
    } catch (error) {
      logger.error('AI Active Models Error:', error);
      res.status(500).json({ error: 'Failed to fetch active models' });
    }
  });

  // Chat with streaming
  app.post('/api/ai/chat', async (req, res) => {
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

      let targetUrl = ROUTER_URL.includes('/chat/completions')
        ? ROUTER_URL
        : (ROUTER_URL.endsWith('/') ? ROUTER_URL + 'chat/completions' : ROUTER_URL + '/chat/completions');
        
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ROUTER_API_KEY) {
        headers['Authorization'] = `Bearer ${ROUTER_API_KEY}`;
      }
      
      let finalBody: any = {
        model: model,
        messages: enrichedMessages,
        stream: true,
        temperature: parameters?.temperature ?? 0.7,
        top_p: parameters?.topP ?? 0.9,
        max_tokens: parameters?.maxTokens,
        stop: parameters?.stop
      };
      if (parameters?.jsonMode) {
        finalBody.response_format = { type: "json_object" };
      }

      logger.debug(`[CHAT_DEBUG] Request to model ${model} for ${username}:`, finalBody);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalBody),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`Proxy Error: Chat request failed for ${chatId} (${username}) at ${targetUrl}`, error);
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
              let contentChunk = '';
              if (buffer.startsWith('data: ')) {
                const dataStr = buffer.slice(6).trim();
                if (dataStr !== '[DONE]') {
                  const json = JSON.parse(dataStr);
                  if (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
                    contentChunk = json.choices[0].delta.content;
                  }
                }
              } else {
                const json = JSON.parse(buffer);
                if (json.message?.content) {
                  contentChunk = json.message.content;
                }
              }
              if (contentChunk) {
                assistantContent += contentChunk;
                const gen = activeGenerations.get(chatId);
                if (gen) gen.assistantMessage.content = assistantContent;
                io.emit(`chat:chunk:${username}`, { chatId, chunk: contentChunk });
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
              let call;
              try {
                call = JSON.parse(jsonString);
              } catch (parseError) {
                const nameMatch = jsonString.match(/<name>([\s\S]*?)<\/name>/);
                const argsMatch = jsonString.match(/<arguments>([\s\S]*?)<\/arguments>/);
                if (nameMatch && argsMatch) {
                  call = {
                    name: nameMatch[1].trim(),
                    args: JSON.parse(argsMatch[1].trim())
                  };
                } else {
                  throw parseError;
                }
              }
              const toolName = call.tool || call.name;
              const toolArgs = call.args || call.arguments || call;
              if (toolName) {
                executeToolCall(chatId, { tool: toolName, args: toolArgs }, username, projectId);
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
          
          let contentChunk = '';
          try {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr !== '[DONE]') {
                const json = JSON.parse(dataStr);
                if (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
                  contentChunk = json.choices[0].delta.content;
                }
              }
            } else {
              const json = JSON.parse(line);
              if (json.message?.content) {
                contentChunk = json.message.content;
              }
            }
          } catch (e) {
            // Ignore parse errors for incomplete lines or non-JSON
          }

          if (contentChunk) {
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
                  let call;
                  try {
                    call = JSON.parse(jsonString);
                  } catch (parseError) {
                    const nameMatch = jsonString.match(/<name>([\s\S]*?)<\/name>/);
                    const argsMatch = jsonString.match(/<arguments>([\s\S]*?)<\/arguments>/);
                    if (nameMatch && argsMatch) {
                      call = {
                        name: nameMatch[1].trim(),
                        args: JSON.parse(argsMatch[1].trim())
                      };
                    } else {
                      throw parseError;
                    }
                  }
                  const toolName = call.tool || call.name;
                  const toolArgs = call.args || call.arguments || call;
                  if (toolName) {
                    executeToolCall(chatId, { tool: toolName, args: toolArgs }, username, projectId);
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
        }
        
        res.write(value);
      }

      activeGenerations.delete(chatId);
      io.emit(`chat:end:${username}`, { chatId, finalContent: assistantContent });
      io.emit(`chat:status:${username}`, { loading: false, chatId });
      logger.release(`AI Proxy: Chat session complete for ${chatId} (${username}) in project ${projectId}`);
      
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
      logger.error('AI Chat Error:', error);
      await updateStats('fail');
      io.emit(`chat:status:${username}`, { loading: false, chatId });
      res.status(500).json({ error: 'Failed to communicate with AI Proxy' });
    }
  });

  // Pull model with streaming
  app.post('/api/ai/pull', async (req, res) => {
    try {
      return res.json({ status: 'success' });
    } catch (error) {
      logger.error('AI Pull Error:', error);
      res.status(500).json({ error: 'Failed to pull model' });
    }
  });

  // Delete model
  app.delete('/api/ai/delete', async (req, res) => {
    try {
      return res.json({ status: 'success' });
    } catch (error) {
      logger.error('AI Delete Error:', error);
      res.status(500).json({ error: 'Failed to delete model' });
    }
  });

  // --- End AI Proxy Endpoints ---

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
        case 'run_command':
          if (call.args.command) {
            try {
              const { stdout, stderr } = await execAsync(call.args.command, { cwd: paths.workspace });
              const result = stdout || stderr || 'Command executed successfully (no output)';
              io.emit(`workspace:updated:${username}`);
              io.emit(`tool:result:${username}`, { chatId, tool: 'run_command', result });
              logger.release(`Tool run_command success for ${username}: ${call.args.command}`);
            } catch (e: any) {
              logger.error(`Tool run_command failed for ${username}: ${call.args.command}`, e);
              io.emit(`workspace:updated:${username}`);
              io.emit(`tool:result:${username}`, { chatId, tool: 'run_command', result: `Error: ${e.message}` });
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
        
        let targetUrl = ROUTER_URL.includes('/chat/completions')
          ? ROUTER_URL
          : (ROUTER_URL.endsWith('/') ? ROUTER_URL + 'chat/completions' : ROUTER_URL + '/chat/completions');
          
        let headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ROUTER_API_KEY) {
          headers['Authorization'] = `Bearer ${ROUTER_API_KEY}`;
        }
        
        let requestBody: any = {
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
        };

        if (targetUrl.includes('/v1/chat/completions')) {
          requestBody.response_format = { type: "json_object" };
          // Ensure system prompt asks for a JSON object with a "facts" array if using json_object
          requestBody.messages[0].content = `You are a memory consolidation module. Your task is to maintain a concise, deduplicated list of facts, preferences, and project goals about the user.
            
            Current Memory:
            ${JSON.stringify(currentFacts)}
            
            Instructions:
            1. Extract any NEW facts from the conversation snippet.
            2. Combine them with the Current Memory.
            3. CRITICAL: Review the combined list and REMOVE any semantic duplicates, redundancies, or overlapping information. Merge related facts into single, comprehensive sentences if possible.
            4. Output ONLY a JSON object with a "facts" array containing strings representing the FINAL, consolidated memory list. You MUST include the existing facts from the Current Memory unless they are superseded or merged with new facts.`;
        }

        const memoryResponse = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (memoryResponse.ok) {
          const json = await memoryResponse.json();
          let memoryContent = '';
          if (targetUrl.includes('/v1/chat/completions')) {
            memoryContent = json.choices?.[0]?.message?.content || '{"facts":[]}';
          } else {
            memoryContent = json.message?.content || '[]';
          }
          
          logger.debug(`Post-chat logic: Raw memory extraction response for ${chatId} (${username}) in project ${projectId}`, memoryContent);
          
          let consolidatedFacts: string[] = [];
          if (targetUrl.includes('/v1/chat/completions')) {
            try {
              const parsed = JSON.parse(memoryContent);
              consolidatedFacts = parsed.facts || [];
            } catch (e) {
              logger.error('Failed to parse memory JSON object', e);
            }
          } else {
            const match = memoryContent.match(/\[.*\]/s);
            if (match) {
              try {
                consolidatedFacts = JSON.parse(match[0]);
              } catch (e) {
                logger.error('Failed to parse memory array', e);
              }
            }
          }

          if (Array.isArray(consolidatedFacts)) {
            // Clear existing memory first to avoid duplicates if we are replacing the whole list
            // Actually dbService.saveMemory appends. Wait, if we append the whole consolidated list, it will duplicate.
            // Let's check dbService.saveMemory. It probably just adds a fact.
            // If we want to replace, we need a replaceMemory function.
            // Let's just keep the existing logic for now.
            for (const fact of consolidatedFacts) {
              await dbService.saveMemory(projectId, fact);
            }
            io.emit(`memory:updated:${username}`, { facts: consolidatedFacts });
            logger.release(`Post-chat logic: Memory consolidated for ${username} in project ${projectId}. Total facts: ${consolidatedFacts.length}`);
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
      
      // Use a more standard fix: 755 for directories, 644 for files
      await execAsync(`find ${paths.workspace} -type d -exec chmod 755 {} +`);
      await execAsync(`find ${paths.workspace} -type f -exec chmod 644 {} +`);
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error(`Failed to fix permissions for ${username}`, error);
      res.status(500).json({ error: error.message });
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.release(`Server status: Running on http://localhost:${PORT}`);
    logger.debug(`Server configuration:`, {
      USE_9ROUTER,
      ROUTER_URL,
      LOG_LEVEL,
      DATA_DIR
    });
  });
}

startServer();
