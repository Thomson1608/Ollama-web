import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');
const DEBUG_LOG_FILE = path.join(DATA_DIR, 'debug.log');
const RELEASE_LOG_FILE = path.join(DATA_DIR, 'release.log');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug'; // 'debug' or 'release'

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

const logger = {
  debug: (message: string, data?: any) => {
    if (LOG_LEVEL === 'debug') {
      const logMsg = `[DEBUG] ${new Date().toISOString()} - ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
      process.stdout.write(logMsg);
      try {
        fsSync.appendFileSync(DEBUG_LOG_FILE, logMsg);
      } catch (e) {}
    }
  },
  release: (message: string, data?: any) => {
    const logMsg = `[RELEASE] ${new Date().toISOString()} - ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
    process.stdout.write(logMsg);
    try {
      if (LOG_LEVEL === 'release') {
        fsSync.appendFileSync(RELEASE_LOG_FILE, logMsg);
      } else if (LOG_LEVEL === 'debug') {
        fsSync.appendFileSync(DEBUG_LOG_FILE, logMsg);
      }
    } catch (e) {}
  },
  error: (message: string, error?: any) => {
    const logMsg = `[ERROR] ${new Date().toISOString()} - ${message}${error ? ' ' + JSON.stringify(error, null, 2) : ''}\n`;
    process.stderr.write(logMsg);
    try {
      const targetFile = LOG_LEVEL === 'release' ? RELEASE_LOG_FILE : DEBUG_LOG_FILE;
      fsSync.appendFileSync(targetFile, logMsg);
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

async function startServer() {
  await ensureDataDir();
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

  app.use(express.json({ limit: '50mb' }));

  // Socket.io logic
  io.on('connection', (socket) => {
    logger.release(`Socket.io: Client connected: ${socket.id}`);
    logger.debug(`Socket.io: Connection details for ${socket.id}`, {
      handshake: socket.handshake,
      address: socket.handshake.address
    });

    socket.on('disconnect', (reason) => {
      logger.release(`Socket.io: Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

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

  // API: Get usage
  app.get('/api/usage', async (req, res) => {
    try {
      const data = await fs.readFile(USAGE_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read usage' });
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
      await fs.unlink(filePath);
      io.emit('workspace:updated');
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete file', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

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
    
    const isClaude = model.startsWith('claude-');

    logger.release(`Proxy: Starting chat session for ${chatId} using ${model} (Type: ${isClaude ? 'Claude' : 'Ollama'})`);
    
    if (isClaude) {
      if (!ANTHROPIC_API_KEY) {
        return res.status(400).json({ error: 'Anthropic API Key is not configured. Please add it to your environment variables.' });
      }

      try {
        const stream = await anthropic.messages.create({
          model: model,
          max_tokens: 4096,
          messages: messages.filter((m: any) => m.role !== 'system').map((m: any) => ({ role: m.role, content: m.content })),
          system: messages.find((m: any) => m.role === 'system')?.content || '',
          stream: true,
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let assistantContent = '';
        
        io.emit('chat:start', {
          chatId,
          model,
          userMessage: messages[messages.length - 1],
          assistantMessage: { role: 'assistant', content: '', timestamp: Date.now() }
        });

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text;
            assistantContent += text;
            io.emit('chat:chunk', { chatId, chunk: text });
            res.write(`data: ${JSON.stringify({ message: { content: text } })}\n\n`);
          } else if (chunk.type === 'message_delta' && chunk.usage) {
            // Update usage
            try {
              const usageData = JSON.parse(await fs.readFile(USAGE_FILE, 'utf-8'));
              usageData.claude.used += (chunk.usage.output_tokens || 0);
              await fs.writeFile(USAGE_FILE, JSON.stringify(usageData, null, 2));
              io.emit('usage:updated', usageData);
            } catch (e) {}
          } else if (chunk.type === 'message_start' && chunk.message.usage) {
            // Initial usage
            try {
              const usageData = JSON.parse(await fs.readFile(USAGE_FILE, 'utf-8'));
              usageData.claude.used += (chunk.message.usage.input_tokens || 0);
              await fs.writeFile(USAGE_FILE, JSON.stringify(usageData, null, 2));
              io.emit('usage:updated', usageData);
            } catch (e) {}
          }
        }

        io.emit('chat:end', { chatId, finalContent: assistantContent });
        res.end();
        processPostChatLogic(chatId, assistantContent, model, messages);
        return;
      } catch (error) {
        logger.error('Claude Chat Error:', error);
        return res.status(500).json({ error: 'Failed to communicate with Claude' });
      }
    }

    // Original Ollama logic
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
        logger.error(`Ollama Proxy Error: Chat request failed for ${chatId}`, error);
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
      logger.release(`Ollama Proxy: Chat session complete for ${chatId}`);
      logger.debug(`Ollama Proxy: Final assistant content for ${chatId}`, { length: assistantContent.length });
      
      res.end();

      // --- Post-chat logic: Tool calls and Memory extraction ---
      processPostChatLogic(chatId, assistantContent, model, messages);
      
    } catch (error) {
      logger.error('Ollama Chat Error:', error);
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

  async function processPostChatLogic(chatId: string, content: string, model: string, messages: any[]) {
    logger.debug(`Post-chat logic: Processing tools and memory for chat: ${chatId}`);
    logger.debug(`Post-chat logic: Content length: ${content.length}`);
    
    // 1. Tool Calls
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;
    const toolCalls = [];

    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        const call = JSON.parse(match[1]);
        toolCalls.push(call);
      } catch (e) {
        logger.error(`Post-chat logic Error: Failed to parse tool call in ${chatId}`, e);
      }
    }

    if (toolCalls.length > 0) {
      logger.release(`Post-chat logic: Executing ${toolCalls.length} tool calls for ${chatId}`);
      for (const call of toolCalls) {
        try {
          logger.debug(`Post-chat logic: Executing tool ${call.tool}`, call.args);
          switch (call.tool) {
            case 'list_files':
              const allFiles = await getAllFiles(WORKSPACE_DIR);
              io.emit('tool:result', { chatId, tool: 'list_files', result: allFiles.map(f => f.name) });
              logger.debug(`Post-chat logic: Tool list_files success: ${allFiles.length} files`);
              break;
            case 'read_file':
              if (call.args.name) {
                const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
                const filePath = path.join(WORKSPACE_DIR, safeName);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                io.emit('tool:result', { chatId, tool: 'read_file', result: fileContent });
                logger.debug(`Post-chat logic: Tool read_file success: ${safeName}`);
              }
              break;
            case 'write_file':
              if (call.args.name && call.args.content !== undefined) {
                const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
                const filePath = path.join(WORKSPACE_DIR, safeName);
                const dirPath = path.dirname(filePath);
                
                // Ensure directory exists
                await fs.mkdir(dirPath, { recursive: true });
                
                await fs.writeFile(filePath, call.args.content, 'utf-8');
                io.emit('workspace:updated');
                io.emit('tool:result', { chatId, tool: 'write_file', result: `Successfully wrote to ${safeName}` });
                logger.debug(`Post-chat logic: Tool write_file success: ${safeName}`);
              }
              break;
            case 'delete_file':
              if (call.args.name) {
                const safeName = path.normalize(call.args.name).replace(/^(\.\.[\/\\])+/, '');
                const filePath = path.join(WORKSPACE_DIR, safeName);
                await fs.unlink(filePath);
                io.emit('workspace:updated');
                io.emit('tool:result', { chatId, tool: 'delete_file', result: `Successfully deleted ${safeName}` });
                logger.debug(`Post-chat logic: Tool delete_file success: ${safeName}`);
              }
              break;
          }
        } catch (error) {
          logger.error(`Post-chat logic Error: Tool execution failed (${call.tool}) for ${chatId}`, error);
        }
      }
    }

    // 2. Memory Extraction
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
                content: `You are a memory extraction module. Your task is to extract personal facts, preferences, or important information about the user from the conversation. 
                CRITICAL: Also extract the user's preferred language and communication style (e.g., "User prefers communicating in Vietnamese", "User likes technical explanations").
                
                Current Memory: ${currentMemory.facts.join(', ')}
                
                Output ONLY a JSON array of strings representing NEW facts found in this snippet. 
                If no new facts are found, output []. 
                Do NOT repeat facts already in memory.
                Example output: ["User prefers communicating in Vietnamese", "User is a software engineer"]` 
              },
              { role: 'user', content: `Extract facts from this conversation:\n${context}` }
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
            const newFacts = JSON.parse(match[0]);
            if (Array.isArray(newFacts) && newFacts.length > 0) {
              const updatedMemory = { facts: [...new Set([...currentMemory.facts, ...newFacts])] };
              await fs.writeFile(MEMORY_FILE, JSON.stringify(updatedMemory, null, 2));
              io.emit('memory:updated', updatedMemory);
              logger.release(`Post-chat logic: Memory updated with ${newFacts.length} new facts from ${chatId}`);
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
