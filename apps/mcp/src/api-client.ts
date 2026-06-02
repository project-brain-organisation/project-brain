export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalKey: string,
  ) {}

  private headers(userId: string, scope?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'x-mcp-internal-key': this.internalKey,
      'x-mcp-user-id': userId,
      'Content-Type': 'application/json',
    };

    if (scope) {
      headers['x-mcp-scope'] = scope;
    }

    return headers;
  }

  private async toResult<T>(res: Response): Promise<
    | { ok: true; status: number; data: T }
    | { ok: false; status: number; error: string }
  > {
    const raw = await res.text();
    const text = raw.trim();

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: text || 'Request failed',
      };
    }

    if (!text) {
      return {
        ok: true,
        status: res.status,
        data: {} as T,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: JSON.parse(text) as T,
    };
  }

  async listProjects(userId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/list-projects`, {
      method: 'POST',
      headers: this.headers(userId, scope),
    });

    return this.toResult<unknown>(res);
  }

  async getThought(userId: string, thoughtId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/thought/${thoughtId}`, {
      method: 'GET',
      headers: this.headers(userId, scope),
    });

    return this.toResult<unknown>(res);
  }

  async createProject(userId: string, title: string, body?: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/create-project`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ title, body }),
    });

    return this.toResult<unknown>(res);
  }

  async listThoughts(
    userId: string,
    params: { parentId?: string; projectId?: string },
    scope?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/list-thoughts`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify(params),
    });

    return this.toResult<unknown>(res);
  }

  async createThought(
    userId: string,
    params: { body: string; title?: string; parentId?: string },
    scope?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/create-thought`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify(params),
    });

    return this.toResult<unknown>(res);
  }

  async editThought(
    userId: string,
    params: { thoughtId: string; body?: string; title?: string; parentId?: string },
    scope?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/edit-thought`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify(params),
    });

    return this.toResult<unknown>(res);
  }

  async removeThought(userId: string, thoughtId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/remove-thought`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ thoughtId }),
    });

    return this.toResult<unknown>(res);
  }

  async elaborate(userId: string, chunkId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/elaborate/${chunkId}`, {
      method: 'GET',
      headers: this.headers(userId, scope),
    });

    return this.toResult<unknown>(res);
  }

  async thoughtToPrompt(userId: string, thoughtId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/thought-to-prompt/${thoughtId}`, {
      method: 'GET',
      headers: this.headers(userId, scope),
    });

    return this.toResult<unknown>(res);
  }

  async listLabels(userId: string, projectId?: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/list-labels`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ projectId }),
    });

    return this.toResult<unknown>(res);
  }

  async createLabel(
    userId: string,
    params: { name: string; color?: string; projectId?: string },
    scope?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/create-label`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify(params),
    });

    return this.toResult<unknown>(res);
  }

  async updateLabel(
    userId: string,
    params: { labelId: string; name?: string; color?: string; isEdge?: boolean },
    scope?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/update-label`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify(params),
    });

    return this.toResult<unknown>(res);
  }

  async removeLabel(userId: string, labelId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/remove-label`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ labelId }),
    });

    return this.toResult<unknown>(res);
  }

  async addLabelToThought(
    userId: string,
    params: { thoughtId: string; labelId: string },
    scope?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/add-label-to-thought`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify(params),
    });

    return this.toResult<unknown>(res);
  }

  async removeLabelFromThought(
    userId: string,
    params: { thoughtId: string; labelId: string },
    scope?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/remove-label-from-thought`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify(params),
    });

    return this.toResult<unknown>(res);
  }

  async getThoughtLabels(userId: string, thoughtId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/thought-labels/${thoughtId}`, {
      method: 'GET',
      headers: this.headers(userId, scope),
    });

    return this.toResult<unknown>(res);
  }

  async setLabelEdge(userId: string, labelId: string, isEdge: boolean, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/set-label-edge`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ labelId, isEdge }),
    });

    return this.toResult<unknown>(res);
  }

  async setThoughtColor(userId: string, thoughtId: string, hex: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/set-thought-color`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ thoughtId, hex }),
    });

    return this.toResult<unknown>(res);
  }

  async clearThoughtColor(userId: string, thoughtId: string, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/clear-thought-color`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ thoughtId }),
    });

    return this.toResult<unknown>(res);
  }

  async remember(userId: string, query: string, n: number, scope?: string) {
    const res = await fetch(`${this.baseUrl}/api/internal/mcp/remember`, {
      method: 'POST',
      headers: this.headers(userId, scope),
      body: JSON.stringify({ query, n }),
    });

    return this.toResult<unknown>(res);
  }
}
