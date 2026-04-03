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


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

const DATA_DIR = path.join(__dirname, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const SYSTEM_LOG_FILE = path.join(DATA_DIR, 'system.log');
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');

// Helper to get user-specific paths
function getUserPaths(username: string) {
  const userDir = path.join(USERS_DIR, username);
  return {
    dir: userDir,
    chats: path.join(userDir, 'chats.json'),
    config: path.join(userDir, 'config.json'),
    memory: path.join(userDir, 'memory.json'),
    workspace: path.join(userDir, 'workspace'),
    profile: path.join(userDir, 'profile.json')
  };
}

async function isAdmin(username: string) {
  if (username === 'admin') return true;
  try {
    const paths = getUserPaths(username);
    const profileData = await fs.readFile(paths.profile, 'utf-8');
    return JSON.parse(profileData).role === 'admin';
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
    await fs.mkdir(paths.workspace, { recursive: true });

    // Initialize files if they don't exist
    const files = [
      { path: paths.chats, default: [] },
      { path: paths.config, default: { 
        systemPrompt: `You are a helpful assistant for ${username}.`,
        parameters: { temperature: 0.7, topP: 0.9, topK: 40 }
      } },
      { path: paths.memory, default: { profile: `User: ${username}`, facts: [] } },
      { path: paths.profile, default: { role: username === 'admin' ? 'admin' : 'user' } }
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
      }
    }

    // Initialize Git in user workspace
    const git = simpleGit(paths.workspace);
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        await git.init();
        await git.addConfig('user.name', username);
        await git.addConfig('user.email', `${username}@family.local`);
        await fs.writeFile(path.join(paths.workspace, '.gitkeep'), '');
        await git.add('.');
        await git.commit('Initial commit');
      }
    } catch (e) {
      logger.error(`Git init failed for ${username}`, e);
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

  try {
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(USAGE_FILE, JSON.stringify({ used: 0, total: 1000000 }, null, 2));
  }

  try {
    await fs.access(STATS_FILE);
  } catch {
    await fs.writeFile(STATS_FILE, JSON.stringify({ sent: 0, success: 0, fail: 0 }, null, 2));
  }
}

async function cleanupOldChats(username: string) {
  try {
    const paths = getUserPaths(username);
    logger.release(`Cleanup: Checking for chats older than 30 days for ${username}`);
    const data = await fs.readFile(paths.chats, 'utf-8');
    const chats = JSON.parse(data);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const initialCount = chats.length;
    const filteredChats = chats.filter((chat: any) => {
      const lastMessageTime = chat.messages?.length > 0 
        ? chat.messages[chat.messages.length - 1].timestamp 
        : chat.createdAt;
      
      return lastMessageTime > thirtyDaysAgo;
    });

    if (filteredChats.length < initialCount) {
      await fs.writeFile(paths.chats, JSON.stringify(filteredChats, null, 2));
      logger.release(`Cleanup: Removed ${initialCount - filteredChats.length} old chats for ${username}`);
    } else {
      logger.debug(`Cleanup: No old chats to remove for ${username}`);
    }
  } catch (error) {
    logger.error(`Cleanup Error: Failed to cleanup old chats for ${username}`, error);
  }
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
  logger.release('Starting server initialization...');
  
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

  async function autoCommit(username: string, message: string) {
    try {
      const paths = getUserPaths(username);
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
      const data = await fs.readFile(STATS_FILE, 'utf-8');
      const stats = JSON.parse(data);
      stats[type]++;
      await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (error) {
      logger.error('Failed to update stats', error);
    }
  }

  // API: Get all users
  app.get('/api/users', async (req, res) => {
    try {
      const users = await fs.readdir(USERS_DIR);
      const usersWithRoles = await Promise.all(users.map(async (username) => {
        const paths = getUserPaths(username);
        let role = 'user';
        try {
          const profileData = await fs.readFile(paths.profile, 'utf-8');
          role = JSON.parse(profileData).role || 'user';
        } catch (e) {
          // Ignore if profile doesn't exist yet
        }
        return { username, role };
      }));
      res.json(usersWithRoles);
    } catch (error) {
      res.status(500).json({ error: 'Failed to list users' });
    }
  });

  // API: Create/Login user
  app.post('/api/users', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });
    try {
      await ensureUserDir(username);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // API: Get all chats
  app.get('/api/chats', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      let chats: Chat[] = [];
      try {
        const data = await fs.readFile(paths.chats, 'utf-8');
        chats = JSON.parse(data);
      } catch (e) {
        chats = [];
      }

      // Merge active generations that haven't been saved yet or are currently generating
      const active = Array.from(activeGenerations.values()).filter(g => g.username === username);
      for (const gen of active) {
        const chatIndex = chats.findIndex(c => c.id === gen.chatId);
        if (chatIndex !== -1) {
          // If chat exists, update the last message if it's an assistant message from this generation
          const chat = chats[chatIndex];
          const lastMsg = chat.messages[chat.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.timestamp === gen.assistantMessage.timestamp) {
            lastMsg.content = gen.assistantMessage.content;
          } else {
            // If the assistant message isn't there yet, add it
            chat.messages.push({ ...gen.assistantMessage });
          }
        } else {
          // If it's a new chat, unshift it
          chats.unshift({
            id: gen.chatId,
            title: gen.userMessage.content.slice(0, 30) + (gen.userMessage.content.length > 30 ? '...' : ''),
            messages: [gen.userMessage, { ...gen.assistantMessage }],
            model: gen.model,
            createdAt: Date.now()
          });
        }
      }

      res.json({
        chats,
        generatingChatIds: active.map(g => g.chatId)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read chats' });
    }
  });

  // API: Save all chats
  app.post('/api/chats', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      const chats = req.body;
      await fs.writeFile(paths.chats, JSON.stringify(chats, null, 2));
      io.emit(`chats:updated:${username}`, chats);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save chats' });
    }
  });

  // API: Get config
  app.get('/api/config', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const isUserAdmin = await isAdmin(username);
      const paths = getUserPaths(username);
      const configFile = isUserAdmin ? ADMIN_CONFIG_FILE : paths.config;
      
      let data;
      try {
        data = await fs.readFile(configFile, 'utf-8');
      } catch (e) {
        // If config doesn't exist, return default config
        data = JSON.stringify({
          systemPrompt: "You are a helpful assistant.",
          parameters: { temperature: 0.7, topP: 0.9, topK: 40, maxTokens: null, stop: [], jsonMode: false }
        });
      }
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read config' });
    }
  });

  // API: Save config
  app.post('/api/config', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const isUserAdmin = await isAdmin(username);
      if (isUserAdmin) {
        return res.status(403).json({ error: 'Admin config cannot be modified' });
      }
      const paths = getUserPaths(username);
      const config = req.body;
      await fs.writeFile(paths.config, JSON.stringify(config, null, 2));
      io.emit(`config:updated:${username}`, config);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // API: Get memory
  app.get('/api/memory', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      const data = await fs.readFile(paths.memory, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read memory' });
    }
  });

  // API: Save memory
  app.post('/api/memory', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      const memory = req.body;
      await fs.writeFile(paths.memory, JSON.stringify(memory, null, 2));
      io.emit(`memory:updated:${username}`, memory);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save memory' });
    }
  });

  // API: Get stats
  app.get('/api/stats', async (req, res) => {
    try {
      const data = await fs.readFile(STATS_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read stats' });
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
      res.status(500).json({ error: 'Failed to read logs' });
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
      res.status(500).json({ error: 'Failed to read error logs' });
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
      res.status(500).json({ error: 'Failed to read chat debug logs' });
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

  // API: Terminal execute
  app.post('/api/system/terminal', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    
    try {
      const isUserAdmin = await isAdmin(username);
      if (!isUserAdmin) {
        logger.error(`Unauthorized terminal access attempt by ${username}`);
        return res.status(403).json({ error: 'Access denied. Only administrators can use the terminal.' });
      }

      const { command } = req.body;
      if (!command) return res.status(400).json({ error: 'Command is required' });
      
      logger.release(`Terminal: Executing command for ${username}: ${command}`);
      // Add common sbin and bin paths to PATH so management commands are found
      const env = { 
        ...process.env, 
        PATH: `${process.env.PATH || ''}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` 
      };
      
      exec(command, { env }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Terminal Command Failed: ${command}`, error);
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
      logger.error('Terminal Execution Error:', error);
      res.status(500).json({ error: 'Failed to execute command' });
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
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
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
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const paths = getUserPaths(username);
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
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const { name, content } = req.body;
      if (!name) return res.status(400).json({ error: 'Missing filename' });
      const paths = getUserPaths(username);
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

  // API: Get workspace history
  app.get('/api/workspace/history', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      const git = simpleGit(paths.workspace);
      const log = await git.log();
      res.json({ history: log.all });
    } catch (error: any) {
      res.json({ history: [] });
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
  app.use('/preview/:username', (req, res) => {
    res.status(404).send('File not found in workspace');
  });

  const workspaceProcesses = new Map<string, ChildProcess>();
  const WORKSPACE_PORTS = new Map<string, number>();
  let nextPort = 3001;

  // API: Write workspace file
  app.post('/api/workspace/write', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const { name, content } = req.body;
      if (!name) return res.status(400).json({ error: 'Missing filename' });
      const paths = getUserPaths(username);
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

  // API: Get workspace history
  app.get('/api/workspace/history', async (req, res) => {
    const username = req.headers['x-username'] as string;
    if (!username) return res.status(400).json({ error: 'Username header required' });
    try {
      const paths = getUserPaths(username);
      const git = simpleGit(paths.workspace);
      const log = await git.log();
      res.json({ history: log.all });
    } catch (error: any) {
      res.json({ history: [] });
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

    const { chatId, messages, model, parameters } = req.body;
    
    await updateStats('sent');

    logger.release(`Proxy: Starting chat session for ${chatId} (${username}) using ${model}`);
    
    try {
      const paths = getUserPaths(username);
      
      // Save user message to file system immediately
      try {
        let chats: Chat[] = [];
        try {
          const data = await fs.readFile(paths.chats, 'utf-8');
          chats = JSON.parse(data);
        } catch (e) {}
        
        const userMsg = messages[messages.length - 1];
        const chatIndex = chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          chats[chatIndex].messages.push(userMsg);
          await fs.writeFile(paths.chats, JSON.stringify(chats, null, 2));
          io.emit(`chats:updated:${username}`, chats);
        } else {
          const newChat: Chat = {
            id: chatId,
            title: userMsg.content ? (userMsg.content.slice(0, 30) + (userMsg.content.length > 30 ? '...' : '')) : 'Image Chat',
            messages: [userMsg],
            model: model,
            createdAt: Date.now()
          };
          chats.unshift(newChat);
          await fs.writeFile(paths.chats, JSON.stringify(chats, null, 2));
          io.emit(`chats:updated:${username}`, chats);
        }
      } catch (e) {
        logger.error(`Failed to pre-save user message for chat ${chatId}`, e);
      }

      const configData = await fs.readFile(paths.config, 'utf-8');
      const config = JSON.parse(configData);
      const memoryData = await fs.readFile(paths.memory, 'utf-8');
      const memory = JSON.parse(memoryData);

      // Inject memory into system prompt
      const systemPrompt = config.systemPrompt || '';
      const memoryContext = memory.facts.length > 0 
        ? `\n\nUser Context (Long-term Memory):\n${memory.facts.map((f: string) => `- ${f}`).join('\n')}`
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
                executeToolCall(chatId, call, username);
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
                  }, username);
                }
                continue;
              }
              
              for (const call of calls) {
                if (call && call.tool && call.args && ['list_files', 'read_file', 'write_file', 'delete_file'].includes(call.tool)) {
                  const isInsideXml = newContent.substring(0, match.index).lastIndexOf('<tool_call>') > newContent.substring(0, match.index).lastIndexOf('</tool_call>');
                  if (!isInsideXml) {
                    executeToolCall(chatId, call, username);
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
                    executeToolCall(chatId, call, username);
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
                        executeToolCall(chatId, call, username);
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
      logger.release(`Ollama Proxy: Chat session complete for ${chatId} (${username})`);
      
      // Save chat to file system automatically on end
      try {
        const paths = getUserPaths(username);
        let chats: Chat[] = [];
        try {
          const data = await fs.readFile(paths.chats, 'utf-8');
          chats = JSON.parse(data);
        } catch (e) {}
        
        const chatIndex = chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          chats[chatIndex].messages.push({ role: 'assistant', content: assistantContent, timestamp: Date.now() });
          await fs.writeFile(paths.chats, JSON.stringify(chats, null, 2));
          io.emit(`chats:updated:${username}`, chats);
        } else {
          // If it's a new chat that wasn't saved yet
          const newChat: Chat = {
            id: chatId,
            title: userMessage.content.slice(0, 30) + (userMessage.content.length > 30 ? '...' : ''),
            messages: [userMessage, { role: 'assistant', content: assistantContent, timestamp: Date.now() }],
            model: model,
            createdAt: Date.now()
          };
          chats.unshift(newChat);
          await fs.writeFile(paths.chats, JSON.stringify(chats, null, 2));
          io.emit(`chats:updated:${username}`, chats);
        }
      } catch (e) {
        logger.error(`Failed to auto-save chat ${chatId} for ${username}`, e);
      }
      
      res.end();
      await updateStats('success');

      extractMemory(chatId, model, messages, username);
      
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

  async function executeToolCall(chatId: string, call: any, username: string) {
    try {
      const paths = getUserPaths(username);
      
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

  async function extractMemory(chatId: string, model: string, messages: any[], username: string) {
    // Memory Extraction
    if (chatId !== 'memory-extraction') {
      try {
        const paths = getUserPaths(username);
        logger.debug(`Post-chat logic: Starting memory extraction for ${chatId} (${username})`);
        const currentMemoryData = await fs.readFile(paths.memory, 'utf-8');
        const currentMemory = JSON.parse(currentMemoryData);
        
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
                ${JSON.stringify(currentMemory.facts)}
                
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
          logger.debug(`Post-chat logic: Raw memory extraction response for ${chatId} (${username})`, memoryContent);
          const match = memoryContent.match(/\[.*\]/s);
          if (match) {
            const consolidatedFacts = JSON.parse(match[0]);
            if (Array.isArray(consolidatedFacts)) {
              const updatedMemory = { facts: consolidatedFacts };
              await fs.writeFile(paths.memory, JSON.stringify(updatedMemory, null, 2));
              io.emit(`memory:updated:${username}`, updatedMemory);
              logger.release(`Post-chat logic: Memory consolidated for ${username}. Total facts: ${consolidatedFacts.length}`);
            }
          }
        } else {
          logger.error(`Post-chat logic Error: Memory extraction request failed for ${chatId} (${username})`);
        }
      } catch (error) {
        logger.error(`Post-chat logic Error: Memory extraction failed for ${chatId} (${username})`, error);
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
