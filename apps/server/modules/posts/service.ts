import { and, eq, ilike, sql } from "drizzle-orm";
import { ApiError } from "../../http/errors.ts";
import type { Database } from "../../platform/database/index.ts";
import { recordAudit, snapshot } from "../audit/service.ts";
import { posts } from "./data.ts";
import type { CreatePostInput, ListPostsInput, UpdatePostInput } from "./schema.ts";

export type Post = typeof posts.$inferSelect;

export type PostActor = { userId: string; label: string; traceId: string };

export async function listPosts(
  db: Database,
  organizationId: string,
  input: ListPostsInput,
): Promise<{ items: Post[]; total: number }> {
  const where = and(
    eq(posts.organizationId, organizationId),
    input.search ? ilike(posts.title, `%${input.search}%`) : undefined,
  );

  const [items, count] = await Promise.all([
    db.select().from(posts).where(where).orderBy(posts.createdAt).limit(input.limit).offset(input.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(posts).where(where),
  ]);

  return { items, total: count[0]?.total ?? 0 };
}

export async function findPost(db: Database, organizationId: string, id: string): Promise<Post | undefined> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.organizationId, organizationId), eq(posts.id, id)))
    .limit(1);
  return rows[0];
}

export async function createPost(db: Database, organizationId: string, input: CreatePostInput, actor: PostActor) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.slug, input.slug)))
      .limit(1);
    if (existing.length > 0) throw ApiError.conflict("Post slug already exists");

    const rows = await tx
      .insert(posts)
      .values({
        organizationId,
        authorId: actor.userId,
        title: input.title,
        slug: input.slug,
        content: input.content,
        published: input.published,
      })
      .returning();
    const post = rows[0] as Post;

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "post.created",
      subjectType: "post",
      subjectId: post.id,
      after: snapshot("post", post as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });
    return post;
  });
}

export async function updatePost(
  db: Database,
  organizationId: string,
  id: string,
  input: UpdatePostInput,
  actor: PostActor,
) {
  return db.transaction(async (tx) => {
    const beforeRows = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.id, id)))
      .limit(1);
    const before = beforeRows[0];
    if (!before) throw ApiError.notFound("Post not found");

    if (input.slug !== undefined && input.slug !== before.slug) {
      const clash = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.organizationId, organizationId), eq(posts.slug, input.slug)))
        .limit(1);
      if (clash.length > 0) throw ApiError.conflict("Post slug already exists");
    }

    const rows = await tx
      .update(posts)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(posts.organizationId, organizationId), eq(posts.id, id)))
      .returning();
    const updated = rows[0] as Post;

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "post.updated",
      subjectType: "post",
      subjectId: id,
      before: snapshot("post", before as unknown as Record<string, unknown>),
      after: snapshot("post", updated as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });
    return updated;
  });
}

export async function deletePost(db: Database, organizationId: string, id: string, actor: PostActor) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(posts)
      .where(and(eq(posts.organizationId, organizationId), eq(posts.id, id)))
      .returning();
    const deleted = rows[0];
    if (!deleted) throw ApiError.notFound("Post not found");

    await recordAudit(tx as unknown as Database, {
      organizationId,
      actorId: actor.userId,
      actorLabel: actor.label,
      event: "post.deleted",
      subjectType: "post",
      subjectId: id,
      before: snapshot("post", deleted as unknown as Record<string, unknown>),
      traceId: actor.traceId,
    });
    return deleted;
  });
}
