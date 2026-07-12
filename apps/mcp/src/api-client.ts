type RequestContext = { userId: string; scope?: string };

type RequestResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalKey: string,
  ) {}

  private async request(
    method: 'GET' | 'POST',
    path: string,
    { userId, scope }: RequestContext,
    body?: unknown,
  ): Promise<RequestResult> {
    const headers: Record<string, string> = {
      'x-mcp-internal-key': this.internalKey,
      'x-mcp-user-id': userId,
      'Content-Type': 'application/json',
    };
    if (scope) {
      headers['x-mcp-scope'] = scope;
    }

    const res = await fetch(`${this.baseUrl}/api/internal/mcp/${path}`, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    const text = (await res.text()).trim();

    if (!res.ok) {
      return { ok: false, status: res.status, error: text || 'Request failed' };
    }

    return { ok: true, status: res.status, data: text ? JSON.parse(text) : {} };
  }

  private get(path: string, ctx: RequestContext) {
    return this.request('GET', path, ctx);
  }

  private post(path: string, ctx: RequestContext, body?: unknown) {
    return this.request('POST', path, ctx, body);
  }

  listProjects(userId: string, scope?: string) {
    return this.post('list-projects', { userId, scope });
  }

  createProject(userId: string, name: string, emoji?: string, scope?: string) {
    return this.post('create-project', { userId, scope }, { name, emoji });
  }

  getThought(userId: string, thoughtId: string, scope?: string) {
    return this.get(`thought/${thoughtId}`, { userId, scope });
  }

  listThoughts(userId: string, params: { projectId: string }, scope?: string) {
    return this.post('list-thoughts', { userId, scope }, params);
  }

  createThought(
    userId: string,
    params: { body: string; title?: string; projectId: string },
    scope?: string,
  ) {
    return this.post('create-thought', { userId, scope }, params);
  }

  editThought(userId: string, params: { thoughtId: string; body: string }, scope?: string) {
    return this.post('edit-thought', { userId, scope }, params);
  }

  removeThought(userId: string, thoughtId: string, scope?: string) {
    return this.post('remove-thought', { userId, scope }, { thoughtId });
  }

  elaborate(userId: string, chunkId: string, scope?: string) {
    return this.get(`elaborate/${chunkId}`, { userId, scope });
  }

  thoughtToPrompt(userId: string, thoughtId: string, scope?: string) {
    return this.get(`thought-to-prompt/${thoughtId}`, { userId, scope });
  }

  remember(userId: string, query: string, n: number, projectId?: string, scope?: string) {
    return this.post('remember', { userId, scope }, { query, n, projectId });
  }

  listLabels(userId: string, projectId: string, scope?: string) {
    return this.post('list-labels', { userId, scope }, { projectId });
  }

  createLabel(
    userId: string,
    params: { name: string; color?: string; projectId: string },
    scope?: string,
  ) {
    return this.post('create-label', { userId, scope }, params);
  }

  updateLabel(
    userId: string,
    params: { labelId: string; name?: string; color?: string; isEdge?: boolean },
    scope?: string,
  ) {
    return this.post('update-label', { userId, scope }, params);
  }

  removeLabel(userId: string, labelId: string, scope?: string) {
    return this.post('remove-label', { userId, scope }, { labelId });
  }

  addLabelToThought(
    userId: string,
    params: { thoughtId: string; labelId: string; projectId: string },
    scope?: string,
  ) {
    return this.post('add-label-to-thought', { userId, scope }, params);
  }

  removeLabelFromThought(
    userId: string,
    params: { thoughtId: string; labelId: string },
    scope?: string,
  ) {
    return this.post('remove-label-from-thought', { userId, scope }, params);
  }

  getThoughtLabels(userId: string, thoughtId: string, scope?: string) {
    return this.get(`thought-labels/${thoughtId}`, { userId, scope });
  }

  setLabelEdge(userId: string, labelId: string, isEdge: boolean, scope?: string) {
    return this.post('set-label-edge', { userId, scope }, { labelId, isEdge });
  }

  setThoughtColor(userId: string, thoughtId: string, hex: string, scope?: string) {
    return this.post('set-thought-color', { userId, scope }, { thoughtId, hex });
  }

  clearThoughtColor(userId: string, thoughtId: string, scope?: string) {
    return this.post('clear-thought-color', { userId, scope }, { thoughtId });
  }
}
