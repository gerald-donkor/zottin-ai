export const APP_FRAMEWORKS = [
  {
    value: "react",
    label: "React",
    description: "React single-page app",
  },
  {
    value: "nextjs",
    label: "Next.js",
    description: "Full-stack Next.js app",
  },
  {
    value: "expo",
    label: "Expo",
    description: "React Native mobile app",
  },
  {
    value: "vue",
    label: "Vue",
    description: "Vue 3 web app",
  },
  {
    value: "svelte",
    label: "Svelte",
    description: "Svelte web app",
  },
  {
    value: "vanilla",
    label: "Vanilla",
    description: "HTML, CSS and JavaScript",
  },
] as const;

export type AppFramework = (typeof APP_FRAMEWORKS)[number]["value"];

export function isAppFramework(value: unknown): value is AppFramework {
  return APP_FRAMEWORKS.some((framework) => framework.value === value);
}

export function getFrameworkLabel(framework: AppFramework): string {
  return (
    APP_FRAMEWORKS.find((item) => item.value === framework)?.label ?? "React"
  );
}
