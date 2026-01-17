import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore env after each test
    process.env = originalEnv;
  });

  it('should throw if no auth is configured', () => {
    delete process.env['GITHUB_TOKEN'];
    delete process.env['APP_ID'];
    delete process.env['APP_PRIVATE_KEY'];
    expect(() => loadConfig()).toThrow('Authentication required');
  });

  it('should accept App auth without GITHUB_TOKEN', () => {
    delete process.env['GITHUB_TOKEN'];
    process.env['APP_ID'] = '12345';
    process.env['APP_PRIVATE_KEY'] = 'test-key';

    const config = loadConfig();

    expect(config.githubToken).toBeNull();
    expect(config.appId).toBe('12345');
    expect(config.appPrivateKey).toBe('test-key');
  });

  it('should load config with defaults', () => {
    process.env['GITHUB_TOKEN'] = 'test-token';

    const config = loadConfig();

    expect(config.githubToken).toBe('test-token');
    expect(config.targetOwner).toBe('modelcontextprotocol');
    expect(config.targetRepo).toBe('modelcontextprotocol');
    expect(config.maintainersTeam).toBe('core-maintainers');
    expect(config.proposalPingDays).toBe(90);
    expect(config.proposalDormantDays).toBe(180);
    expect(config.pingCooldownDays).toBe(14);
    expect(config.dryRun).toBe(false);
    expect(config.discordWebhookUrl).toBeNull();
  });

  it('should load custom values from env', () => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    process.env['TARGET_OWNER'] = 'custom-owner';
    process.env['TARGET_REPO'] = 'custom-repo';
    process.env['PROPOSAL_PING_DAYS'] = '60';
    process.env['DRY_RUN'] = 'true';
    process.env['DISCORD_WEBHOOK_URL'] = 'https://discord.com/webhook';

    const config = loadConfig();

    expect(config.targetOwner).toBe('custom-owner');
    expect(config.targetRepo).toBe('custom-repo');
    expect(config.proposalPingDays).toBe(60);
    expect(config.dryRun).toBe(true);
    expect(config.discordWebhookUrl).toBe('https://discord.com/webhook');
  });

  it('should throw if numeric env var is not a number', () => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    process.env['PROPOSAL_PING_DAYS'] = 'not-a-number';

    expect(() => loadConfig()).toThrow('must be a number');
  });
});
