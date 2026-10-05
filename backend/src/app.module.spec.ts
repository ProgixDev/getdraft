import { HealthController } from './app.module';

// GET /api/config is public and unauthenticated: the app reads it on the
// signup role step to decide whether to offer "Team / Club".
describe('GET /api/config', () => {
  const originalFlag = process.env.TEAM_ROLE_ENABLED;
  const originalToken = process.env.MAPBOX_PUBLIC_TOKEN;
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  afterEach(() => {
    restore('TEAM_ROLE_ENABLED', originalFlag);
    restore('MAPBOX_PUBLIC_TOKEN', originalToken);
  });

  // config() touches nothing but the environment.
  const controller = new HealthController(undefined as any);

  it('teamRoleEnabled is false unless the switch is on', () => {
    delete process.env.TEAM_ROLE_ENABLED;
    expect(controller.config().teamRoleEnabled).toBe(false);

    for (const off of ['false', '0', 'off', 'no', '']) {
      process.env.TEAM_ROLE_ENABLED = off;
      expect(controller.config().teamRoleEnabled).toBe(false);
    }
  });

  it('teamRoleEnabled is true for true / 1 / on / yes, read on every request', () => {
    for (const on of ['true', '1', 'on', 'yes', 'TRUE']) {
      process.env.TEAM_ROLE_ENABLED = on;
      expect(controller.config().teamRoleEnabled).toBe(true);
    }
    process.env.TEAM_ROLE_ENABLED = 'false';
    expect(controller.config().teamRoleEnabled).toBe(false);
  });

  it('still returns the Mapbox token next to it', () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.test';
    delete process.env.TEAM_ROLE_ENABLED;
    expect(controller.config()).toEqual({
      mapboxToken: 'pk.test',
      teamRoleEnabled: false,
    });
    delete process.env.MAPBOX_PUBLIC_TOKEN;
    expect(controller.config().mapboxToken).toBeNull();
  });
});
