import { useState, useEffect, useCallback } from 'react';
import { BookPage } from '../types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed';

export interface UseGenerationJobResult {
  /** Current lifecycle status of the job. */
  status: JobStatus;
  /** Human-readable progress message from the server. */
  message: string;
  /** Pages as they arrive — index corresponds to page number. */
  pages: BookPage[];
  /** Cover image (data URL), set when the server finishes the cover. */
  coverImage: string | null;
  /** Error message if status === 'failed'. */
  error: string | null;
  /**
   * Start a new generation job.
   * Returns the jobId on success, or throws on network/server error.
   */
  startJob: (payload: GenerationPayload) => Promise<string>;
  /** Reset all state back to idle. */
  reset: () => void;
}

export interface GenerationPayload {
  userId: string;
  storyText: string;
  stylePrompt: string;
  styleRefBase64?: string;
  characters: Array<{ name: string; description: string; photoBase64?: string }>;
  exportFormat: string;
  aspectRatio: '1:1' | '4:3' | '9:16';
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export const useGenerationJob = (): UseGenerationJobResult => {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>('idle');
  const [message, setMessage] = useState('');
  const [pages, setPages] = useState<BookPage[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── POST to /api/jobs/book ─────────────────────────────────────────────────
  const startJob = useCallback(async (payload: GenerationPayload): Promise<string> => {
    setStatus('pending');
    setMessage('Starting…');
    setPages([]);
    setCoverImage(null);
    setError(null);

    const res = await fetch('/api/jobs/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as any).error ?? `Server error ${res.status}`;
      setStatus('failed');
      setError(msg);
      throw new Error(msg);
    }

    const { jobId: id } = await res.json();
    setJobId(id);
    return id;
  }, []);

  // ── SSE stream listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.addEventListener('status', (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setStatus(d.status as JobStatus);
      setMessage(d.message ?? '');
    });

    es.addEventListener('page_ready', (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setPages(prev => {
        const updated = [...prev];
        updated[d.index] = {
          id: `page-${d.index}`,
          originalText: d.text ?? '',
          processedImage: d.image,
          status: 'completed',
          assignments: [],
          isSpread: false,
        };
        return updated;
      });
    });

    es.addEventListener('page_error', (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setPages(prev => {
        const updated = [...prev];
        updated[d.index] = {
          id: `page-${d.index}`,
          originalText: '',
          processedImage: undefined,
          status: 'error',
          assignments: [],
          isSpread: false,
        };
        return updated;
      });
    });

    es.addEventListener('cover_ready', (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      setCoverImage(d.image);
    });

    es.addEventListener('done', () => {
      setStatus('done');
      es.close();
    });

    // Named 'error' event (server-sent error payload)
    es.addEventListener('error', (e: MessageEvent) => {
      if (e.data) {
        const d = JSON.parse(e.data);
        setError(d.message ?? 'Generation failed');
        setStatus('failed');
      } else {
        // EventSource connection error (no data = transport failure)
        setError('Connection lost. Please try again.');
        setStatus('failed');
      }
      es.close();
    });

    return () => {
      es.close();
    };
  }, [jobId]);

  const reset = useCallback(() => {
    setJobId(null);
    setStatus('idle');
    setMessage('');
    setPages([]);
    setCoverImage(null);
    setError(null);
  }, []);

  return { status, message, pages, coverImage, error, startJob, reset };
};
