import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess, exec } from 'child_process';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { simpleGit, SimpleGit } from 'simple-git';
import si from 'systeminformation';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');
const SYSTEM_LOG_FILE = path.join(DATA_DIR, 'system.log');

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
    const logMsg = `[ERROR] ${new Date().toISOString()} - ${message}${error ? ' ' + JSON.stringify(error, null, 2) : ''}\n`;
    process.stderr.write(logMsg);
    try {
      fsSync.appendFileSync(SYSTEM_LOG_FILE, logMsg);
    } catch (e) {}
  }
};

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  try {
    await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  } catch {}
  
  // Initialize Git in workspace
  try {
    const git: SimpleGit = simpleGit(WORKSPACE_DIR);
    let isRepo = false;
    try {
      await fs.access(path.join(WORKSPACE_DIR, '.git'));
      isRepo = true;
    } catch {
      isRepo = false;
    }
    
    if (!isRepo) {
      await git.init();
      await git.addConfig('user.name', 'AI Studio');
      await git.addConfig('user.email', 'ai@studio.local');
    }
    
    // Check if there are any commits
    try {
      await git.log();
    } catch {
      // No commits yet, create an initial commit
      await fs.writeFile(path.join(WORKSPACE_DIR, '.gitkeep'), '');
      await git.add('.');
      await git.commit('Initial commit');
    }
  } catch (error) {
    logger.error('Failed to initialize git repository', error);
  }

  try {
    await fs.access(CHATS_FILE);
  } catch {
    await fs.writeFile(CHATS_FILE, JSON.stringify([], null, 2));
  }

  try {
    await fs.access(CONFIG_FILE);
  } catch {
    await fs.writeFile(CONFIG_FILE, JSON.stringify({ systemPrompt: '' }, null, 2));
  }

  try {
    await fs.access(MEMORY_FILE);
  } catch {
    await fs.writeFile(MEMORY_FILE, JSON.stringify({ facts: [] }, null, 2));
  }

  try {
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(USAGE_FILE, JSON.stringify({ claude: { used: 0, total: 1000000 } }, null, 2));
  }

  try {
    await fs.access(STATS_FILE);
  } catch {
    await fs.writeFile(STATS_FILE, JSON.stringify({ sent: 0, success: 0, fail: 0 }, null, 2));
  }
}

async function cleanupOldChats() {
  try {
    logger.release('Cleanup: Checking for chats older than 30 days');
    const data = await fs.readFile(CHATS_FILE, 'utf-8');
    const chats = JSON.parse(data);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const initialCount = chats.length;
    const filteredChats = chats.filter((chat: any) => {
      // Use the timestamp of the last message if available, otherwise createdAt
      const lastMessageTime = chat.messages?.length > 0 
        ? chat.messages[chat.messages.length - 1].timestamp 
        : chat.createdAt;
      
      return lastMessageTime > thirtyDaysAgo;
    });

    if (filteredChats.length < initialCount) {
      await fs.writeFile(CHATS_FILE, JSON.stringify(filteredChats, null, 2));
      logger.release(`Cleanup: Removed ${initialCount - filteredChats.length} old chats`);
    } else {
      logger.debug('Cleanup: No old chats to remove');
    }
  } catch (error) {
    logger.error('Cleanup Error: Failed to cleanup old chats', error);
  }
}

interface ActiveGeneration {
  chatId: string;
  model: string;
  userMessage: any;
  assistantMessage: any;
}
const activeGenerations = new Map<string, ActiveGeneration>();

async function startServer() {
  await ensureDataDir();
  logger.release('Starting server initialization...');
  await cleanupOldChats();
  
  // Run cleanup every 24 hours
  setInterval(cleanupOldChats, 24 * 60 * 60 * 1000);
  
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

  const git: SimpleGit = simpleGit(WORKSPACE_DIR);

  async function autoCommit(message: string) {
    try {
      await git.add('.');
      const status = await git.status();
      if (status.staged.length > 0 || status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0) {
        await git.commit(message);
        io.emit('workspace:history_updated');
      }
    } catch (error) {
      logger.error('Auto commit failed', error);
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

  // API: Get all chats
  app.get('/api/chats', async (req, res) => {
    try {
      logger.debug('API: Fetching all chats');
      const data = await fs.readFile(CHATS_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      logger.error('API Error: Failed to read chats', error);
      res.status(500).json({ error: 'Failed to read chats' });
    }
  });

  // API: Save all chats
  app.post('/api/chats', async (req, res) => {
    try {
      const chats = req.body;
      logger.debug(`API: Saving ${chats.length} chats`);
      await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2));
      io.emit('chats:updated', chats);
      res.json({ success: true });
    } catch (error) {
      logger.error('API Error: Failed to save chats', error);
      res.status(500).json({ error: 'Failed to save chats' });
    }
  });

  // API: Get config
  app.get('/api/config', async (req, res) => {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read config' });
    }
  });

  // API: Save config
  app.post('/api/config', async (req, res) => {
    try {
      const config = req.body;
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
      io.emit('config:updated', config);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // API: Get memory
  app.get('/api/memory', async (req, res) => {
    try {
      const data = await fs.readFile(MEMORY_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read memory' });
    }
  });

  // API: Save memory
  app.post('/api/memory', async (req, res) => {
    try {
      const memory = req.body;
      await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
      io.emit('memory:updated', memory);
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
    const { pid } = req.body;
    if (!pid) return res.status(400).json({ error: 'PID is required' });
    try {
      // Using sudo to allow non-root users (like thompson) to kill processes if configured in sudoers
      exec(`sudo kill -9 ${pid}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to kill process ${pid}`, error);
          return res.status(500).json({ error: error.message });
        }
        logger.release(`Killed process ${pid}`);
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
    const { service, action } = req.body; // action: start, stop, restart
    if (!service || !action) return res.status(400).json({ error: 'Service and action are required' });
    try {
      // Using sudo to allow non-root users (like thompson) to control services if configured in sudoers
      exec(`sudo systemctl ${action} ${service}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to ${action} service ${service}`, error);
          return res.status(500).json({ error: error.message });
        }
        logger.release(`Service ${service} ${action}ed`);
        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to control service' });
    }
  });

  // API: Terminal execute
  app.post('/api/system/terminal', async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Command is required' });
    try {
      logger.debug(`Terminal: Executing command: ${command}`);
      // Add common sbin paths to PATH so management commands are found
      const env = { 
        ...process.env, 
        PATH: `${process.env.PATH}:/usr/sbin:/sbin:/usr/local/sbin` 
      };
      
      exec(command, { env }, (error, stdout, stderr) => {
        res.json({
          stdout,
          stderr,
          error: error ? error.message : null
        });
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to execute command' });
    }
  });

  // API: Terminal completion
  app.post('/api/system/terminal/complete', async (req, res) => {
    const { command } = req.body;
    if (!command) return res.json({ suggestions: [] });
    
    try {
      // Basic completion using bash compgen
      // We look at the last word of the command
      const lastWord = command.split(' ').pop() || '';
      const cmd = `bash -c "compgen -f ${lastWord} && compgen -c ${lastWord}"`;
      
      exec(cmd, (error, stdout, stderr) => {
        const suggestions = Array.from(new Set(stdout.split('\n').filter(s => s.trim() !== ''))).slice(0, 10);
        res.json({ suggestions });
      });
    } catch (error) {
      res.json({ suggestions: [] });
    }
  });



  // Helper: Get all files recursively
  async function getAllFiles(dirPath: string, baseDir: string = WORKSPACE_DIR): Promise<any[]> {
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
    try {
      if (!fsSync.existsSync(WORKSPACE_DIR)) {
        await fs.mkdir(WORKSPACE_DIR, { recursive: true });
      }
      const stats = await getAllFiles(WORKSPACE_DIR);
      res.json(stats);
    } catch (error) {
      logger.error('Failed to list workspace', error);
      res.status(500).json({ error: 'Failed to list workspace' });
    }
  });

  // API: Read workspace file
  app.get('/api/workspace/read', async (req, res) => {
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const safeName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(WORKSPACE_DIR, safeName);
      const content = await fs.readFile(filePath, 'utf-8');
      res.json({ content });
    } catch (error) {
      logger.error('Failed to read file', error);
      res.status(500).json({ error: 'Failed to read file' });
    }
  });

  // API: Write workspace file
  app.post('/api/workspace/write', async (req, res) => {
    try {
      const { name, content } = req.body;
      if (!name) return res.status(400).json({ error: 'Missing filename' });
      const safeName = path.normalize(name).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(WORKSPACE_DIR, safeName);
      const dirPath = path.dirname(filePath);
      
      // Ensure directory exists
      await fs.mkdir(dirPath, { recursive: true });
      
      await fs.writeFile(filePath, content, 'utf-8');
      io.emit('workspace:updated');
      res.json({ success: true });
      
      // Auto commit after writing
      await autoCommit(`Update ${safeName}`);
    } catch (error) {
      logger.error('Failed to write file', error);
      res.status(500).json({ error: 'Failed to write file' });
    }
  });

  // API: Delete workspace file
  app.delete('/api/workspace/delete', async (req, res) => {
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const safeName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(WORKSPACE_DIR, safeName);
      await fs.rm(filePath, { recursive: true, force: true });
      io.emit('workspace:updated');
      res.json({ success: true });
      
      // Auto commit after deleting
      await autoCommit(`Delete ${safeName}`);
    } catch (error) {
      logger.error('Failed to delete file or folder', error);
      res.status(500).json({ error: 'Failed to delete file or folder' });
    }
  });

  // API: Get workspace history
  app.get('/api/workspace/history', async (req, res) => {
    try {
      const log = await git.log();
      res.json({ history: log.all });
    } catch (error: any) {
      // If git log fails, it's likely because there are no commits yet
      res.json({ history: [] });
    }
  });

  // API: Get commit details
  app.get('/api/workspace/commit-details', async (req, res) => {
    try {
      const hash = req.query.hash as string;
      if (!hash) return res.status(400).json({ error: 'Missing hash' });
      
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
        // Fallback for the first commit (no parent)
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
  app.use('/preview', express.static(WORKSPACE_DIR));
  app.use('/preview', (req, res) => {
    res.status(404).send('File not found in workspace');
  });

  let workspaceProcess: ChildProcess | null = null;
  const WORKSPACE_PORT = 3001;

  // Helper to check file existence asynchronously
  const fileExists = async (filePath: string) => !!(await fs.stat(filePath).catch(() => false));

  app.post('/api/workspace/run', async (req, res) => {
    try {
      if (workspaceProcess) {
        workspaceProcess.kill();
        workspaceProcess = null;
      }

      const packageJsonPath = path.join(WORKSPACE_DIR, 'package.json');
      if (await fileExists(packageJsonPath)) {
        logger.release('Starting workspace app...');
        
        const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        let startCmd = 'npm run dev';
        if (pkg.scripts?.dev) {
          startCmd = `npm run dev -- --port ${WORKSPACE_PORT}`;
        } else if (pkg.scripts?.start) {
          startCmd = `npm start`;
        }

        // Add --no-progress and --loglevel=error to prevent massive stdout flooding which freezes the UI
        let installCmd = 'npm install --no-audit --no-fund --prefer-offline --no-progress --loglevel=error && ';
        const nodeModulesPath = path.join(WORKSPACE_DIR, 'node_modules');
        
        if (await fileExists(nodeModulesPath)) {
          const pkgStat = await fs.stat(packageJsonPath);
          const nmStat = await fs.stat(nodeModulesPath);
          
          if (pkgStat.mtime <= nmStat.mtime) {
            // Skip install if node_modules is newer than package.json
            installCmd = '';
          }
        }

        // Run npm install then the start command
        workspaceProcess = spawn(`${installCmd}${startCmd}`, {
          cwd: WORKSPACE_DIR,
          shell: true,
          env: { ...process.env, PORT: WORKSPACE_PORT.toString(), VITE_PORT: WORKSPACE_PORT.toString() }
        });

        // Buffer logs to prevent WebSocket flooding (which freezes the frontend UI)
        let logBuffer = '';
        let logTimeout: NodeJS.Timeout | null = null;
        const emitLogs = () => {
          if (logBuffer) {
            io.emit('workspace:log', logBuffer);
            logBuffer = '';
          }
          logTimeout = null;
        };

        const queueLog = (data: string) => {
          logBuffer += data;
          if (!logTimeout) {
            logTimeout = setTimeout(emitLogs, 100); // Emit at most once per 100ms
          }
        };

        workspaceProcess.stdout?.on('data', (data) => {
          queueLog(data.toString());
        });

        workspaceProcess.stderr?.on('data', (data) => {
          queueLog(data.toString());
        });

        workspaceProcess.on('close', (code) => {
          emitLogs(); // flush remaining
          io.emit('workspace:log', `Process exited with code ${code}\n`);
          workspaceProcess = null;
        });

        res.json({ success: true, type: 'node', port: WORKSPACE_PORT });
      } else {
        res.json({ success: true, type: 'static' });
      }
    } catch (error) {
      logger.error('Failed to run workspace', error);
      res.status(500).json({ error: 'Failed to run workspace' });
    }
  });

  app.post('/api/workspace/stop', (req, res) => {
    if (workspaceProcess) {
      workspaceProcess.kill();
      workspaceProcess = null;
      io.emit('workspace:log', 'Process stopped by user');
    }
    res.json({ success: true });
  });

  app.post('/api/system/shutdown', (req, res) => {
    try {
      logger.release('Initiating system shutdown in 1 minute...');
      // Try with sudo first, fallback to without sudo. Include sbin paths.
      const cmd = 'PATH=$PATH:/sbin:/usr/sbin:/bin:/usr/bin sudo -n shutdown +1 || PATH=$PATH:/sbin:/usr/sbin:/bin:/usr/bin sudo -n systemctl poweroff || PATH=$PATH:/sbin:/usr/sbin:/bin:/usr/bin shutdown +1 || PATH=$PATH:/sbin:/usr/sbin:/bin:/usr/bin systemctl poweroff';
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          logger.error('Failed to execute shutdown command', { error, stdout, stderr });
          return res.status(500).json({ 
            error: 'Failed to initiate shutdown', 
            details: 'Linux security requires root privileges to shut down from a background service. Please run the service as root, or add NOPASSWD sudo rights for the shutdown command.' 
          });
        }
        res.json({ success: true, message: 'System will shut down in 1 minute' });
      });
    } catch (error) {
      logger.error('Failed to initiate shutdown', error);
      res.status(500).json({ error: 'Failed to initiate shutdown' });
    }
  });

  app.use('/workspace-preview', createProxyMiddleware({
    target: `http://localhost:${WORKSPACE_PORT}`,
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      '^/workspace-preview': '',
    },
    on: {
      error: (err, req, res) => {
        if ('writeHead' in res) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Workspace app is starting or not running.');
        }
      }
    }
  }));

  // --- Ollama Proxy Endpoints ---

  // List models
  app.get('/api/ollama/tags', async (req, res) => {
    try {
      logger.debug('Ollama Proxy: Fetching tags');
      const response = await fetch(`${OLLAMA_URL}/api/tags`);
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
    const { chatId, messages, model } = req.body;
    
    await updateStats('sent');

    logger.release(`Proxy: Starting chat session for ${chatId} using ${model}`);
    
    // Original Ollama logic
    try {
      const requestBody = {
        model,
        messages,
        stream: true,
      };
      logger.debug(`[CHAT_DEBUG] Request to model ${model}:`, requestBody);

      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`Ollama Proxy Error: Chat request failed for ${chatId}`, error);
        logger.debug(`[CHAT_DEBUG] Error response from model ${model}:`, error);
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
        model,
        userMessage,
        assistantMessage
      });

      // Emit start event via Socket.io
      io.emit('chat:start', {
        chatId,
        model,
        userMessage,
        assistantMessage
      });
      io.emit('chat:status', { loading: true, chatId });

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process any remaining buffer
          if (buffer.trim()) {
            try {
              const json = JSON.parse(buffer);
              if (json.message?.content) {
                assistantContent += json.message.content;
                const gen = activeGenerations.get(chatId);
                if (gen) gen.assistantMessage.content = assistantContent;
                io.emit('chat:chunk', { chatId, chunk: json.message.content });
              }
            } catch (e) {
              // Ignore final parse error
            }
          }
          
          // Check for any remaining tool calls at the very end
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
                executeToolCall(chatId, call);
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
                    executeToolCall(chatId, call);
                  }
                }
              }
            } catch (e) {
              // Not a valid JSON tool call, ignore
            }
            latestIndex = Math.max(latestIndex, lastProcessedToolCallIndex + match.index + match[0].length);
          }

          lastProcessedToolCallIndex = latestIndex;
          io.emit('chat:status', { loading: false, chatId });
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
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
              
              // Emit chunk via Socket.io
              io.emit('chat:chunk', { chatId, chunk: contentChunk });
              
              // Check for new complete tool calls
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
                    executeToolCall(chatId, call);
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
                        executeToolCall(chatId, call);
                      }
                    }
                  }
                } catch (e) {
                  // Not a valid JSON tool call, ignore
                }
                latestIndex = Math.max(latestIndex, lastProcessedToolCallIndex + match.index + match[0].length);
              }

              lastProcessedToolCallIndex = latestIndex;
            }
          } catch (e) {
            // Ignore parse errors for partial lines (should be rare now with buffering)
          }
        }
        
        res.write(value);
      }

      // Emit end event via Socket.io
      activeGenerations.delete(chatId);
      io.emit('chat:end', { chatId, finalContent: assistantContent });
      io.emit('chat:status', { loading: false, chatId });
      logger.release(`Ollama Proxy: Chat session complete for ${chatId}`);
      logger.debug(`[CHAT_DEBUG] Response from model ${model}:`, assistantContent);
      
      res.end();
      await updateStats('success');

      // --- Post-chat logic: Memory extraction ---
      extractMemory(chatId, model, messages);
      
    } catch (error) {
      activeGenerations.delete(chatId);
      logger.error('Ollama Chat Error:', error);
      await updateStats('fail');
      io.emit('chat:status', { loading: false, chatId });
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

  async function executeToolCall(chatId: string, call: any) {
    try {
      logger.debug(`Executing tool ${call.tool}`, call.args);
      switch (call.tool) {
        case 'list_files':
          try {
            const allFiles = await getAllFiles(WORKSPACE_DIR);
            io.emit('tool:result', { chatId, tool: 'list_files', result: allFiles.map(f => f.name) });
            logger.release(`Tool list_files success: ${allFiles.length} files`);
          } catch (e) {
            logger.error(`Tool list_files failed`, e);
            throw e;
          }
          break;
        case 'read_file':
          if (call.args.name) {
            const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
            const filePath = path.join(WORKSPACE_DIR, safeName);
            try {
              const fileContent = await fs.readFile(filePath, 'utf-8');
              io.emit('tool:result', { chatId, tool: 'read_file', result: fileContent });
              logger.release(`Tool read_file success: ${safeName}`);
            } catch (e) {
              logger.error(`Tool read_file failed: ${safeName}`, e);
              throw e;
            }
          }
          break;
        case 'write_file':
          if (call.args.name && call.args.content !== undefined) {
            const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
            const filePath = path.join(WORKSPACE_DIR, safeName);
            const dirPath = path.dirname(filePath);
            
            try {
              // Ensure directory exists
              await fs.mkdir(dirPath, { recursive: true });
              await fs.writeFile(filePath, call.args.content, 'utf-8');
              io.emit('workspace:updated');
              io.emit('tool:result', { chatId, tool: 'write_file', result: `Successfully wrote to ${safeName}` });
              logger.release(`Tool write_file success: ${safeName}`);
            } catch (e) {
              logger.error(`Tool write_file failed: ${safeName}`, e);
              throw e;
            }
          }
          break;
        case 'delete_file':
          if (call.args.name) {
            const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
            const filePath = path.join(WORKSPACE_DIR, safeName);
            try {
              await fs.unlink(filePath);
              io.emit('workspace:updated');
              io.emit('tool:result', { chatId, tool: 'delete_file', result: `Successfully deleted ${safeName}` });
              logger.release(`Tool delete_file success: ${safeName}`);
            } catch (e) {
              logger.error(`Tool delete_file failed: ${safeName}`, e);
              throw e;
            }
          }
          break;
      }
    } catch (error) {
      logger.error(`Tool execution failed (${call.tool}) for ${chatId}`, error);
    }
  }

  async function extractMemory(chatId: string, model: string, messages: any[]) {
    // Memory Extraction
    if (chatId !== 'memory-extraction') {
      try {
        logger.debug(`Post-chat logic: Starting memory extraction for ${chatId}`);
        const currentMemoryData = await fs.readFile(MEMORY_FILE, 'utf-8');
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
                3. CRITICAL: Review the combined list and REMOVE any semantic duplicates, redundancies, or overlapping information. Merge related facts into single, comprehensive sentences if possible (e.g., instead of "User wants a website" and "User wants to use Next.js", output "User wants to build a website using Next.js").
                4. Output ONLY a JSON array of strings representing the FINAL, consolidated memory list. You MUST include the existing facts from the Current Memory unless they are superseded or merged with new facts. Do not output markdown code blocks, just the JSON array.
                Example output: ["User prefers communicating in Vietnamese", "User is a software engineer building a Next.js medical website"]` 
              },
              { role: 'user', content: `Conversation snippet:\n${context}` }
            ],
            stream: false
          }),
        });

        if (memoryResponse.ok) {
          const json = await memoryResponse.json();
          const memoryContent = json.message?.content || '[]';
          logger.debug(`Post-chat logic: Raw memory extraction response for ${chatId}`, memoryContent);
          const match = memoryContent.match(/\[.*\]/s);
          if (match) {
            const consolidatedFacts = JSON.parse(match[0]);
            if (Array.isArray(consolidatedFacts)) {
              // Safety check: if it returns empty but we had memory, it might be a hallucination. 
              // But we will trust the LLM for now.
              const updatedMemory = { facts: consolidatedFacts };
              await fs.writeFile(MEMORY_FILE, JSON.stringify(updatedMemory, null, 2));
              io.emit('memory:updated', updatedMemory);
              logger.release(`Post-chat logic: Memory consolidated. Total facts: ${consolidatedFacts.length}`);
            }
          }
        } else {
          logger.error(`Post-chat logic Error: Memory extraction request failed for ${chatId}`);
        }
      } catch (error) {
        logger.error(`Post-chat logic Error: Memory extraction failed for ${chatId}`, error);
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.release(`Server status: Running on http://localhost:${PORT}`);
    logger.debug(`Server configuration:`, {
      OLLAMA_URL,
      LOG_LEVEL,
      DATA_DIR,
      WORKSPACE_DIR
    });
  });
}

startServer();
