export const reviewToolsEnabled = (value: string | undefined) => value === "true";
export const feedbackLink = (value: string | undefined) => {
  if (!value?.trim()) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};
