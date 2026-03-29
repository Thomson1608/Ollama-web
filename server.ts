import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = '/tmp/ollama-data';
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
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
}

async function startServer() {
  await ensureDataDir();
  
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
