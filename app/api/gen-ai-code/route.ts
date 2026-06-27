import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/prisma";
import { CREDIT_COST_PER_GENERATION } from "@/lib/constants";
import type { Message, FileData } from "@/types/workspace";
import {
  getFrameworkLabel,
  isAppFramework,
  type AppFramework,
} from "@/lib/frameworks";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sseEvent(type: string, payload: unknown): string {
  return `data: ${JSON.stringify({ type, ...(payload as object) })}\n\n`;
}

// ─── Extract short label from a Gemini thought chunk ─────────────────────────
// Gemini thoughts often start with a bold heading like **Verify Config**
// We extract that. If no bold heading, take the first sentence only.

function extractThoughtLabel(text: string): string | null {
  // Try to grab **bold heading** at the start
  const boldMatch = text.match(/\*\*([^*]{4,60})\*\*/);
  if (boldMatch) return boldMatch[1].trim();

  // Fall back to first sentence (up to first . or \n), capped at 60 chars
  const sentence = text.split(/[.\n]/)[0].trim();
  if (sentence.length >= 8 && sentence.length <= 80) return sentence;

  return null;
}

// ─── npm validation ───────────────────────────────────────────────────────────

async function validateDependencies(
  deps: Record<string, string>
): Promise<Record<string, string>> {
  const valid: Record<string, string> = {};
  await Promise.all(
    Object.entries(deps).map(async ([pkg, version]) => {
      try {
        const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) valid[pkg] = version;
      } catch {
        // silently skip hallucinated packages
      }
    })
  );
  return valid;
}

// ─── History trimming ─────────────────────────────────────────────────────────

function trimHistory(messages: Message[]): Message[] {
  if (messages.length <= 10) return messages;
  return [messages[0], ...messages.slice(-8)];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const FRAMEWORK_RULES: Record<AppFramework, string> = {
  react: `Use React 19 functional components and JavaScript. The entry point must be /App.js and export a default component. Tailwind CSS 4 is loaded by the preview. Animation options are Motion ("motion/react"), Framer Motion ("framer-motion"), and GSAP 3.15+ ("gsap" with the official "@gsap/react" useGSAP hook). Register useGSAP and GSAP plugins, scope selectors with refs, and rely on automatic context cleanup. Animate UI is a source-component distribution, not an npm runtime: when requested, translate the component to JavaScript and create complete local files under /components/animate-ui using Motion and accessible Base UI/Radix primitives. Use relative imports and never import from an imaginary "@animate-ui" package.`,
  nextjs: `Use Next.js Pages Router with React 19 and JavaScript. The main page must be /pages/index.js. Include /pages/_app.js, /styles/globals.css, and /postcss.config.mjs; globals.css must import Tailwind 4 with '@import "tailwindcss";'. Animation options are Motion ("motion/react"), Framer Motion ("framer-motion"), and GSAP 3.15+ ("gsap" plus "@gsap/react"). Keep animation code browser-safe, use the official useGSAP hook with cleanup, and register plugins explicitly. Animate UI is installed as local source: when requested, translate it to JavaScript and include complete files under /components/animate-ui using Motion and accessible primitives. Use relative imports unless an alias is explicitly configured, and never import an "@animate-ui" npm package.`,
  expo: `Use Expo with React Native and JavaScript. The entry point must be /App.js and export a default component. Use only React Native primitives and StyleSheet for UI. Never use DOM elements, browser APIs, Tailwind, or CSS files. Include expo-compatible dependencies only.`,
  vue: `Use Vue 3 with JavaScript and Vite. Include /src/App.vue, /src/main.js, and /index.html. Use scoped CSS inside Vue components or /src/style.css. GSAP 3.15+ is preinstalled for animation; use gsap.context() and revert it on component unmount.`,
  svelte: `Use Svelte with JavaScript and Vite. Include /src/App.svelte, /src/main.js, and /index.html. Use component styles or /src/app.css. GSAP 3.15+ is preinstalled; scope animations and revert their context in onDestroy.`,
  vanilla: `Use semantic HTML, modern CSS, and browser JavaScript with Vite. Include /index.html, /src/main.js, and /src/style.css. Do not use React or another UI framework. GSAP 3.15+ is preinstalled for timelines, scroll animation, and complex interaction.`,
};

function systemPrompt(framework: AppFramework): string {
  return `You are an expert ${getFrameworkLabel(framework)} developer. Generate a complete, working application based on the user's prompt.

RULES:
1. Always respond with a valid JSON object — no markdown fences, no extra text.
2. The JSON must match this exact shape:
{
  "assistantMessage": "<brief explanation of what you built/changed>",
  "title": "<short 2-4 word title for the app, e.g. 'Todo List App'>",
  "files": {
    "<required entry path for ${getFrameworkLabel(framework)}>": { "code": "<full file content>" },
    "<other file path>": { "code": "<full file content>" }
  },
  "dependencies": {
    "some-package": "latest"
  }
}
3. Do not use TypeScript.
4. ${FRAMEWORK_RULES[framework]}
5. All imports must reference files included in "files" or packages in "dependencies".
6. Do not list framework core packages that the selected template already provides.
7. When modifying existing code, include ALL files, changed and unchanged.
8. Keep code clean, readable, responsive, accessible, and production-quality.
9. If the user attaches an image, use it as a design reference and match it closely.
10. Never switch away from ${getFrameworkLabel(framework)}.`;
}

// ─── Gemini contents builder ──────────────────────────────────────────────────

function buildContents(messages: Message[], fileData: FileData | null) {
  const trimmed = trimHistory(messages);

  return trimmed.map((msg, idx) => {
    const role = msg.role === "assistant" ? "model" : "user";

    if (msg.role === "user") {
      const parts: object[] = [];

      let text = msg.content;

      if (msg.imageUrl) {
        text = `[The user has attached an image. Use this URL directly in the generated app where relevant (as img src, background-image, etc.): ${msg.imageUrl}]\n\n${text}`;
      }

      const isLast = idx === trimmed.length - 1;
      if (isLast && fileData) {
        text +=
          "\n\nCurrent project files for context:\n" +
          JSON.stringify(fileData, null, 2);
      }

      parts.push({ text });
      return { role, parts };
    }

    return { role, parts: [{ text: msg.content }] };
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { workspaceId, userId, messages, fileData, framework } = body as {
    workspaceId: string | null;
    userId: string;
    messages: Message[];
    fileData: FileData | null;
    framework?: string;
  };

  if (!messages?.length) {
    return Response.json({ message: "No messages provided" }, { status: 400 });
  }
  const selectedFramework: AppFramework = isAppFramework(fileData?.framework)
    ? fileData.framework
    : isAppFramework(framework)
      ? framework
      : "react";

  // ── Arcjet: rate limit, prompt injection, sensitive info ──────────────────
  // detectPromptInjectionMessage requires the actual user text to inspect.

  // const arcjetReq = new Request(request.url, {
  //   method: request.method,
  //   headers: request.headers,
  //   body: JSON.stringify(body),
  // });

  // const lastUserMessage =
  //   [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // const decision = await aj.protect(arcjetReq, {
  //   requested: 1,
  //   userId: clerkId,
  //   detectPromptInjectionMessage: lastUserMessage,
  // });

  // if (decision.isDenied()) {
  //   return Response.json(
  //     { message: decision.reason?.type ?? "Request blocked" },
  //     { status: 429 }
  //   );
  // }

  const user = await db.user.findUnique({
    where: { id: userId, clerkId },
    select: { id: true, credits: true },
  });

  if (!user)
    return Response.json({ message: "User not found" }, { status: 404 });
  if (user.credits < CREDIT_COST_PER_GENERATION) {
    return Response.json({ message: "Insufficient credits" }, { status: 402 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      try {
        const contents = buildContents(messages, fileData);

        const geminiStream = await ai.models.generateContentStream({
          model: "gemini-3.5-flash",
          contents,
          config: {
            systemInstruction: systemPrompt(selectedFramework),
            temperature: 0.7,
            responseMimeType: "application/json",
            thinkingConfig: {
              includeThoughts: true,
            },
          },
        });

        let accumulated = ""; // final JSON output
        let lastEmitTime = 0; // throttle thought emissions

        for await (const chunk of geminiStream) {
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];

          for (const part of parts) {
            if (!part.text) continue;

            if (part.thought) {
              // Extract just the short label — not the full wall of text
              const now = Date.now();
              if (now - lastEmitTime > 600) {
                const label = extractThoughtLabel(part.text);
                if (label) {
                  enqueue(sseEvent("status", { message: label }));
                  lastEmitTime = now;
                }
              }
            } else {
              // Actual JSON output
              accumulated += part.text;
            }
          }
        }

        // ── Parse the complete JSON response ──────────────────────────────────

        let parsed: {
          assistantMessage: string;
          title?: string;
          files: Record<string, { code: string }>;
          dependencies: Record<string, string>;
        };

        try {
          parsed = JSON.parse(accumulated);
        } catch {
          enqueue(
            sseEvent("error", {
              message: "AI returned invalid JSON. Please try again.",
            })
          );
          controller.close();
          return;
        }

        const {
          assistantMessage,
          title: aiTitle,
          files,
          dependencies,
        } = parsed;

        if (!files || typeof files !== "object") {
          enqueue(
            sseEvent("error", {
              message: "AI response missing files. Please try again.",
            })
          );
          controller.close();
          return;
        }

        // ── Validate npm packages ──────────────────────────────────────────────

        enqueue(sseEvent("status", { message: "Validating packages…" }));
        const validatedDeps = await validateDependencies(dependencies ?? {});
        const newFileData: FileData = {
          files,
          dependencies: validatedDeps,
          title: aiTitle,
          framework: selectedFramework,
        };

        // ── Upsert workspace + deduct credit (single transaction) ──────────────

        enqueue(sseEvent("status", { message: "Saving…" }));

        const lastUserMessage = messages[messages.length - 1];
        const updatedMessages: Message[] = [
          ...messages,
          { role: "assistant", content: assistantMessage },
        ];
        const newVersionId = crypto.randomUUID();

        const [workspace, updatedUser] = await db.$transaction([
          workspaceId
            ? db.workspace.update({
                where: { id: workspaceId, userId },
                data: {
                  messages: updatedMessages as never,
                  fileData: newFileData as never,
                  versions: {
                    create: {
                      id: newVersionId,
                      fileData: newFileData as never,
                      source: "generation",
                      summary: assistantMessage,
                    },
                  },
                },
              })
            : db.workspace.create({
                data: {
                  userId,
                  title: aiTitle ?? lastUserMessage.content.slice(0, 80),
                  messages: updatedMessages as never,
                  fileData: newFileData as never,
                  versions: {
                    create: {
                      id: newVersionId,
                      fileData: newFileData as never,
                      source: "generation",
                      summary: assistantMessage,
                    },
                  },
                },
              }),
          db.user.update({
            where: {
              id: userId,
              credits: { gte: CREDIT_COST_PER_GENERATION },
            },
            data: { credits: { decrement: CREDIT_COST_PER_GENERATION } },
            select: { credits: true },
          }),
        ]);

        // ── Emit final result ──────────────────────────────────────────────────

        enqueue(
          sseEvent("done", {
            workspaceId: workspace.id,
            assistantMessage,
            fileData: newFileData,
            currentVersionId: newVersionId,
            creditsRemaining: updatedUser.credits,
          })
        );
      } catch (err) {
        console.error("[gen-ai-code] stream error:", err);
        enqueue(
          sseEvent("error", {
            message: "Something went wrong. Please try again.",
          })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const runtime = "nodejs";
export const maxDuration = 300; // for vercel - 300s on Fluid
