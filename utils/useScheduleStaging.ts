import { useEffect, useRef } from 'react';
type StageInput = { text: string };
interface StageContext {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      execute: (input: StageInput) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
}
// Optional browser capability: this only opens the review UI, never writes events.
export function useScheduleStaging(stage: (input: StageInput) => Promise<unknown>) {
  const latest = useRef(stage);
  latest.current = stage;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const ctx = (document as Document & { modelContext?: StageContext }).modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: 'stage_schedule',
            description: '문장을 일정 검토 양식에 넣습니다. 등록하지 않습니다.',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
              additionalProperties: false,
            },
            execute: (input) => latest.current(input),
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
}
