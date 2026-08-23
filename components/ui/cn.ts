// components/ui/cn.ts
/** Join class names, dropping falsy values. Keeps conditional classes readable. */
export function cn(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(" ");
}
