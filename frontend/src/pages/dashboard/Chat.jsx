// import { useState, useRef, useEffect } from "react";
// import { 
//   Bot, 
//   User, 
//   Send, 
//   ArrowLeft, 
//   Heart, 
//   AlertCircle, 
//   Clock,
//   Loader,
//   Mic,
//   Paperclip,
//   MoreVertical,
//   Shield,
//   MessageSquare,
//   Plus,
//   FileText,
//   CheckCircle,
//   XCircle
// } from "lucide-react";
// import { useNavigate } from "react-router-dom";

// // Cookie utility functions
// const cookieUtils = {
//   get: (name) => {
//     const value = `; ${document.cookie}`;
//     const parts = value.split(`; ${name}=`);
//     if (parts.length === 2) {
//       const cookieValue = parts.pop().split(';').shift();
//       try {
//         return decodeURIComponent(cookieValue);
//       } catch (err) {
//         console.log(err);
//         return cookieValue;
//       }
//     }
//     return null;
//   },
  
//   remove: (name, path = '/') => {
//     document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=${path}`;
//   },
  
//   exists: (name) => {
//     return cookieUtils.get(name) !== null;
//   }
// };

// // Auth-specific utilities
// const authUtils = {
//   getToken: () => cookieUtils.get('token'),
//   removeToken: () => cookieUtils.remove('token'),
//   isAuthenticated: () => cookieUtils.exists('token')
// };

// // Updated API Service Class for new endpoints
// class ChatAPI {
//   constructor() {
//     this.baseUrl = 'http://localhost:5000/api/chat';
//     this.sessionId = null;
//   }
  
//   setAuthToken(token) {
//     this.authToken = token;
//   }
  
//   getHeaders() {
//     return {
//       'Content-Type': 'application/json',
//       'Authorization': `Bearer ${this.authToken}`
//     };
//   }
  
//   // Create new chat session (assuming this endpoint exists)
//   async createNewChatSession() {
//     try {
//       const response = await fetch(`${this.baseUrl}/sessions`, {
//         method: 'POST',
//         headers: this.getHeaders()
//       });
      
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
      
//       const data = await response.json();
//       if (data.success && data.sessionId) {
//         this.sessionId = data.sessionId;
//       }
//       return data;
//     } catch (error) {
//       console.error('Error creating chat session:', error);
//       throw error;
//     }
//   }
  
//   // Send message using new endpoint: POST /api/chat/sessions/:sessionId/messages
//   async sendMessage(query, file = null) {
//     try {
//       if (!this.sessionId) {
//         await this.createNewChatSession();
//       }
      
//       const formData = new FormData();
//       formData.append('query', query);
      
//       if (file) {
//         formData.append('file', file);
//       }
      
//       const response = await fetch(`${this.baseUrl}/sessions/${this.sessionId}/messages`, {
//         method: 'POST',
//         headers: {
//           'Authorization': `Bearer ${this.authToken}`
//           // Don't set Content-Type for FormData - browser sets it automatically with boundary
//         },
//         body: formData
//       });
      
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
      
//       const data = await response.json();
//       return data;
//     } catch (error) {
//       console.error('Error sending message:', error);
//       throw error;
//     }
//   }
  
//   // Get chat history (assuming this endpoint exists)
//   async getChatHistory(limit = 50) {
//     try {
//       if (!this.sessionId) {
//         return { messages: [] };
//       }
      
//       const response = await fetch(
//         `${this.baseUrl}/sessions/${this.sessionId}/history?limit=${limit}`, 
//         {
//           headers: this.getHeaders()
//         }
//       );
      
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
      
//       const data = await response.json();
//       return data;
//     } catch (error) {
//       console.error('Error fetching chat history:', error);
//       throw error;
//     }
//   }
  
//   // Get user's chat sessions (assuming this endpoint exists)
//   async getUserChatSessions(limit = 20) {
//     try {
//       const response = await fetch(
//         `${this.baseUrl}/sessions?limit=${limit}`, 
//         {
//           headers: this.getHeaders()
//         }
//       );
      
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
      
//       const data = await response.json();
//       return data;
//     } catch (error) {
//       console.error('Error fetching chat sessions:', error);
//       throw error;
//     }
//   }
  
//   loadSession(sessionId) {
//     this.sessionId = sessionId;
//   }
  
//   clearSession() {
//     this.sessionId = null;
//   }
  
//   getCurrentSessionId() {
//     return this.sessionId;
//   }
// }

// export default function Chat() {
//   const [messages, setMessages] = useState([]);
//   const [input, setInput] = useState("");
//   const [isTyping, setIsTyping] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState(null);
//   const [selectedFile, setSelectedFile] = useState(null);
//   const [chatSessions, setChatSessions] = useState([]);
//   const [showSessions, setShowSessions] = useState(false);
//   const [currentSessionTitle, setCurrentSessionTitle] = useState("New Chat");
  
//   const navigate = useNavigate();
//   const [suggestions] = useState([
//     "What are the symptoms of cancer?",
//     "Tell me about chemotherapy side effects",
//     "What products help with nausea?",
//     "How can I manage cancer fatigue?"
//   ]);
//   const [showSuggestions, setShowSuggestions] = useState(true);
  
//   const messagesEndRef = useRef(null);
//   const inputRef = useRef(null);
//   const fileInputRef = useRef(null);
//   const chatAPI = useRef(new ChatAPI());

//   const scrollToBottom = () => {
//     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
//   };

//   useEffect(() => {
//     scrollToBottom();
//   }, [messages, isTyping]);

//   // Initialize chat on component mount
//   useEffect(() => {
//     initializeChat();
//   }, []);

//   const initializeChat = async () => {
//     try {
//       // Get auth token from cookies
//       const token = authUtils.getToken();
//       console.log('🍪 Token from cookies:', token ? 'Found' : 'Not found');
      
//       if (!authUtils.isAuthenticated()) {
//         setError('Authentication required. Please log in again.');
//         return;
//       }
      
//       chatAPI.current.setAuthToken(token);
      
//       // Test token validity by trying to load sessions
//       try {
//         await loadChatSessions();
//         console.log('✅ Token is valid, chat initialized');
//       } catch (authError) {
//         console.error('❌ Token validation failed:', authError);
//         setError('Session expired. Please log in again.');
//         authUtils.removeToken();
//         return;
//       }
      
//       // Start with welcome message
//       setMessages([
//         { 
//           id: 1,
//           messageType: "AGENT", 
//           content: "Hello! I'm CancerMitr AI assistant. I can help answer questions about cancer information, treatments, and recommend products for symptom relief. How can I assist you today?",
//           timestamp: new Date(),
//           agentType: "SYSTEM"
//         }
//       ]);
      
//     } catch (error) {
//       console.error('Failed to initialize chat:', error);
//       setError('Failed to initialize chat. Please refresh the page.');
//     }
//   };

//   const loadChatSessions = async () => {
//     try {
//       const data = await chatAPI.current.getUserChatSessions();
//       if (data.success) {
//         setChatSessions(data.sessions || []);
//       }
//     } catch (error) {
//       console.error('Failed to load chat sessions:', error);
      
//       // Check if it's an auth error
//       if (error.message.includes('401') || error.message.includes('403')) {
//         setError('Session expired. Please log in again.');
//         authUtils.removeToken();
//       }
//     }
//   };

//   const handleSend = async () => {
//     if (!input.trim() && !selectedFile) return;

//     setError(null);
//     setIsLoading(true);
//     setIsTyping(true);

//     // Add user message to UI immediately
//     const userMessage = {
//       id: Date.now(),
//       messageType: "USER",
//       content: input.trim(),
//       timestamp: new Date(),
//       file: selectedFile ? {
//         name: selectedFile.name,
//         type: selectedFile.type,
//         size: selectedFile.size
//       } : null
//     };

//     setMessages(prev => [...prev, userMessage]);
//     const currentInput = input.trim();
//     const currentFile = selectedFile;
    
//     setInput("");
//     setSelectedFile(null);
//     setShowSuggestions(false);

//     try {
//       // Send message to backend using new API
//       const response = await chatAPI.current.sendMessage(currentInput, currentFile);
      
//       if (response.success) {
//         // Add assistant response
//         const assistantMessage = {
//           id: response.messageId || Date.now() + 1,
//           messageType: "AGENT",
//           agentType: "AI_AGENT",
//           content: response.answer,
//           timestamp: new Date(),
//           metadata: {
//             userId: response.userId,
//             messageId: response.messageId
//           }
//         };
        
//         setMessages(prev => [...prev, assistantMessage]);
        
//         // Update session title if it's the first message
//         if (messages.length <= 1) {
//           setCurrentSessionTitle(currentInput.length > 30 
//             ? currentInput.substring(0, 30) + '...' 
//             : currentInput
//           );
//         }
        
//         // Refresh sessions list
//         await loadChatSessions();
//       } else {
//         throw new Error(response.message || 'Failed to get response');
//       }
      
//     } catch (error) {
//       console.error('Error sending message:', error);
      
//       // Check if it's an auth error
//       if (error.message.includes('401') || error.message.includes('403')) {
//         setError('Session expired. Please log in again.');
//         authUtils.removeToken();
//         return;
//       }
      
//       // Add error message to UI
//       const errorMessage = {
//         id: Date.now() + 2,
//         messageType: "ERROR",
//         content: `Sorry, there was an error processing your message: ${error.message}. Please try again.`,
//         timestamp: new Date()
//       };
//       setMessages(prev => [...prev, errorMessage]);
//       setError('Failed to send message. Please try again.');
//     } finally {
//       setIsLoading(false);
//       setIsTyping(false);
//     }
//   };

//   const handleSuggestionClick = (suggestion) => {
//     setInput(suggestion);
//     setShowSuggestions(false);
//     inputRef.current?.focus();
//   };

//   const handleEnter = (e) => {
//     if (e.key === "Enter" && !e.shiftKey) {
//       e.preventDefault();
//       handleSend();
//     }
//   };

//   const handleFileSelect = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       // Validate file type and size
//       const maxSize = 10 * 1024 * 1024; // 10MB
//       const allowedTypes = [
//         'application/pdf',
//         'application/msword',
//         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
//         'text/plain',
//         'text/csv',
//         'image/jpeg',
//         'image/png'
//       ];
      
//       if (!allowedTypes.includes(file.type)) {
//         setError(`File type ${file.type} is not supported`);
//         return;
//       }
      
//       if (file.size > maxSize) {
//         setError('File size must be less than 10MB');
//         return;
//       }
      
//       setSelectedFile(file);
//       setError(null);
//     }
//   };

//   const startNewChat = async () => {
//     try {
//       await chatAPI.current.createNewChatSession();
//       setMessages([
//         { 
//           id: Date.now(),
//           messageType: "AGENT", 
//           content: "Hello! I'm CancerMitr AI assistant. I can help answer questions about cancer information, treatments, and recommend products for symptom relief. How can I assist you today?",
//           timestamp: new Date(),
//           agentType: "SYSTEM"
//         }
//       ]);
//       setCurrentSessionTitle("New Chat");
//       setShowSuggestions(true);
//       setShowSessions(false);
//       await loadChatSessions();
//     } catch (error) {
//       console.error('Failed to create new chat:', error);
//       setError('Failed to create new chat session');
//     }
//   };

//   const loadChatSession = async (sessionId, title) => {
//     try {
//       chatAPI.current.loadSession(sessionId);
//       const historyData = await chatAPI.current.getChatHistory();
      
//       if (historyData.success) {
//         // Convert history to UI format
//         const formattedMessages = historyData.messages.map(msg => ({
//           ...msg,
//           id: msg.id || Date.now() + Math.random(),
//           timestamp: new Date(msg.timestamp)
//         }));
//         setMessages(formattedMessages);
//         setCurrentSessionTitle(title);
//         setShowSessions(false);
//         setShowSuggestions(false);
//       }
//     } catch (error) {
//       console.error('Failed to load chat session:', error);
//       setError('Failed to load chat session');
//     }
//   };

//   const handleBack = () => {
//     navigate('/dashboard');
//   };

//   const formatTimestamp = (timestamp) => {
//     return new Date(timestamp).toLocaleTimeString([], { 
//       hour: '2-digit', 
//       minute: '2-digit' 
//     });
//   };

//   const getAgentTypeDisplay = (agentType) => {
//     switch(agentType) {
//       case 'PRODUCT_AGENT':
//         return '🛍️ Products';
//       case 'DOCUMENT_AGENT':
//         return '📚 Medical Info';
//       case 'AI_AGENT':
//         return '🤖 AI Assistant';
//       case 'SYSTEM':
//         return '🤖 System';
//       default:
//         return '🤖 AI';
//     }
//   };

//   return (
//     <div className="flex h-screen bg-gray-50">
//       {/* Sessions Sidebar */}
//       {showSessions && (
//         <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
//           <div className="p-4 border-b border-gray-200">
//             <div className="flex items-center justify-between">
//               <h2 className="text-lg font-semibold text-gray-900">Chat History</h2>
//               <button
//                 onClick={() => setShowSessions(false)}
//                 className="p-1 text-gray-500 hover:text-gray-700"
//               >
//                 <ArrowLeft className="w-5 h-5" />
//               </button>
//             </div>
//           </div>
          
//           <div className="flex-1 overflow-y-auto p-4 space-y-2">
//             <button
//               onClick={startNewChat}
//               className="w-full flex items-center gap-3 p-3 text-left bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
//             >
//               <Plus className="w-4 h-4 text-blue-600" />
//               <span className="text-blue-600 font-medium">New Chat</span>
//             </button>
            
//             {chatSessions.map((session) => (
//               <button
//                 key={session.sessionId}
//                 onClick={() => loadChatSession(session.sessionId, session.title)}
//                 className="w-full p-3 text-left bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
//               >
//                 <div className="font-medium text-gray-900 truncate">
//                   {session.title || 'Untitled Chat'}
//                 </div>
//                 <div className="text-sm text-gray-500 truncate mt-1">
//                   {session.messages?.[0]?.content?.substring(0, 60)}...
//                 </div>
//                 <div className="text-xs text-gray-400 mt-1">
//                   {new Date(session.updatedAt).toLocaleDateString()}
//                 </div>
//               </button>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* Main Chat Area */}
//       <div className="flex-1 flex flex-col">
//         {/* Header */}
//         <div className="bg-white border-b border-gray-200 px-4 py-4">
//           <div className="flex items-center justify-between">
//             <div className="flex items-center gap-4">
//               <button
//                 onClick={handleBack}
//                 className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
//               >
//                 <ArrowLeft className="w-5 h-5" />
//               </button>
//               <div className="flex items-center gap-3">
//                 <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
//                   <Bot className="w-6 h-6 text-blue-600" />
//                 </div>
//                 <div>
//                   <h1 className="text-lg font-semibold text-gray-900">
//                     {currentSessionTitle}
//                   </h1>
//                   <div className="flex items-center gap-1">
//                     <div className="w-2 h-2 bg-green-500 rounded-full"></div>
//                     <span className="text-sm text-gray-500">
//                       CancerMitr AI Assistant
//                     </span>
//                   </div>
//                 </div>
//               </div>
//             </div>
            
//             <div className="flex items-center gap-2">
//               <button
//                 onClick={() => setShowSessions(!showSessions)}
//                 className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
//               >
//                 <MessageSquare className="w-5 h-5" />
//               </button>
//               <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
//                 <MoreVertical className="w-5 h-5" />
//               </button>
//             </div>
//           </div>
//         </div>

//         {/* Error Banner */}
//         {error && (
//           <div className="bg-red-50 border-b border-red-200 px-4 py-3">
//             <div className="flex items-center gap-2 text-red-800">
//               <XCircle className="w-4 h-4" />
//               <span className="text-sm">{error}</span>
//               <button
//                 onClick={() => setError(null)}
//                 className="ml-auto text-red-600 hover:text-red-800"
//               >
//                 <XCircle className="w-4 h-4" />
//               </button>
//             </div>
//           </div>
//         )}

//         {/* Messages */}
//         <div className="flex-1 overflow-y-auto p-4 space-y-4">
//           {messages.map((msg) => (
//             <div
//               key={msg.id}
//               className={`flex gap-3 ${
//                 msg.messageType === "USER" ? "justify-end" : "justify-start"
//               }`}
//             >
//               {msg.messageType !== "USER" && (
//                 <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
//                   msg.messageType === "ERROR" ? "bg-red-100" : "bg-blue-100"
//                 }`}>
//                   <Bot className={`w-4 h-4 ${
//                     msg.messageType === "ERROR" ? "text-red-600" : "text-blue-600"
//                   }`} />
//                 </div>
//               )}
              
//               <div className={`max-w-md ${msg.messageType === "USER" ? "order-1" : ""}`}>
//                 <div
//                   className={`px-4 py-3 rounded-2xl ${
//                     msg.messageType === "USER"
//                       ? "bg-blue-600 text-white rounded-br-md"
//                       : msg.messageType === "ERROR"
//                       ? "bg-red-50 border border-red-200 text-red-900 rounded-bl-md"
//                       : "bg-white border border-gray-200 text-gray-900 rounded-bl-md"
//                   }`}
//                 >
//                   <p className="text-sm leading-relaxed whitespace-pre-wrap">
//                     {msg.content}
//                   </p>
                  
//                   {/* File attachment indicator */}
//                   {msg.file && (
//                     <div className="mt-2 p-2 bg-gray-100 rounded-lg flex items-center gap-2">
//                       <FileText className="w-4 h-4 text-gray-600" />
//                       <span className="text-xs text-gray-600">{msg.file.name}</span>
//                     </div>
//                   )}
                  
//                   {/* Agent type and metadata */}
//                   {msg.metadata && (
//                     <div className="mt-2 pt-2 border-t border-gray-100">
//                       <div className="flex items-center justify-between text-xs text-gray-500">
//                         <span>{getAgentTypeDisplay(msg.agentType)}</span>
//                         {msg.metadata.messageId && (
//                           <span className="flex items-center gap-1">
//                             <CheckCircle className="w-3 h-3" />
//                             Processed
//                           </span>
//                         )}
//                       </div>
//                     </div>
//                   )}
//                 </div>
                
//                 <div className={`mt-1 text-xs text-gray-500 ${
//                   msg.messageType === "USER" ? "text-right" : "text-left"
//                 }`}>
//                   {formatTimestamp(msg.timestamp)}
//                 </div>
//               </div>

//               {msg.messageType === "USER" && (
//                 <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1 order-2">
//                   <User className="w-4 h-4 text-gray-600" />
//                 </div>
//               )}
//             </div>
//           ))}

//           {/* Typing Indicator */}
//           {isTyping && (
//             <div className="flex gap-3 justify-start">
//               <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
//                 <Bot className="w-4 h-4 text-blue-600" />
//               </div>
//               <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
//                 <div className="flex items-center gap-1">
//                   <div className="flex gap-1">
//                     <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
//                     <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
//                     <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
//                   </div>
//                   <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Suggestions */}
//           {showSuggestions && messages.length <= 1 && (
//             <div className="space-y-3">
//               <p className="text-sm text-gray-600 text-center">Here are some questions I can help with:</p>
//               <div className="grid gap-2">
//                 {suggestions.map((suggestion, index) => (
//                   <button
//                     key={index}
//                     onClick={() => handleSuggestionClick(suggestion)}
//                     className="p-3 text-left text-sm bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
//                   >
//                     {suggestion}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           )}

//           <div ref={messagesEndRef} />
//         </div>

//         {/* Selected File Preview */}
//         {selectedFile && (
//           <div className="px-4 py-2 bg-blue-50 border-t border-blue-200">
//             <div className="flex items-center justify-between">
//               <div className="flex items-center gap-2 text-blue-800">
//                 <FileText className="w-4 h-4" />
//                 <span className="text-sm font-medium">{selectedFile.name}</span>
//                 <span className="text-xs">
//                   ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
//                 </span>
//               </div>
//               <button
//                 onClick={() => setSelectedFile(null)}
//                 className="text-blue-600 hover:text-blue-800"
//               >
//                 <XCircle className="w-4 h-4" />
//               </button>
//             </div>
//           </div>
//         )}

//         {/* Disclaimer */}
//         <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200">
//           <div className="flex items-center gap-2 text-yellow-800">
//             <AlertCircle className="w-4 h-4 flex-shrink-0" />
//             <p className="text-xs">
//               This AI provides general cancer information only. Always consult healthcare professionals for medical advice.
//             </p>
//           </div>
//         </div>

//         {/* Input Area */}
//         <div className="bg-white border-t border-gray-200 p-4">
//           <div className="flex items-end gap-3">
//             <div className="flex-1">
//               <div className="relative">
//                 <textarea
//                   ref={inputRef}
//                   value={input}
//                   onChange={(e) => setInput(e.target.value)}
//                   onKeyDown={handleEnter}
//                   placeholder="Ask about cancer information, treatments, or products..."
//                   className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none min-h-[44px] max-h-32"
//                   rows="1"
//                   disabled={isLoading}
//                   style={{ 
//                     height: 'auto',
//                     minHeight: '44px'
//                   }}
//                   onInput={(e) => {
//                     e.target.style.height = 'auto';
//                     e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
//                   }}
//                 />
                
//                 <div className="absolute right-2 bottom-2 flex items-center gap-1">
//                   <input
//                     ref={fileInputRef}
//                     type="file"
//                     onChange={handleFileSelect}
//                     className="hidden"
//                     accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png"
//                   />
//                   <button 
//                     onClick={() => fileInputRef.current?.click()}
//                     className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
//                     disabled={isLoading}
//                   >
//                     <Paperclip className="w-4 h-4" />
//                   </button>
//                   <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
//                     <Mic className="w-4 h-4" />
//                   </button>
//                 </div>
//               </div>
//             </div>
            
//             <button
//               onClick={handleSend}
//               disabled={(!input.trim() && !selectedFile) || isLoading}
//               className="flex items-center justify-center w-11 h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
//             >
//               {isLoading ? (
//                 <Loader className="w-5 h-5 animate-spin" />
//               ) : (
//                 <Send className="w-5 h-5" />
//               )}
//             </button>
//           </div>
          
//           {/* Quick Actions */}
//           <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
//             <div className="flex items-center gap-2 text-xs text-gray-500">
//               <Shield className="w-3 h-3" />
//               <span>Your conversations are private and secure</span>
//             </div>
            
//             <div className="flex items-center gap-4 text-xs text-gray-500">
//               {chatAPI.current.getCurrentSessionId() && (
//                 <div className="flex items-center gap-1">
//                   <CheckCircle className="w-3 h-3 text-green-500" />
//                   <span>Session active</span>
//                 </div>
//               )}
//               <div className="flex items-center gap-1">
//                 <Clock className="w-3 h-3" />
//                 <span>Enhanced AI system</span>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }


import { useState, useRef, useEffect } from "react";
import { 
  Bot, 
  User, 
  Send, 
  ArrowLeft, 
  AlertCircle,
  Loader,
  Mic,
  Paperclip,
  MoreVertical,
  MessageSquare,
  Plus,
  FileText,
  XCircle,
  Camera,
  Image,
  File
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// Cookie utility functions
const cookieUtils = {
  get: (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      const cookieValue = parts.pop().split(';').shift();
      try {
        return decodeURIComponent(cookieValue);
      } catch (err) {
        console.log(err);
        return cookieValue;
      }
    }
    return null;
  },
  
  remove: (name, path = '/') => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=${path}`;
  },
  
  exists: (name) => {
    return cookieUtils.get(name) !== null;
  }
};

// Auth-specific utilities
const authUtils = {
  getToken: () => cookieUtils.get('token'),
  removeToken: () => cookieUtils.remove('token'),
  isAuthenticated: () => cookieUtils.exists('token')
};

// Updated API Service Class for new endpoints
class ChatAPI {
  constructor() {
    this.baseUrl = 'http://localhost:5000/api/chat';
    this.sessionId = null;
  }
  
  setAuthToken(token) {
    this.authToken = token;
  }
  
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`
    };
  }
  
  // Create new chat session
  async createNewChatSession() {
    try {
      const response = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: this.getHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.sessionId) {
        this.sessionId = data.sessionId;
      }
      return data;
    } catch (error) {
      console.error('Error creating chat session:', error);
      throw error;
    }
  }
  
  // Send message using new endpoint: POST /api/chat/sessions/:sessionId/messages
  async sendMessage(query, file = null) {
    try {
      if (!this.sessionId) {
        await this.createNewChatSession();
      }
      
      const formData = new FormData();
      formData.append('query', query);
      
      if (file) {
        formData.append('file', file);
      }
      
      const response = await fetch(`${this.baseUrl}/sessions/${this.sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
          // Don't set Content-Type for FormData - browser sets it automatically with boundary
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
  
  // Get chat history
  async getChatHistory(limit = 50) {
    try {
      if (!this.sessionId) {
        return { messages: [] };
      }
      
      const response = await fetch(
        `${this.baseUrl}/sessions/${this.sessionId}/history?limit=${limit}`, 
        {
          headers: this.getHeaders()
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      throw error;
    }
  }
  
  // Get user's chat sessions
  async getUserChatSessions(limit = 20) {
    try {
      const response = await fetch(
        `${this.baseUrl}/sessions?limit=${limit}`, 
        {
          headers: this.getHeaders()
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
      throw error;
    }
  }
  
  loadSession(sessionId) {
    this.sessionId = sessionId;
  }
  
  clearSession() {
    this.sessionId = null;
  }
  
  getCurrentSessionId() {
    return this.sessionId;
  }
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [currentSessionTitle, setCurrentSessionTitle] = useState("New Chat");
  
  const navigate = useNavigate();
  const [suggestions] = useState([
    "What are the symptoms of cancer?",
    "Tell me about chemotherapy side effects",
    "What products help with nausea?",
    "How can I manage cancer fatigue?"
  ]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatAPI = useRef(new ChatAPI());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Initialize chat on component mount
  useEffect(() => {
    initializeChat();
  }, []);

  const initializeChat = async () => {
    try {
      // Get auth token from cookies
      const token = authUtils.getToken();
      console.log('🍪 Token from cookies:', token ? 'Found' : 'Not found');
      
      if (!authUtils.isAuthenticated()) {
        setError('Authentication required. Please log in again.');
        return;
      }
      
      chatAPI.current.setAuthToken(token);
      
      // Test token validity by trying to load sessions
      try {
        await loadChatSessions();
        console.log('✅ Token is valid, chat initialized');
      } catch (authError) {
        console.error('❌ Token validation failed:', authError);
        setError('Session expired. Please log in again.');
        authUtils.removeToken();
        return;
      }
      
      // Start with welcome message
      setMessages([
        { 
          id: 1,
          messageType: "AGENT", 
          content: "Hello! I'm CancerMitr AI assistant. I can help answer questions about cancer information, treatments, and recommend products for symptom relief. How can I assist you today?",
          timestamp: new Date(),
          agentType: "SYSTEM"
        }
      ]);
      
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      setError('Failed to initialize chat. Please refresh the page.');
    }
  };

  const loadChatSessions = async () => {
    try {
      const data = await chatAPI.current.getUserChatSessions();
      if (data.success) {
        setChatSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
      
      // Check if it's an auth error
      if (error.message.includes('401') || error.message.includes('403')) {
        setError('Session expired. Please log in again.');
        authUtils.removeToken();
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedFile) return;

    setError(null);
    setIsLoading(true);
    setIsTyping(true);

    // Add user message to UI immediately
    const userMessage = {
      id: Date.now(),
      messageType: "USER",
      content: input.trim(),
      timestamp: new Date(),
      file: selectedFile ? {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size
      } : null
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    const currentFile = selectedFile;
    
    setInput("");
    setSelectedFile(null);
    setShowSuggestions(false);
    setShowAttachMenu(false);

    try {
      // Send message to backend using new API
      const response = await chatAPI.current.sendMessage(currentInput, currentFile);
      
      if (response.success) {
        // Add assistant response
        const assistantMessage = {
          id: response.messageId || Date.now() + 1,
          messageType: "AGENT",
          agentType: "AI_AGENT",
          content: response.answer,
          timestamp: new Date(),
          metadata: {
            userId: response.userId,
            messageId: response.messageId
          }
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Update session title if it's the first message
        if (messages.length <= 1) {
          setCurrentSessionTitle(currentInput.length > 30 
            ? currentInput.substring(0, 30) + '...' 
            : currentInput
          );
        }
        
        // Refresh sessions list
        await loadChatSessions();
      } else {
        throw new Error(response.message || 'Failed to get response');
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Check if it's an auth error
      if (error.message.includes('401') || error.message.includes('403')) {
        setError('Session expired. Please log in again.');
        authUtils.removeToken();
        return;
      }
      
      // Add error message to UI
      const errorMessage = {
        id: Date.now() + 2,
        messageType: "ERROR",
        content: `Sorry, there was an error processing your message: ${error.message}. Please try again.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleEnter = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type and size
      const maxSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv',
        'image/jpeg',
        'image/png'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        setError(`File type ${file.type} is not supported`);
        return;
      }
      
      if (file.size > maxSize) {
        setError('File size must be less than 10MB');
        return;
      }
      
      setSelectedFile(file);
      setError(null);
      setShowAttachMenu(false);
    }
  };

  const startNewChat = async () => {
    try {
      await chatAPI.current.createNewChatSession();
      setMessages([
        { 
          id: Date.now(),
          messageType: "AGENT", 
          content: "Hello! I'm CancerMitr AI assistant. I can help answer questions about cancer information, treatments, and recommend products for symptom relief. How can I assist you today?",
          timestamp: new Date(),
          agentType: "SYSTEM"
        }
      ]);
      setCurrentSessionTitle("New Chat");
      setShowSuggestions(true);
      setShowSessions(false);
      await loadChatSessions();
    } catch (error) {
      console.error('Failed to create new chat:', error);
      setError('Failed to create new chat session');
    }
  };

  const loadChatSession = async (sessionId, title) => {
    try {
      chatAPI.current.loadSession(sessionId);
      const historyData = await chatAPI.current.getChatHistory();
      
      if (historyData.success) {
        // Convert history to UI format
        const formattedMessages = historyData.messages.map(msg => ({
          ...msg,
          id: msg.id || Date.now() + Math.random(),
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(formattedMessages);
        setCurrentSessionTitle(title);
        setShowSessions(false);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Failed to load chat session:', error);
      setError('Failed to load chat session');
    }
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="flex h-screen bg-[#0A0E27] text-white">
      {showSessions && (
        <div className="fixed inset-0 z-50 bg-[#0A0E27]">
          <div className="flex flex-col h-full">
            <div className="px-4 py-4 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Chat History</h2>
                <button
                  onClick={() => setShowSessions(false)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-3 p-4 bg-blue-600 rounded-xl hover:bg-blue-700"
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium">New Chat</span>
              </button>
              
              {chatSessions.map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => loadChatSession(session.sessionId, session.title)}
                  className="w-full p-4 text-left bg-[#1A1F3A] rounded-xl hover:bg-[#252B4A]"
                >
                  <div className="font-medium text-white truncate">
                    {session.title || 'Untitled Chat'}
                  </div>
                  <div className="text-sm text-gray-400 truncate mt-1">
                    {session.messages?.[0]?.content?.substring(0, 60)}...
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="bg-[#1A1F3A] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-semibold truncate max-w-[180px]">
                {currentSessionTitle}
              </h1>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-400">AI Assistant</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSessions(!showSessions)} className="p-2 text-gray-400 hover:text-white">
              <MessageSquare className="w-5 h-5" />
            </button>
            <button className="p-2 text-gray-400 hover:text-white">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border-b border-red-800 px-4 py-3">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}>
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.messageType === "USER" ? "justify-end" : "justify-start"}`}>
              {msg.messageType !== "USER" && (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              
              <div className={`max-w-[75%] ${msg.messageType === "USER" ? "order-1" : ""}`}>
                <div className={`px-4 py-3 rounded-2xl ${
                    msg.messageType === "USER"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : msg.messageType === "ERROR"
                      ? "bg-red-900/30 border border-red-800 text-red-400 rounded-bl-md"
                      : "bg-[#1A1F3A] text-gray-100 rounded-bl-md"
                  }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  
                  {msg.file && (
                    <div className="mt-2 p-2 bg-black/20 rounded-lg flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span className="text-xs truncate">{msg.file.name}</span>
                    </div>
                  )}
                </div>
                
                <div className={`mt-1 text-xs text-gray-500 ${msg.messageType === "USER" ? "text-right" : "text-left"}`}>
                  {formatTimestamp(msg.timestamp)}
                </div>
              </div>

              {msg.messageType === "USER" && (
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 order-2">
                  <User className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-[#1A1F3A] rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </div>
          )}

          {showSuggestions && messages.length <= 1 && (
            <div className="space-y-3 pt-8">
              <h2 className="text-2xl font-bold text-center mb-6">How can I help you?</h2>
              <div className="grid gap-3">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="p-4 text-left text-sm bg-[#1A1F3A] rounded-xl hover:bg-[#252B4A] border border-gray-800"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {selectedFile && (
          <div className="px-4 py-3 bg-blue-900/30 border-t border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-400">
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</span>
              </div>
              <button onClick={() => setSelectedFile(null)} className="text-blue-400">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="px-4 py-2 bg-yellow-900/20 border-t border-yellow-900/50">
          <div className="flex items-start gap-2 text-yellow-500/80">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              AI provides general info only. Consult healthcare professionals for medical advice.
            </p>
          </div>
        </div>

        {showAttachMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
            <div className="absolute bottom-20 left-4 right-4 bg-[#1A1F3A] rounded-t-2xl shadow-2xl z-50 border border-gray-800">
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4">
                  <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                    className="flex flex-col items-center gap-2 p-4 bg-[#252B4A] rounded-xl">
                    <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs text-gray-400">Camera</span>
                  </button>
                  
                  <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                    className="flex flex-col items-center gap-2 p-4 bg-[#252B4A] rounded-xl">
                    <div className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center">
                      <Image className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs text-gray-400">Photo</span>
                  </button>
                  
                  <button onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                    className="flex flex-col items-center gap-2 p-4 bg-[#252B4A] rounded-xl">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                      <File className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs text-gray-400">File</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="bg-[#1A1F3A] p-4">
          <div className="flex items-end gap-2">
            <button onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-3 text-gray-400 hover:text-white bg-[#252B4A] rounded-full flex-shrink-0"
              disabled={isLoading}>
              <Plus className="w-5 h-5" />
            </button>
            
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleEnter}
                placeholder="Ask me...."
                className="w-full px-4 py-3 bg-[#252B4A] text-white placeholder-gray-500 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png"
              />
              
              <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white" disabled={isLoading}>
                <Mic className="w-5 h-5" />
              </button>
            </div>
            
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !selectedFile) || isLoading}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-full flex-shrink-0"
            >
              {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          
          <div className="text-center mt-3">
            <p className="text-xs text-gray-500">AI can make mistakes</p>
          </div>
        </div>
      </div>
    </div>
  );
}