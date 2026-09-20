import * as z from "zod";

export const createPostSchema = z.strictObject({
  title: z.string().trim().min(3).max(160),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(140)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase words separated by dashes"),
  content: z.string().max(20_000).default(""),
  published: z.boolean().default(false),
});

export const updatePostSchema = z.strictObject({
  title: z.string().trim().min(3).max(160).optional(),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(140)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  content: z.string().max(20_000).optional(),
  published: z.boolean().optional(),
});

export const listPostsSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(160).optional(),
});

export const CreatePostInput = z.compile(createPostSchema);
export const UpdatePostInput = z.compile(updatePostSchema);
export const ListPostsInput = z.compile(listPostsSchema);

export type CreatePostInput = z.output<typeof CreatePostInput>;
export type UpdatePostInput = z.output<typeof UpdatePostInput>;
export type ListPostsInput = z.output<typeof ListPostsInput>;
