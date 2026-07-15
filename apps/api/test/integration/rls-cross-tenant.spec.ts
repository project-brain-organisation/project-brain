/**
 * RLS cross-tenant isolation — step 03-03
 *
 * Scenario: "a second user's tenant context returns zero rows and is denied
 * writes for every RLS-protected table"
 *
 * Integration test (single-example by design): verifies that Postgres RLS
 * policies actually enforce tenant isolation, not just that they are declared.
 * This is the behavioral proof referenced by the EXEMPT FROM PARADIGM note in
 * steps 01-01 through 03-02.
 *
 * SELF-SKIP PATTERN: when neither DATABASE_URL_APP nor DATABASE_URL is set
 * (no live DB available), the test suite skips gracefully — mirroring the
 * pattern used by full-smoke.spec.ts.
 *
 * Assertions:
 *   1. Under asUser(userA), SELECT on project_meta returns only userA's rows.
 *   2. Under asUser(userA), SELECT on thoughts/labels/relationships/chunks
 *      returns zero rows owned by userB (using clause enforced).
 *   3. Under asUser(userB), SELECT on project_meta/thoughts/labels/
 *      relationships/chunks returns zero rows owned by userA.
 *   4. userB's PUBLIC project IS readable by userA (public_read policy).
 *   5. Under asUser(userA), an INSERT assigning owner_id = userB is rejected
 *      (withCheck violation — RLS error code 42501 or 'row-level security').
 *
 * assertOwnership remains in all services during this phase (criterion 4) —
 * this test proves RLS isolation independently through the owner pool seed
 * + asUser read/write path.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../../src/database/database.module';
import { DatabaseService } from '../../src/database/database.service';
import { eq, and } from 'drizzle-orm';
import {
  users,
  entities,
  projectMeta,
  thoughts,
  labels,
  relationships,
  chunks,
  projectSubscriptions,
} from '../../src/database/schema/index';

// ── DB availability guard ─────────────────────────────────────────────────────
const DB_AVAILABLE =
  !!process.env.DATABASE_URL_APP || !!process.env.DATABASE_URL;
const describeOrSkip = DB_AVAILABLE ? describe : describe.skip;

// ── Test identifiers (fixed UUIDs so cleanup is deterministic) ────────────────
const userAId = crypto.randomUUID();
const userBId = crypto.randomUUID();

// These are populated during beforeAll and used across assertions
let projectAId: string;
let projectBPrivateId: string;
let projectBPublicId: string;
let thoughtAId: string;
let thoughtBId: string;
let labelAId: string;
let labelBId: string;
let relationshipAId: string;
let relationshipBId: string;
let chunkAId: string;
let chunkBId: string;
let thoughtBPublicId: string;
let labelBPublicId: string;
let relationshipBPublicId: string;
let chunkBPublicId: string;

describeOrSkip('RLS cross-tenant isolation (integration)', () => {
  let app: TestingModule;
  let db: DatabaseService;

  // ── Seed setup (owner pool — bypasses RLS) ──────────────────────────────────
  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    db = app.get(DatabaseService);
    const ownerDb = db.ownerDb;

    // Insert users
    await ownerDb.insert(users).values([
      { id: userAId, username: `rls-test-user-a-${userAId.slice(0, 8)}` },
      { id: userBId, username: `rls-test-user-b-${userBId.slice(0, 8)}` },
    ]);

    // ── userA: one private project + one thought + one label + one relationship
    //    + one chunk ────────────────────────────────────────────────────────────

    // Project A entity row
    projectAId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: projectAId,
      projectId: projectAId, // self-referential for project roots
      type: 'project',
    });
    await ownerDb.insert(projectMeta).values({
      id: projectAId,
      ownerId: userAId,
      name: 'User A Project',
      isPublic: false,
    });

    // Thought A
    thoughtAId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: thoughtAId,
      projectId: projectAId,
      type: 'thought',
    });
    await ownerDb.insert(thoughts).values({
      id: thoughtAId,
      projectId: projectAId,
      ownerId: userAId,
      title: 'Thought A',
      body: 'User A body',
    });

    // Label A
    labelAId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: labelAId,
      projectId: projectAId,
      type: 'label',
    });
    await ownerDb.insert(labels).values({
      id: labelAId,
      projectId: projectAId,
      ownerId: userAId,
      name: 'Label A',
    });

    // Relationship A (tag: thought → label)
    relationshipAId = crypto.randomUUID();
    await ownerDb.insert(relationships).values({
      id: relationshipAId,
      projectId: projectAId,
      ownerId: userAId,
      sourceId: thoughtAId,
      targetId: labelAId,
      kind: 'tag',
    });

    // Chunk A (bypass embedding pipeline — insert directly)
    chunkAId = crypto.randomUUID();
    await ownerDb.insert(chunks).values({
      id: chunkAId,
      thoughtId: thoughtAId,
      projectId: projectAId,
      ownerId: userAId,
      body: 'chunk body A',
      chunkIndex: 0,
    });

    // ── userB: one PRIVATE project + one PUBLIC project, each with a full set
    //    of rows ────────────────────────────────────────────────────────────────

    // Private project B entity
    projectBPrivateId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: projectBPrivateId,
      projectId: projectBPrivateId,
      type: 'project',
    });
    await ownerDb.insert(projectMeta).values({
      id: projectBPrivateId,
      ownerId: userBId,
      name: 'User B Private Project',
      isPublic: false,
    });

    // Thought B (under private project B)
    thoughtBId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: thoughtBId,
      projectId: projectBPrivateId,
      type: 'thought',
    });
    await ownerDb.insert(thoughts).values({
      id: thoughtBId,
      projectId: projectBPrivateId,
      ownerId: userBId,
      title: 'Thought B',
      body: 'User B body',
    });

    // Label B (under private project B)
    labelBId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: labelBId,
      projectId: projectBPrivateId,
      type: 'label',
    });
    await ownerDb.insert(labels).values({
      id: labelBId,
      projectId: projectBPrivateId,
      ownerId: userBId,
      name: 'Label B',
    });

    // Relationship B (tag: thoughtB → labelB)
    relationshipBId = crypto.randomUUID();
    await ownerDb.insert(relationships).values({
      id: relationshipBId,
      projectId: projectBPrivateId,
      ownerId: userBId,
      sourceId: thoughtBId,
      targetId: labelBId,
      kind: 'tag',
    });

    // Chunk B (under private project B)
    chunkBId = crypto.randomUUID();
    await ownerDb.insert(chunks).values({
      id: chunkBId,
      thoughtId: thoughtBId,
      projectId: projectBPrivateId,
      ownerId: userBId,
      body: 'chunk body B',
      chunkIndex: 0,
    });

    // Public project B — with a full set of content rows so the public_read
    // policies on thoughts/labels/relationships/chunks can be exercised.
    projectBPublicId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: projectBPublicId,
      projectId: projectBPublicId,
      type: 'project',
    });
    await ownerDb.insert(projectMeta).values({
      id: projectBPublicId,
      ownerId: userBId,
      name: 'User B Public Project',
      isPublic: true,
    });

    thoughtBPublicId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: thoughtBPublicId,
      projectId: projectBPublicId,
      type: 'thought',
    });
    await ownerDb.insert(thoughts).values({
      id: thoughtBPublicId,
      projectId: projectBPublicId,
      ownerId: userBId,
      title: 'Public Thought B',
      body: 'User B public body',
    });

    labelBPublicId = crypto.randomUUID();
    await ownerDb.insert(entities).values({
      id: labelBPublicId,
      projectId: projectBPublicId,
      type: 'label',
    });
    await ownerDb.insert(labels).values({
      id: labelBPublicId,
      projectId: projectBPublicId,
      ownerId: userBId,
      name: 'Public Label B',
    });

    relationshipBPublicId = crypto.randomUUID();
    await ownerDb.insert(relationships).values({
      id: relationshipBPublicId,
      projectId: projectBPublicId,
      ownerId: userBId,
      sourceId: thoughtBPublicId,
      targetId: labelBPublicId,
      kind: 'tag',
    });

    chunkBPublicId = crypto.randomUUID();
    await ownerDb.insert(chunks).values({
      id: chunkBPublicId,
      thoughtId: thoughtBPublicId,
      projectId: projectBPublicId,
      ownerId: userBId,
      body: 'chunk body B public',
      chunkIndex: 0,
    });
  });

  // ── Cleanup (owner pool) ────────────────────────────────────────────────────
  afterAll(async () => {
    // Deleting users cascades to all owned rows via FK cascade chains.
    const ownerDb = db.ownerDb;
    await ownerDb.delete(users).where(eq(users.id, userAId));
    await ownerDb.delete(users).where(eq(users.id, userBId));
    await app.close();
  });

  // ── Assertion 1 & 2: userA sees only own rows (zero of userB's) ─────────────
  it('userA sees only their own project_meta row', async () => {
    const rows = await db.asUser(userAId, (tx) =>
      tx.select().from(projectMeta),
    );
    const ids = rows.map((r) => r.id);
    // userA's project must be visible
    expect(ids).toContain(projectAId);
    // userB's PRIVATE project must NOT be visible
    expect(ids).not.toContain(projectBPrivateId);
  });

  // Scoped to userB's PRIVATE project: public-project content owned by userB is
  // now legitimately visible via the *_public_read policies, so isolation is
  // asserted against the private project specifically.
  it("userA sees zero thoughts in userB's private project", async () => {
    const rows = await db.asUser(userAId, (tx) =>
      tx
        .select()
        .from(thoughts)
        .where(and(eq(thoughts.ownerId, userBId), eq(thoughts.projectId, projectBPrivateId))),
    );
    expect(rows).toHaveLength(0);
  });

  it("userA sees zero labels in userB's private project", async () => {
    const rows = await db.asUser(userAId, (tx) =>
      tx
        .select()
        .from(labels)
        .where(and(eq(labels.ownerId, userBId), eq(labels.projectId, projectBPrivateId))),
    );
    expect(rows).toHaveLength(0);
  });

  it("userA sees zero relationships in userB's private project", async () => {
    const rows = await db.asUser(userAId, (tx) =>
      tx
        .select()
        .from(relationships)
        .where(
          and(eq(relationships.ownerId, userBId), eq(relationships.projectId, projectBPrivateId)),
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it("userA sees zero chunks in userB's private project", async () => {
    const rows = await db.asUser(userAId, (tx) =>
      tx
        .select()
        .from(chunks)
        .where(and(eq(chunks.ownerId, userBId), eq(chunks.projectId, projectBPrivateId))),
    );
    expect(rows).toHaveLength(0);
  });

  // ── Assertion 3: userB sees zero rows owned by userA ────────────────────────
  it('userB sees zero project_meta rows owned by userA', async () => {
    const rows = await db.asUser(userBId, (tx) =>
      tx
        .select()
        .from(projectMeta)
        .where(eq(projectMeta.ownerId, userAId)),
    );
    expect(rows).toHaveLength(0);
  });

  it('userB sees zero thoughts owned by userA', async () => {
    const rows = await db.asUser(userBId, (tx) =>
      tx.select().from(thoughts).where(eq(thoughts.ownerId, userAId)),
    );
    expect(rows).toHaveLength(0);
  });

  it('userB sees zero labels owned by userA', async () => {
    const rows = await db.asUser(userBId, (tx) =>
      tx.select().from(labels).where(eq(labels.ownerId, userAId)),
    );
    expect(rows).toHaveLength(0);
  });

  it('userB sees zero relationships owned by userA', async () => {
    const rows = await db.asUser(userBId, (tx) =>
      tx
        .select()
        .from(relationships)
        .where(eq(relationships.ownerId, userAId)),
    );
    expect(rows).toHaveLength(0);
  });

  it('userB sees zero chunks owned by userA', async () => {
    const rows = await db.asUser(userBId, (tx) =>
      tx.select().from(chunks).where(eq(chunks.ownerId, userAId)),
    );
    expect(rows).toHaveLength(0);
  });

  // ── Assertion 4: public_read policy — userA CAN read userB's PUBLIC project ─
  it("userA can read userB's public project via public_read policy", async () => {
    const rows = await db.asUser(userAId, (tx) =>
      tx
        .select()
        .from(projectMeta)
        .where(eq(projectMeta.id, projectBPublicId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(projectBPublicId);
    expect(rows[0].isPublic).toBe(true);
  });

  // ── Assertion 4b: public content is readable by a non-owner ─────────────────
  it("userA can read the thoughts/labels/relationships/chunks of userB's public project", async () => {
    const [t, l, r, c] = await db.asUser(userAId, (tx) =>
      Promise.all([
        tx.select().from(thoughts).where(eq(thoughts.projectId, projectBPublicId)),
        tx.select().from(labels).where(eq(labels.projectId, projectBPublicId)),
        tx.select().from(relationships).where(eq(relationships.projectId, projectBPublicId)),
        tx.select().from(chunks).where(eq(chunks.projectId, projectBPublicId)),
      ]),
    );
    expect(t.map((x) => x.id)).toContain(thoughtBPublicId);
    expect(l.map((x) => x.id)).toContain(labelBPublicId);
    expect(r.map((x) => x.id)).toContain(relationshipBPublicId);
    expect(c.map((x) => x.id)).toContain(chunkBPublicId);
  });

  // ── Assertion 4c: private content stays hidden even to a would-be reader ─────
  it("userA still cannot read the content of userB's private project", async () => {
    const rows = await db.asUser(userAId, (tx) =>
      tx.select().from(thoughts).where(eq(thoughts.projectId, projectBPrivateId)),
    );
    expect(rows).toHaveLength(0);
  });

  // ── Assertion 4d: read access is read-only — writes to public content fail ───
  it("userA cannot UPDATE a thought in userB's public project (no write policy)", async () => {
    const result = await db.asUser(userAId, (tx) =>
      tx
        .update(thoughts)
        .set({ body: 'hijacked' })
        .where(eq(thoughts.id, thoughtBPublicId))
        .returning(),
    );
    // The row is visible for SELECT but the owner-isolation USING clause hides
    // it from UPDATE, so zero rows are affected (no error, no mutation).
    expect(result).toHaveLength(0);
  });

  // ── Assertion 4e: subscriptions are per-user isolated ───────────────────────
  it('a subscription row is visible only to its owning user', async () => {
    await db.asUser(userAId, (tx) =>
      tx.insert(projectSubscriptions).values({ userId: userAId, projectId: projectBPublicId }),
    );
    const aRows = await db.asUser(userAId, (tx) => tx.select().from(projectSubscriptions));
    expect(aRows.map((r) => r.projectId)).toContain(projectBPublicId);

    const bRows = await db.asUser(userBId, (tx) =>
      tx
        .select()
        .from(projectSubscriptions)
        .where(eq(projectSubscriptions.projectId, projectBPublicId)),
    );
    expect(bRows).toHaveLength(0);
  });

  // ── Assertion 5: withCheck rejects INSERT as wrong owner ────────────────────
  it('withCheck rejects INSERT into thoughts when owner_id != current user', async () => {
    // The entity row for this insert is seeded via owner pool (bypasses RLS)
    // so the INSERT target entity exists; the RLS withCheck on thoughts must
    // reject the row because owner_id (userB) != current_user (userA).
    const fakeTightId = crypto.randomUUID();

    // First seed the entity row via owner pool (needs to exist for FK)
    await db.ownerDb.insert(entities).values({
      id: fakeTightId,
      projectId: projectAId,
      type: 'thought',
    });

    try {
      await expect(
        db.asUser(userAId, (tx) =>
          tx.insert(thoughts).values({
            id: fakeTightId,
            projectId: projectAId,
            ownerId: userBId, // intentionally wrong owner
            title: 'Rejected Thought',
            body: 'Should be rejected by withCheck',
          }),
        ),
      ).rejects.toThrow();
    } finally {
      // Cleanup the entity row regardless of outcome
      await db.ownerDb
        .delete(entities)
        .where(eq(entities.id, fakeTightId));
    }
  });
});
