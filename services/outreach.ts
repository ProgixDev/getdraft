import api from "./api";

export const outreachService = {
  async getOutreachList(): Promise<any[]> {
    const { data } = await api.get("/outreach");
    return data.data;
  },

  async getOutreach(outreachId: string): Promise<any> {
    const { data } = await api.get(`/outreach/${outreachId}`);
    return data.data;
  },

  async createOutreach(
    parentId: string,
    childAthleteId: string,
    message: string,
  ): Promise<any> {
    const { data } = await api.post("/outreach", {
      parentId,
      childAthleteId,
      message,
    });
    return data.data;
  },

  async updateStatus(
    outreachId: string,
    status: "New" | "In Review" | "Responded",
  ): Promise<any> {
    const { data } = await api.put(`/outreach/${outreachId}/status`, {
      status,
    });
    return data.data;
  },

  async getMessages(outreachId: string, page = 1): Promise<any[]> {
    const { data } = await api.get(`/outreach/${outreachId}/messages`, {
      params: { page },
    });
    return data.data;
  },

  async sendMessage(outreachId: string, text: string): Promise<any> {
    const { data } = await api.post(`/outreach/${outreachId}/messages`, {
      text,
    });
    return data.data;
  },
};
