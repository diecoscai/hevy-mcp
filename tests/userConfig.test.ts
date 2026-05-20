import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configDir, configPath, readUserConfig, writeUserConfig } from '../src/userConfig.js';

describe('userConfig', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hevy-cfg-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('configDir honors XDG_CONFIG_HOME', () => {
    expect(configDir({ XDG_CONFIG_HOME: '/xdg' })).toBe('/xdg/hevy-mcp');
  });

  it('configDir falls back to ~/.config when XDG is unset', () => {
    const dir = configDir({ HOME: '/home/u' });
    expect(dir.endsWith('/.config/hevy-mcp') || dir.includes('hevy-mcp')).toBe(true);
  });

  it('configDir ignores a blank XDG_CONFIG_HOME', () => {
    const dir = configDir({ XDG_CONFIG_HOME: '   ', HOME: '/home/u' });
    expect(dir).not.toContain('   ');
    expect(dir).toContain('hevy-mcp');
  });

  it('configPath is config.json inside configDir', () => {
    expect(configPath({ XDG_CONFIG_HOME: '/xdg' })).toBe('/xdg/hevy-mcp/config.json');
  });

  it('readUserConfig returns {} when the file does not exist', () => {
    expect(readUserConfig({ XDG_CONFIG_HOME: tmp })).toEqual({});
  });

  it('readUserConfig returns {} when the file is malformed JSON', () => {
    mkdirSync(join(tmp, 'hevy-mcp'), { recursive: true });
    writeFileSync(join(tmp, 'hevy-mcp', 'config.json'), '{not json');
    expect(readUserConfig({ XDG_CONFIG_HOME: tmp })).toEqual({});
  });

  it('writeUserConfig then readUserConfig round-trips apiKey and allowWrites', () => {
    const env = { XDG_CONFIG_HOME: tmp };
    const p = writeUserConfig({ apiKey: 'k-123', allowWrites: true }, env);
    expect(p).toBe(join(tmp, 'hevy-mcp', 'config.json'));
    expect(readUserConfig(env)).toEqual({ apiKey: 'k-123', allowWrites: true });
  });

  it('writeUserConfig creates the file with 0600 permissions', () => {
    const env = { XDG_CONFIG_HOME: tmp };
    const p = writeUserConfig({ apiKey: 'k', allowWrites: false }, env);
    const mode = statSync(p).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('readUserConfig coerces a non-true allowWrites to false', () => {
    mkdirSync(join(tmp, 'hevy-mcp'), { recursive: true });
    writeFileSync(
      join(tmp, 'hevy-mcp', 'config.json'),
      JSON.stringify({ apiKey: 'k', allowWrites: 'yes' })
    );
    expect(readUserConfig({ XDG_CONFIG_HOME: tmp })).toEqual({ apiKey: 'k', allowWrites: false });
  });

  it('readUserConfig drops a non-string apiKey', () => {
    mkdirSync(join(tmp, 'hevy-mcp'), { recursive: true });
    writeFileSync(
      join(tmp, 'hevy-mcp', 'config.json'),
      JSON.stringify({ apiKey: 123, allowWrites: true })
    );
    expect(readUserConfig({ XDG_CONFIG_HOME: tmp })).toEqual({ allowWrites: true });
  });
});
