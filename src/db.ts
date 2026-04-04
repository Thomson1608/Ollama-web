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
  orderBy 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const dbService = {
  // User operations
  getUsers: async () => {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(doc => doc.data());
  },
  getUser: async (username: string) => {
    const q = query(collection(db, 'users'), where('username', '==', username));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  },
  createUser: async (username: string, role: string = 'user') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const userRef = doc(db, 'users', id);
    await setDoc(userRef, { id, username, role });
    
    const configRef = doc(db, 'users', id, 'configs', 'default');
    await setDoc(configRef, {
      userId: id,
      systemPrompt: `You are a helpful assistant for ${username}.`,
      parameters: { temperature: 0.7, topP: 0.9, topK: 40 }
    });
    return id;
  },
  updateUserRole: async (username: string, role: string) => {
    const user = await dbService.getUser(username) as any;
    if (user) {
      await updateDoc(doc(db, 'users', user.id), { role });
    }
  },

  // Config operations
  getConfig: async (username: string) => {
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
  },
  saveConfig: async (username: string, config: any) => {
    const user = await dbService.getUser(username) as any;
    if (!user) return;
    const configRef = doc(db, 'users', user.id, 'configs', 'default');
    await setDoc(configRef, {
      userId: user.id,
      systemPrompt: config.systemPrompt,
      parameters: config.parameters || {}
    }, { merge: true });
  },

  // Stats operations
  getStats: async () => {
    const snapshot = await getDocs(collection(db, 'stats'));
    const stats: any = { sent: 0, success: 0, fail: 0 };
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      stats[data.key] = data.value;
    });
    return stats;
  },
  updateStat: async (type: 'sent' | 'success' | 'fail') => {
    const statRef = doc(db, 'stats', type);
    const statSnap = await getDoc(statRef);
    if (statSnap.exists()) {
      await updateDoc(statRef, { value: statSnap.data().value + 1 });
    } else {
      await setDoc(statRef, { key: type, value: 1 });
    }
  },

  // Project operations
  getProjects: async (userId: string) => {
    const q = query(collection(db, 'projects'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  },
  getProject: async (id: string) => {
    const snap = await getDoc(doc(db, 'projects', id));
    return snap.exists() ? snap.data() : null;
  },
  updateProject: async (id: string, data: any) => {
    await updateDoc(doc(db, 'projects', id), data);
  },
  createProject: async (userId: string, name: string, details: string) => {
    const id = 'proj_' + Date.now().toString();
    await setDoc(doc(db, 'projects', id), {
      id, userId, name, details, createdAt: Date.now()
    });
    return id;
  },
  deleteProject: async (id: string) => {
    await deleteDoc(doc(db, 'projects', id));
  },

  // Chat operations
  getChats: async (projectId: string) => {
    const q = query(collection(db, 'projects', projectId, 'chats'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const chats = snapshot.docs.map(doc => doc.data());
    return await Promise.all(chats.map(async (chat: any) => ({
      ...chat,
      parameters: chat.parameters || {},
      messages: await dbService.getMessages(projectId, chat.id)
    })));
  },
  createChat: async (projectId: string, chat: any) => {
    await setDoc(doc(db, 'projects', projectId, 'chats', chat.id), {
      id: chat.id,
      projectId,
      title: chat.title,
      model: chat.model,
      systemPrompt: chat.systemPrompt || '',
      parameters: chat.parameters || {},
      createdAt: chat.createdAt || Date.now()
    });
  },
  updateChatTitle: async (projectId: string, id: string, title: string) => {
    await updateDoc(doc(db, 'projects', projectId, 'chats', id), { title });
  },
  deleteChat: async (projectId: string, id: string) => {
    await deleteDoc(doc(db, 'projects', projectId, 'chats', id));
  },

  // Message operations
  getMessages: async (projectId: string, chatId: string) => {
    const q = query(collection(db, 'projects', projectId, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  },
  addMessage: async (projectId: string, chatId: string, msg: any) => {
    const id = 'msg_' + Date.now().toString() + Math.random().toString(36).substring(2, 5);
    await setDoc(doc(db, 'projects', projectId, 'chats', chatId, 'messages', id), {
      id,
      chatId,
      role: msg.role,
      content: msg.content,
      images: msg.images || [],
      timestamp: msg.timestamp || Date.now()
    });
  },

  // Memory operations
  getMemory: async (projectId: string) => {
    const q = query(collection(db, 'projects', projectId, 'memories'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().content);
  },
  saveMemory: async (projectId: string, content: string) => {
    const id = 'mem_' + Date.now().toString();
    await setDoc(doc(db, 'projects', projectId, 'memories', id), {
      id, projectId, content, timestamp: Date.now()
    });
  }
};
