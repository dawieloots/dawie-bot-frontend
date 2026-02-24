
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  Settings as SettingsIcon, 
  Plus, 
  MessageSquare, 
  Bot, 
  User, 
  RefreshCcw, 
  AlertCircle,
  ExternalLink,
  Cpu,
  MoreVertical,
  Trash2,
  WifiOff,
  Copy,
  Check,
  LogOut,
  Lock
} from 'lucide-react';
import { SenderType, Message, ChatSession, N8nConfig } from './types.ts';
import { N8nService } from './services/n8nService.ts';
import { geminiService } from './services/geminiService.ts';

const LOCAL_STORAGE_KEY = 'n8n_chat_config';
const CHAT_HISTORY_KEY = 'n8n_chat_history';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture: string;
}

const App: React.FC = () => {
  // State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<N8nConfig>({ 
    webhookUrl: 'https://goodliest-refly-brian.ngrok-free.dev/web' 
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialization
  useEffect(() => {
    checkAuth();
    // Load config
    const savedConfig = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }

    // Load sessions
    const savedSessions = localStorage.getItem(CHAT_HISTORY_KEY);
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions);
      setSessions(parsed);
      if (parsed.length > 0) {
        setActiveSessionId(parsed[0].id);
      } else {
        createNewSession();
      }
    } else {
      createNewSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(sessions));
  }, [sessions]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuth();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        alert(event.data.error || 'Authentication failed');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/user');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_oauth', 'width=500,height=600');
    } catch (e) {
      alert('Failed to start login flow');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout');
    setUser(null);
  };

  const createNewSession = useCallback(async () => {
    const id = crypto.randomUUID();
    const newSession: ChatSession = {
      id,
      name: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };

    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(id);

    // Generate AI welcome
    try {
      const welcome = await geminiService.generateInitialGreeting("FlowBot");
      const welcomeMsg: Message = {
        id: crypto.randomUUID(),
        text: welcome,
        sender: SenderType.AGENT,
        timestamp: Date.now(),
      };
      setSessions(prev => prev.map(s => s.id === id ? { ...s, messages: [welcomeMsg] } : s));
    } catch (e) {
      console.error("Gemini welcome failed", e);
    }
  }, []);

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(sessions.find(s => s.id !== id)?.id || null);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isLoading || !activeSessionId) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      text: inputText,
      sender: SenderType.USER,
      timestamp: Date.now(),
    };

    const currentSessionId = activeSessionId;
    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, userMsg] } : s));
    setInputText('');
    setIsLoading(true);

    try {
      if (!config.webhookUrl) {
        throw new Error("n8n Webhook URL is missing. Please configure it in settings.");
      }

      const responseText = await N8nService.sendMessage(config.webhookUrl, userMsg.text, currentSessionId);
      
      const agentMsg: Message = {
        id: crypto.randomUUID(),
        text: responseText,
        sender: SenderType.AGENT,
        timestamp: Date.now(),
      };

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          const updatedMessages = [...s.messages, agentMsg];
          let newName = s.name;
          if (s.name === 'New Chat' || s.messages.length <= 1) {
            newName = userMsg.text.slice(0, 30) + (userMsg.text.length > 30 ? '...' : '');
          }
          return { ...s, messages: updatedMessages, name: newName };
        }
        return s;
      }));
    } catch (error: any) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        text: error?.message || "Something went wrong communicating with n8n.",
        sender: SenderType.SYSTEM,
        timestamp: Date.now(),
        metadata: { isError: true }
      };
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, errorMsg] } : s));
    } finally {
      setIsLoading(false);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100 text-center space-y-8">
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="w-10 h-10 text-indigo-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Dawie se chatbot</h1>
            <p className="text-gray-500">Please sign in to access your personal assistant.</p>
          </div>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 py-3.5 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
          <p className="text-[10px] text-gray-400">
            Access is restricted to whitelisted email addresses only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2 font-bold text-indigo-600">
            <Cpu className="w-6 h-6" />
            <span>Dawie se chatbot</span>
          </div>
          <button 
            onClick={createNewSession}
            className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors border border-indigo-100"
            title="New Chat"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                activeSessionId === session.id 
                  ? 'bg-indigo-50 text-indigo-700 font-medium' 
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeSessionId === session.id ? 'text-indigo-500' : 'text-gray-400'}`} />
                <span className="truncate text-sm">{session.name}</span>
              </div>
              <button 
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 space-y-2">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all text-sm font-medium"
          >
            <SettingsIcon className="w-5 h-5" />
            Settings
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-red-600 hover:bg-red-50 transition-all text-sm font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-white">
        {/* Header */}
        <header className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg lg:hidden"
            >
              <Plus className={`w-5 h-5 transition-transform ${isSidebarOpen ? 'rotate-45' : ''}`} />
            </button>
            <div className="flex flex-col">
              <h1 className="font-semibold text-gray-800 text-sm">
                {activeSession?.name || "Select a chat"}
              </h1>
              <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                Session: {activeSessionId?.slice(0, 8) || "None"}
              </span>
            </div>
          </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-xs font-semibold text-gray-700">{user.name}</span>
                <span className="text-[10px] text-gray-400">{user.email}</span>
              </div>
              <img src={user.picture} className="w-8 h-8 rounded-full border border-gray-200" alt={user.name} />
              <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight ${config.webhookUrl ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {config.webhookUrl ? 'Connected' : 'Offline'}
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar"
        >
          {activeSession?.messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <Bot className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Start your automation journey</h2>
              <p className="text-gray-500 max-w-sm">
                This agent is a bridge to Dawie se chatbot. Ask it anything to trigger your automated processes.
              </p>
            </div>
          )}

          {activeSession?.messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex ${msg.sender === SenderType.USER ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[85%] md:max-w-[70%] ${msg.sender === SenderType.USER ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                  msg.sender === SenderType.USER 
                    ? 'bg-indigo-600 text-white' 
                    : msg.sender === SenderType.SYSTEM 
                      ? 'bg-red-50 text-red-600' 
                      : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {msg.sender === SenderType.USER ? <User className="w-5 h-5" /> : (msg.metadata?.isError ? <WifiOff className="w-4 h-4" /> : <Bot className="w-5 h-5" />)}
                </div>
                
                <div className={`flex flex-col gap-1 ${msg.sender === SenderType.USER ? 'items-end' : 'items-start'}`}>
                  <div className={`relative p-4 rounded-2xl text-sm leading-relaxed shadow-sm group/msg ${
                    msg.sender === SenderType.USER 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : msg.metadata?.isError
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                  }`}>
                    {msg.sender === SenderType.AGENT && !msg.metadata?.isError && (
                      <button
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-gray-50/50 hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-all opacity-0 group-hover/msg:opacity-100"
                        title="Copy to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <div className="markdown-body pr-6">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 items-center text-gray-400">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center animate-pulse">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                </div>
                <span className="text-xs font-medium italic">Dawie se chatbot is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <footer className="p-4 md:p-6 bg-white border-t border-gray-100">
          {!config.webhookUrl && (
            <div className="max-w-4xl mx-auto mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3 text-amber-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Please configure your Dawie se chatbot Webhook URL in Settings to start chatting.</span>
            </div>
          )}
          <form 
            onSubmit={handleSendMessage}
            className="max-w-4xl mx-auto relative group"
          >
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={config.webhookUrl ? "Send a message to Dawie se chatbot..." : "Configure Dawie se chatbot Webhook URL first..."}
              disabled={isLoading || !config.webhookUrl}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-2xl py-4 pl-6 pr-14 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-inner"
            />
            <button 
              type="submit"
              disabled={!inputText.trim() || isLoading || !config.webhookUrl}
              className="absolute right-2 top-2 bottom-2 w-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all disabled:opacity-30 disabled:hover:bg-indigo-600 shadow-md active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center mt-3 text-[10px] text-gray-400">
            Powered by Dawie se chatbot & Gemini AI Intelligence
          </p>
        </footer>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                    <SettingsIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Chatbot Settings</h2>
                    <p className="text-xs text-gray-500">Configure your Dawie se chatbot integration</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">
                    Dawie se chatbot Webhook URL
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={config.webhookUrl}
                      onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                      placeholder="https://primary-n8n.cloud/webhook/..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-indigo-600"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Make sure your Dawie se chatbot Webhook node is set to <span className="font-bold">POST</span> method and has <span className="font-bold">HTTP Response: On Success</span> or use a <span className="font-bold">Respond to Webhook</span> node.
                  </p>
                </div>

                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-4">
                  <AlertCircle className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-indigo-900">CORS Warning</h4>
                    <p className="text-[11px] text-indigo-700/80 leading-relaxed">
                      If you get "Failed to fetch", your chatbot server might be blocking the request. You may need to set the <code className="bg-indigo-100 px-1 rounded font-mono">N8N_CORS_ALLOWED_ORIGINS</code> environment variable on your server instance.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    Save Changes
                  </button>
                  <a 
                    href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full text-center py-2 text-xs font-medium text-gray-400 hover:text-indigo-600 flex items-center justify-center gap-1 transition-colors"
                  >
                    n8n Documentation <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
