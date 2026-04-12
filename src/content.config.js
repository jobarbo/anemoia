import { defineCollection } from "astro:content";
import { glob, file } from "astro/loaders";
import { z } from "astro/zod";

const stories = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/data/stories" }),
	schema: z.object({
		title: z.string(),
		neighborhood: z.string(),
		audioSrc: z.string().optional(),
		order: z.number(),
		duration: z.string().optional(),
	}),
});

const neighborhoods = defineCollection({
	loader: file("src/data/neighborhoods/index.json"),
	schema: z.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
		description: z.string().optional(),
		scenePath: z.string(),
		audioSrc: z.string().optional(),
		stories: z.array(z.string()),
		position: z.object({ x: z.number(), y: z.number() }),
	}),
});

export const collections = { stories, neighborhoods };
