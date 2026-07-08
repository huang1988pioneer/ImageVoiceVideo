import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Cross-platform `which` – returns full path or null */
export async function which(cmd: string): Promise<string | null> {
  try {
    const isWin = process.platform === 'win32';
    const { stdout } = await execAsync(isWin ? `where ${cmd}` : `which ${cmd}`);
    const path = stdout.trim().split(/\r?\n/)[0];
    return path || null;
  } catch {
    return null;
  }
}
