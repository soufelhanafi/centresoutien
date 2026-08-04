import type {
  GeneratorCommitInput,
  GeneratorCommitResult,
  GeneratorPreviewConfig,
  GeneratorPreviewResult,
  SessionGeneratorGateway,
} from './session-generator-gateway';

/**
 * The real {@link SessionGeneratorGateway}: maps the two methods onto the
 * SOU-158/159 `session.generator.*` IPC channels. No business logic — the
 * `PreviewGeneratedSchedule` / `CommitGeneratedSchedule` use cases behind the
 * channels own the plan gate, the scope resolution, and the conflict checks.
 * `centerCode` / `deviceOrigin` / `updatedBy` are injected in main, never sent
 * from the renderer. Mirrors every other IPC gateway (`IpcSessionWriteGateway`).
 */
class IpcSessionGeneratorGateway implements SessionGeneratorGateway {
  async preview(config: GeneratorPreviewConfig): Promise<GeneratorPreviewResult> {
    return window.api.invoke('session.generator.preview', config);
  }

  async commit(input: GeneratorCommitInput): Promise<GeneratorCommitResult> {
    return window.api.invoke('session.generator.commit', input);
  }
}

export const ipcSessionGeneratorGateway: SessionGeneratorGateway = new IpcSessionGeneratorGateway();
