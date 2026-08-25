import { describe, expect, it } from 'vitest';
import { isRestrictedModeChannelAllowed } from '../../../src/main/ipc/restricted-mode';

describe('isRestrictedModeChannelAllowed (SOU-104 + SOU-318)', () => {
  it('always allows the activation surface + first-run read, in both setup states', () => {
    for (const setupComplete of [false, true]) {
      expect(isRestrictedModeChannelAllowed('license.status', setupComplete)).toBe(true);
      expect(isRestrictedModeChannelAllowed('license.activate', setupComplete)).toBe(true);
      expect(isRestrictedModeChannelAllowed('admin.exists', setupComplete)).toBe(true);
    }
  });

  it('allows the join branch (discover + join) only before setup is complete', () => {
    expect(isRestrictedModeChannelAllowed('hub.discoverCenters', false)).toBe(true);
    expect(isRestrictedModeChannelAllowed('hub.joinCenter', false)).toBe(true);
    // Once the (joined) center is set up, an unlicensed device can no longer
    // discover or re-join — the bootstrap window has closed.
    expect(isRestrictedModeChannelAllowed('hub.discoverCenters', true)).toBe(false);
    expect(isRestrictedModeChannelAllowed('hub.joinCenter', true)).toBe(false);
  });

  it('never exposes hosting or business channels while unlicensed', () => {
    for (const setupComplete of [false, true]) {
      // Hosting is a post-login settings action, not a first-run need.
      expect(isRestrictedModeChannelAllowed('hub.enableHosting', setupComplete)).toBe(false);
      expect(isRestrictedModeChannelAllowed('hub.hostingStatus', setupComplete)).toBe(false);
      // A representative business channel stays blocked in both states.
      expect(isRestrictedModeChannelAllowed('student.list', setupComplete)).toBe(false);
      expect(isRestrictedModeChannelAllowed('sync.run', setupComplete)).toBe(false);
    }
  });

  it('keeps the wizard bootstrap mutations open only before setup completes', () => {
    expect(isRestrictedModeChannelAllowed('admin.create', false)).toBe(true);
    expect(isRestrictedModeChannelAllowed('admin.create', true)).toBe(false);
  });
});
