// Minimal renderer (SOU-15). Proves the typed IPC bridge end-to-end; the React
// + shadcn/ui renderer replaces this in SOU-16.
const root = document.getElementById('app');

async function render(): Promise<void> {
  if (!root) return;
  try {
    const { reply, appVersion } = await window.api.invoke('app.ping', { message: 'renderer' });
    root.textContent = `${reply} — Centre Soutien v${appVersion}`;
  } catch (error) {
    root.textContent = `IPC error: ${String(error)}`;
  }
}

void render();
