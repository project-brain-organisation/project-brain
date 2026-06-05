/**
 * InternalMcpController unit tests — list-projects handler (step 05-01, scoped)
 *
 * Test Budget: 2 distinct behaviors × 1 = 2 unit tests
 * Behaviors:
 *   B1: listProjects delegates to ProjectsService.findAllByUser with the extracted user ID
 *   B2: listProjects throws UnauthorizedException when x-mcp-user-id header is absent
 *
 * Only ProjectsService is exercised here; all other injected services are no-op stubs.
 * The controller is instantiated directly — no NestJS TestingModule overhead.
 */

import { UnauthorizedException } from '@nestjs/common';
import { InternalMcpController } from '../../src/internal-mcp/internal-mcp.controller';
import type { ProjectsService } from '../../src/projects/projects.service';

function makeRequest(userId?: string): { header: (name: string) => string | undefined } {
  return {
    header: (name: string) => (name === 'x-mcp-user-id' ? userId : undefined),
  };
}

function makeProjectsService(rows: unknown[] = []): ProjectsService {
  return {
    findAllByUser: jest.fn().mockResolvedValue(rows),
    assertOwnership: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  } as unknown as ProjectsService;
}

function makeStubService(): unknown {
  return {} as unknown;
}

function makeController(projectsService: ProjectsService): InternalMcpController {
  return new InternalMcpController(
    makeStubService() as never,
    makeStubService() as never,
    makeStubService() as never,
    makeStubService() as never,
    projectsService,
  );
}

describe('InternalMcpController — listProjects', () => {
  it('B1: delegates to ProjectsService.findAllByUser with the user ID from the header', async () => {
    const projects = [{ id: 'proj-1', name: 'Alpha' }];
    const projectsService = makeProjectsService(projects);
    const controller = makeController(projectsService);

    const result = await controller.listProjects(makeRequest('user-abc') as never);

    expect(projectsService.findAllByUser).toHaveBeenCalledWith('user-abc');
    expect(result).toEqual(projects);
  });

  it('B2: throws UnauthorizedException when x-mcp-user-id header is absent', () => {
    const controller = makeController(makeProjectsService());

    expect(() => controller.listProjects(makeRequest(undefined) as never)).toThrow(
      UnauthorizedException,
    );
  });
});
