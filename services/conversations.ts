import api from "./api";
import { chatService } from "./chat";

export interface ConversationUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
}

export interface ConversationItem {
  id: string;
  otherUser: ConversationUser;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export const conversationsService = {
  async getOrCreate(userId: string): Promise<{ id: string; otherUser: ConversationUser }> {
    const { data } = await api.post("/conversations", { userId });
    return data.data;
  },

  async getInbox(): Promise<ConversationItem[]> {
    const { data } = await api.get("/conversations");
    return data.data;
  },

  async getMessages(id: string, cursor?: string): Promise<DirectMessage[]> {
    const { data } = await api.get(`/conversations/${id}/messages`, {
      params: cursor ? { cursor } : undefined,
    });
    return data.data;
  },

  async sendMessage(id: string, text: string): Promise<DirectMessage> {
    const { data } = await api.post(`/conversations/${id}/messages`, { text });
    return data.data;
  },

  async markRead(id: string): Promise<void> {
    await api.put(`/conversations/${id}/read`);
  },

  // ---- realtime (reuses the existing /chat socket) ----
  joinConversation(id: string) {
    chatService.joinConversation(id);
  },
  leaveConversation(id: string) {
    chatService.leaveConversation(id);
  },
  sendDm(id: string, text: string) {
    chatService.sendDm(id, text);
  },
};
