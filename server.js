if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const CHATS_DIR = 'chats';

if (!fs.existsSync(CHATS_DIR)) {
  fs.mkdirSync(CHATS_DIR);
}

function getAllChats() {
  const files = fs.readdirSync(CHATS_DIR).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const data = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, file), 'utf8'));
    return {
      id: file.replace('.json', ''),
      title: data.title || 'New Chat',
      createdAt: data.createdAt,
      messageCount: data.messages.length,
      pinned: data.pinned || false
    };
  }).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function loadChat(chatId) {
  const file = path.join(CHATS_DIR, `${chatId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveChat(chatId, data) {
  fs.writeFileSync(path.join(CHATS_DIR, `${chatId}.json`), JSON.stringify(data, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

app.get('/chats', (req, res) => res.json(getAllChats()));

app.get('/chats/:id', (req, res) => {
  const chat = loadChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json(chat);
});

app.post('/chats/new', (req, res) => {
  const id = generateId();
  const chat = { id, title: 'New Chat', createdAt: new Date().toISOString(), messages: [], pinned: false };
  saveChat(id, chat);
  res.json({ id });
});

app.delete('/chats/:id', (req, res) => {
  const file = path.join(CHATS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

app.patch('/chats/:id/rename', (req, res) => {
  const { title } = req.body;
  const chat = loadChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  chat.title = title;
  saveChat(req.params.id, chat);
  res.json({ success: true });
});

app.patch('/chats/:id/pin', (req, res) => {
  const chat = loadChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  chat.pinned = !chat.pinned;
  saveChat(req.params.id, chat);
  res.json({ pinned: chat.pinned });
});

app.post('/chat', async (req, res) => {
  const { message, chatId } = req.body;
  let chat = loadChat(chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  chat.messages.push({ role: 'user', content: message });
  if (chat.messages.length === 1) {
    chat.title = message.length > 40 ? message.substring(0, 40) + '...' : message;
  }

  try {
    const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY
      },
      body: JSON.stringify({
        model: 'sarvam-105b',
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: `You are Astra, a personal AI companion built for Indian students and developers in India.

Your personality:
- Fun, witty, and conversational — like that one smart friend who explains things well without being boring
- Use emojis occasionally but not overdoing it 😄
- Light sarcasm and jokes when appropriate
- Encouraging when someone makes mistakes — never robotic or cold
- Talk like a real person, not a textbook or Wikipedia page
- Keep responses concise and to the point — no unnecessary padding
- When explaining code, be clear and simple — assume the user is learning
- Celebrate small wins with the user
- If someone seems frustrated, acknowledge it and help them through it

Rules:
- Never mention Sarvam, Anthropic, OpenAI, or any underlying AI company
- Never say you are ChatGPT, Claude, or any other AI
- You are simply Astra, nothing else
- Always respond in the same language the user writes in (Hindi, English, Hinglish — whatever they use)`
          },
          ...chat.messages
        ]
      })
    });

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning_content ||
      'Astra is thinking hard on this one, try asking again! 🤔';

    chat.messages.push({ role: 'assistant', content: reply });
    saveChat(chatId, chat);
    res.json({ reply, title: chat.title });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Astra is running on http://localhost:${PORT}`));