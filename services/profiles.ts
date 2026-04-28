import api from './api';

export const profilesService = {
  // Athlete
  async getAthleteProfile() {
    const { data } = await api.get('/profiles/athlete');
    return data.data;
  },

  async upsertAthleteProfile(profile: Record<string, any>) {
    const { data } = await api.put('/profiles/athlete', profile);
    return data.data;
  },

  // Recruiter / Coach
  async getRecruiterProfile() {
    const { data } = await api.get('/profiles/recruiter');
    return data.data;
  },

  async upsertRecruiterProfile(profile: Record<string, any>) {
    const { data } = await api.put('/profiles/recruiter', profile);
    return data.data;
  },

  // Parent
  async getParentProfile() {
    const { data } = await api.get('/profiles/parent');
    return data.data;
  },

  async upsertParentProfile(profile: Record<string, any>) {
    const { data } = await api.put('/profiles/parent', profile);
    return data.data;
  },

  // Public profile
  async getPublicProfile(userId: string) {
    const { data } = await api.get(`/profiles/${userId}`);
    return data.data;
  },
};
