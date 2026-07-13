export type LipsyncJobStatus =
  | 'starting'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface LipsyncStartInput {
  image: Buffer;
  audio: Buffer;
  mimeImage: string;
  mimeAudio: string;
}

export interface LipsyncStartResult {
  jobId: string;
}

export interface LipsyncStatusResult {
  status: LipsyncJobStatus;
  /** Public or signed URL when succeeded */
  videoUrl?: string | null;
  error?: string | null;
  /** Optional progress 0–100 if provider reports it */
  progress?: number | null;
}

export interface LipsyncProvider {
  readonly id: string;
  start(input: LipsyncStartInput): Promise<LipsyncStartResult>;
  status(jobId: string): Promise<LipsyncStatusResult>;
}
