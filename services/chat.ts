import api from './api';
import { io, Socket } from 'socket.io-client';
import { loadTokens } from './api';

let socket: Socket | null = null;

export const chatService = {
  async getThreads(): Promise<any[]> {
    const { data } = await api.get('/chat/threads');
    return data.data;
  },

  async getMessages(matchId: string, cursor?: string): Promise<any> {
    const { data } = await api.get(`/chat/threads/${matchId}/messages`, {
      params: cursor ? { cursor } : undefined,
    });
    return data.data;
  },

  async sendMessage(matchId: string, text: string): Promise<any> {
    const { data } = await api.post(`/chat/threads/${matchId}/messages`, { text });
    return data.data;
  },

  async markRead(matchId: string): Promise<void> {
    await api.put(`/chat/threads/${matchId}/read`);
  },

  // --- WebSocket ---

  async connectSocket(userId: string): Promise<Socket> {
    if (socket?.connected) return socket;

    const baseURL = __DEV__
      ? 'http://localhost:3000'
      : 'https://getdraft-api.up.railway.app';

    socket = io(`${baseURL}/chat`, {
      query: { userId },
      transports: ['websocket'],
    });

    return socket;
  },

  getSocket(): Socket | null {
    return socket;
  },

  disconnectSocket() {
    socket?.disconnect();
    socket = null;
  },

  joinThread(matchId: string) {
    socket?.emit('join_thread', { matchId });
  },

  leaveThread(matchId: string) {
    socket?.emit('leave_thread', { matchId });
  },

  sendSocketMessage(matchId: string, text: string) {
    socket?.emit('send_message', { matchId, text });
  },

  emitTyping(matchId: string, isTyping: boolean) {
    socket?.emit('typing', { matchId, isTyping });
  },
};
