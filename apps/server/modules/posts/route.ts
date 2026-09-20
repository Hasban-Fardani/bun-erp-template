import { Hono } from "hono";
import type { AppContext } from "../../context.ts";
import type { AppVariables } from "../../http/app.ts";
import { ApiError, ok, parseInput } from "../../http/errors.ts";
import { requirePermission } from "../identity/policy.ts";
import { ACTION_PERMISSION } from "./policy.ts";
import { CreatePostInput, ListPostsInput, UpdatePostInput } from "./schema.ts";
import { createPost, deletePost, findPost, listPosts, type PostActor, updatePost } from "./service.ts";

/** Route tipis: validasi → policy → service → envelope. Actor menyusun audit. */
export function postRoutes(ctx: AppContext, fallbackOrganizationId: string): Hono<{ Variables: AppVariables }> {
  return new Hono<{ Variables: AppVariables }>()
    .get("/", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.list);
      const input = parseInput(ListPostsInput, c.req.query());
      const { items, total } = await listPosts(ctx.db, actor.organizationId ?? fallbackOrganizationId, input);
      return ok(c, { items, total, limit: input.limit, offset: input.offset });
    })
    .get("/:id", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.read);
      const post = await findPost(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"));
      if (!post) throw ApiError.notFound("Post not found");
      return ok(c, post);
    })
    .post("/", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.create);
      const input = parseInput(CreatePostInput, await c.req.json());
      return ok(
        c,
        await createPost(ctx.db, actor.organizationId ?? fallbackOrganizationId, input, {
          userId: actor.userId,
          traceId: actor.traceId,
          label: actor.label,
        }),
      );
    })
    .patch("/:id", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.update);
      const input = parseInput(UpdatePostInput, await c.req.json());
      return ok(
        c,
        await updatePost(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"), input, {
          userId: actor.userId,
          traceId: actor.traceId,
          label: actor.label,
        }),
      );
    })
    .delete("/:id", async (c) => {
      const actor = await requirePermission(c, ctx, ACTION_PERMISSION.delete);
      return ok(
        c,
        await deletePost(ctx.db, actor.organizationId ?? fallbackOrganizationId, c.req.param("id"), {
          userId: actor.userId,
          traceId: actor.traceId,
          label: actor.label,
        }),
      );
    });
}

export type { PostActor };
