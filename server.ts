import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = '/tmp/ollama-data';
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  try {
    await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  } catch {}
  
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
}

async function startServer() {
  await ensureDataDir();
  
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Socket.io logic
  io.on('connection', (socket) => {
    console.log('Socket.io: Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Socket.io: Client disconnected:', socket.id);
    });
  });

  // API: Get all chats
  app.get('/api/chats', async (req, res) => {
    try {
      const data = await fs.readFile(CHATS_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read chats' });
    }
  });

  // API: Save all chats
  app.post('/api/chats', async (req, res) => {
    try {
      const chats = req.body;
      await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2));
      res.json({ success: true });
    } catch (error) {
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
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save memory' });
    }
  });

  // API: List workspace files
  app.get('/api/workspace', async (req, res) => {
    try {
      const files = await fs.readdir(WORKSPACE_DIR);
      const stats = await Promise.all(files.map(async f => {
        const s = await fs.stat(path.join(WORKSPACE_DIR, f));
        return { name: f, isDirectory: s.isDirectory(), size: s.size, mtime: s.mtime };
      }));
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to list workspace' });
    }
  });

  // API: Read workspace file
  app.get('/api/workspace/read', async (req, res) => {
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const filePath = path.join(WORKSPACE_DIR, fileName);
      const content = await fs.readFile(filePath, 'utf-8');
      res.json({ content });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read file' });
    }
  });

  // API: Write workspace file
  app.post('/api/workspace/write', async (req, res) => {
    try {
      const { name, content } = req.body;
      if (!name) return res.status(400).json({ error: 'Missing filename' });
      const filePath = path.join(WORKSPACE_DIR, name);
      await fs.writeFile(filePath, content, 'utf-8');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to write file' });
    }
  });

  // API: Delete workspace file
  app.delete('/api/workspace/delete', async (req, res) => {
    try {
      const fileName = req.query.name as string;
      if (!fileName) return res.status(400).json({ error: 'Missing filename' });
      const filePath = path.join(WORKSPACE_DIR, fileName);
      await fs.unlink(filePath);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  // --- Ollama Proxy Endpoints ---

  // List models
  app.get('/api/ollama/tags', async (req, res) => {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Ollama Tags Error:', error);
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
      console.error('Ollama PS Error:', error);
      res.status(500).json({ error: 'Failed to fetch running models from Ollama' });
    }
  });

  // Chat with streaming
  app.post('/api/ollama/chat', async (req, res) => {
    const { chatId, messages, model, systemPrompt, memoryFacts, toolInstructions } = req.body;
    
    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return res.status(response.status).send(error);
      }

      // Set headers for streaming
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      
      // Emit start event via Socket.io
      io.emit('chat:start', {
        chatId,
        model,
        userMessage: messages[messages.length - 1],
        assistantMessage: { role: 'assistant', content: '', timestamp: Date.now() }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkStr = new TextDecoder().decode(value);
        const lines = chunkStr.split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              const contentChunk = json.message.content;
              assistantContent += contentChunk;
              
              // Emit chunk via Socket.io
              io.emit('chat:chunk', { chatId, chunk: contentChunk });
            }
          } catch (e) {
            // Ignore parse errors for partial lines
          }
        }
        
        res.write(value);
      }

      // Emit end event via Socket.io
      io.emit('chat:end', { chatId, finalContent: assistantContent });
      
      res.end();
    } catch (error) {
      console.error('Ollama Chat Error:', error);
      res.status(500).json({ error: 'Failed to communicate with Ollama' });
    }
  });

  // Pull model with streaming
  app.post('/api/ollama/pull', async (req, res) => {
    const { name } = req.body;
    try {
      const response = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stream: true }),
      });

      if (!response.ok) {
        const error = await response.text();
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
      console.error('Ollama Pull Error:', error);
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
      console.error('Ollama Delete Error:', error);
      res.status(500).json({ error: 'Failed to delete model from Ollama' });
    }
  });

  // --- End Ollama Proxy Endpoints ---

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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
