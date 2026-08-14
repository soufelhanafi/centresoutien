import { describe, expect, it } from 'vitest';
import { mapAssetsToTargets, type ReleaseAsset } from './releases';

const asset = (name: string, url = `https://example.com/${name}`): ReleaseAsset => ({
  name,
  browserDownloadUrl: url,
});

describe('mapAssetsToTargets', () => {
  it('maps a full release (Apple Silicon + Intel + Windows)', () => {
    const targets = mapAssetsToTargets([
      asset('Centre-Soutien-0.1.1-arm64.dmg'),
      asset('Centre-Soutien-0.1.1.dmg'),
      asset('Centre-Soutien-Setup-0.1.1.exe'),
      asset('Centre-Soutien-0.1.1.dmg.blockmap'),
      asset('Centre-Soutien-Setup-0.1.1.exe.blockmap'),
    ]);
    expect(targets.macAppleSilicon?.name).toBe('Centre-Soutien-0.1.1-arm64.dmg');
    expect(targets.macIntel?.name).toBe('Centre-Soutien-0.1.1.dmg');
    expect(targets.windows?.name).toBe('Centre-Soutien-Setup-0.1.1.exe');
  });

  it('ignores blockmap metadata (never direct downloads)', () => {
    const targets = mapAssetsToTargets([
      asset('Centre-Soutien-0.1.1.dmg.blockmap'),
      asset('Centre-Soutien-Setup-0.1.1.exe.blockmap'),
    ]);
    expect(targets).toEqual({});
  });

  it('prefers arm64 dmg for Apple Silicon even when blockmap comes first', () => {
    const targets = mapAssetsToTargets([
      asset('Centre-Soutien-0.1.1-arm64.dmg.blockmap'),
      asset('Centre-Soutien-0.1.1-arm64.dmg'),
    ]);
    expect(targets.macAppleSilicon?.name).toBe('Centre-Soutien-0.1.1-arm64.dmg');
  });

  it('returns empty targets for an empty asset list', () => {
    expect(mapAssetsToTargets([])).toEqual({});
  });
});
