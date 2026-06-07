import api, { API_ORIGIN , loadTokens } from "./api";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const chatService = {
  async getThreads(): Promise<any[]> {
    const { data } = await api.get("/chat/threads");
    return data.data;
  },

  async getMessages(matchId: string, cursor?: string): Promise<any> {
    const { data } = await api.get(`/chat/threads/${matchId}/messages`, {
      params: cursor ? { cursor } : undefined,
    });
    return data.data;
  },

  async sendMessage(matchId: string, text: string): Promise<any> {
    const { data } = await api.post(`/chat/threads/${matchId}/messages`, {
      text,
    });
    return data.data;
  },

  async markRead(matchId: string): Promise<void> {
    await api.put(`/chat/threads/${matchId}/read`);
  },

  // --- WebSocket ---

  async connectSocket(): Promise<Socket> {
    if (socket?.connected) return socket;
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    const tokens = await loadTokens();
    socket = io(`${API_ORIGIN}/chat`, {
      auth: { token: tokens?.accessToken },
      transports: ["websocket"],
    });
    return socket;
  },

  joinConversation(conversationId: string) {
    socket?.emit("join_conversation", { conversationId });
  },

  leaveConversation(conversationId: string) {
    socket?.emit("leave_conversation", { conversationId });
  },

  sendDm(conversationId: string, text: string) {
    socket?.emit("send_dm", { conversationId, text });
  },

  getSocket(): Socket | null {
    return socket;
  },

  disconnectSocket() {
    socket?.disconnect();
    socket = null;
  },

  joinThread(matchId: string) {
    socket?.emit("join_thread", { matchId });
  },

  leaveThread(matchId: string) {
    socket?.emit("leave_thread", { matchId });
  },

  sendSocketMessage(matchId: string, text: string) {
    socket?.emit("send_message", { matchId, text });
  },

  emitTyping(matchId: string, isTyping: boolean) {
    socket?.emit("typing", { matchId, isTyping });
  },
};
