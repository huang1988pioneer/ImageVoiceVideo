import type { LipsyncProvider } from './types';
import { createReplicateProvider, REPLICATE_DEFAULT_MODEL } from './replicate';

export type { LipsyncProvider, LipsyncJobStatus, LipsyncStatusResult } from './types';
export { REPLICATE_DEFAULT_MODEL };

export interface LipsyncAvailability {
  available: boolean;
  provider: string | null;
  model: string | null;
  reason?: string;
}

/**
 * Resolve lipsync provider from env.
 * - LIPSYNC_PROVIDER=disabled → off
 * - LIPSYNC_PROVIDER=replicate (default) + REPLICATE_API_TOKEN → on
 */
export function getLipsyncAvailability(): LipsyncAvailability {
  const providerEnv = (process.env.LIPSYNC_PROVIDER || 'replicate').toLowerCase().trim();
  if (providerEnv === 'disabled' || providerEnv === 'off' || providerEnv === 'none') {
    return {
      available: false,
      provider: null,
      model: null,
      reason: 'LIPSYNC_PROVIDER 已關閉',
    };
  }

  if (providerEnv === 'replicate' || providerEnv === '') {
    const token = process.env.REPLICATE_API_TOKEN?.trim();
    if (!token) {
      return {
        available: false,
        provider: 'replicate',
        model: process.env.LIPSYNC_MODEL || REPLICATE_DEFAULT_MODEL,
        reason: '未設定 REPLICATE_API_TOKEN',
      };
    }
    return {
      available: true,
      provider: 'replicate',
      model: process.env.LIPSYNC_MODEL || REPLICATE_DEFAULT_MODEL,
    };
  }

  return {
    available: false,
    provider: providerEnv,
    model: null,
    reason: `不支援的 LIPSYNC_PROVIDER: ${providerEnv}`,
  };
}

export function createLipsyncProvider(): LipsyncProvider | null {
  const avail = getLipsyncAvailability();
  if (!avail.available) return null;

  if (avail.provider === 'replicate') {
    const token = process.env.REPLICATE_API_TOKEN!.trim();
    return createReplicateProvider(token, avail.model || undefined);
  }
  return null;
}
