export interface RuntimeContext {
  apiPort: number;
  uiPort: number;
  uiUrl: string;
}

const DEFAULT_CONTEXT: RuntimeContext = {
  apiPort: 3001,
  uiPort: 3001,
  uiUrl: 'http://localhost:3001',
};

let runtimeContext: RuntimeContext = DEFAULT_CONTEXT;

export function setRuntimeContext(context: RuntimeContext): void {
  runtimeContext = context;
}

export function getRuntimeContext(): RuntimeContext {
  return runtimeContext;
}

export function intakeUrl(sessionId: string): string {
  return `${runtimeContext.uiUrl}/session/${encodeURIComponent(sessionId)}`;
}
