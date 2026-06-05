/**
 * Full smoke test — step 05-02
 *
 * Scenario: end-to-end flow: project create through cascade delete with no orphans
 *
 * Integration test (single-example): verifies service-layer wiring, not domain invariants.
 * Requires DATABASE_URL to be set; skipped in environments without a live database.
 *
 * Flow:
 *   1. Create a user (seeded directly into DB)
 *   2. Create a project via ProjectsService
 *   3. Create a thought with color via ThoughtsService
 *   4. Create a label via LabelsService
 *   5. Tag the thought with the label via RelationshipsService (kind=tag)
 *   6. Create an edge between two thoughts via RelationshipsService (kind=edge)
 *   7. Semantic search scoped to the project via ThoughtsService
 *   8. Delete the project and verify cascade: no orphan entities/relationships/chunks
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../../src/database/database.module';
import { DatabaseService } from '../../src/database/database.service';
import { ProjectsModule } from '../../src/projects/projects.module';
import { ProjectsService } from '../../src/projects/projects.service';
import { WorkspaceModule } from '../../src/workspace/workspace.module';
import { ThoughtsService } from '../../src/workspace/thoughts/thoughts.service';
import { LabelsService } from '../../src/workspace/labels/labels.service';
import { RelationshipsService } from '../../src/workspace/relationships/relationships.service';
import { eq } from 'drizzle-orm';
import { entities, relationships, chunks, users } from '../../src/database/schema/index';

const DB_AVAILABLE = !!process.env.DATABASE_URL;
const describeOrSkip = DB_AVAILABLE ? describe : describe.skip;

describeOrSkip('Smoke test — project create through cascade delete', () => {
  let app: TestingModule;
  let db: DatabaseService;
  let projectsService: ProjectsService;
  let thoughtsService: ThoughtsService;
  let labelsService: LabelsService;
  let relationshipsService: RelationshipsService;

  // Test user seeded directly
  const testUserId = crypto.randomUUID();

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [DatabaseModule, ProjectsModule, WorkspaceModule],
    }).compile();

    db = app.get(DatabaseService);
    projectsService = app.get(ProjectsService);
    thoughtsService = app.get(ThoughtsService);
    labelsService = app.get(LabelsService);
    relationshipsService = app.get(RelationshipsService);

    // Seed a user row
    await db.db.insert(users).values({
      id: testUserId,
      username: `smoke-${testUserId.slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    // Clean up the test user (cascades to projects, entities, etc.)
    await db.db.delete(users).where(eq(users.id, testUserId));
    await app.close();
  });

  it('full project lifecycle completes without orphans', async () => {
    // 1. Create project
    const project = await projectsService.create(testUserId, { name: 'Smoke Project' });
    expect(project).toBeDefined();
    expect(project.id).toBeTruthy();
    const projectId = project.id;

    // 2. Create a thought with color
    const thought1 = await thoughtsService.create(testUserId, {
      projectId,
      title: 'Root Thought',
      body: 'This is the root thought body',
      color: '#ff0000',
    });
    expect(thought1.id).toBeTruthy();
    expect(thought1.color).toBe('#ff0000');

    // 3. Create a second thought for edge testing
    const thought2 = await thoughtsService.create(testUserId, {
      projectId,
      title: 'Second Thought',
      body: 'Connected via edge',
    });

    // 4. Create a label
    const label = await labelsService.create(testUserId, {
      projectId,
      name: 'Test Label',
      color: '#00ff00',
    });
    expect(label.id).toBeTruthy();

    // 5. Tag thought1 with the label (kind=tag)
    const tag = await relationshipsService.create(testUserId, {
      projectId,
      sourceId: thought1.id,
      targetId: label.id,
      kind: 'tag',
    });
    expect(tag.id).toBeTruthy();
    expect(tag.kind).toBe('tag');

    // 6. Create an edge between the two thoughts (kind=edge)
    const edge = await relationshipsService.create(testUserId, {
      projectId,
      sourceId: thought1.id,
      targetId: thought2.id,
      kind: 'edge',
    });
    expect(edge.kind).toBe('edge');

    // 7. Semantic search scoped to project (returns empty array since no real embeddings in test)
    const results = await thoughtsService.semanticSearch(testUserId, projectId, 'root thought');
    expect(Array.isArray(results)).toBe(true);

    // 8. Delete the project — cascade should remove all child entities/relationships/chunks
    const projectEntityId = projectId;
    await db.db.delete(entities).where(eq(entities.id, projectEntityId));

    // Verify cascade: no orphan entities for this project
    const orphanEntities = await db.db
      .select()
      .from(entities)
      .where(eq(entities.projectId, projectId));
    expect(orphanEntities).toHaveLength(0);

    // Verify cascade: no orphan relationships for this project
    const orphanRelationships = await db.db
      .select()
      .from(relationships)
      .where(eq(relationships.projectId, projectId));
    expect(orphanRelationships).toHaveLength(0);

    // Verify cascade: no orphan chunks for this project
    const orphanChunks = await db.db
      .select()
      .from(chunks)
      .where(eq(chunks.projectId, projectId));
    expect(orphanChunks).toHaveLength(0);
  });
});
