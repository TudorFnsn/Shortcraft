/**
 * Inline <head> script: marks <html data-motion> before paint when motion is
 * allowed, so headings that will be split into lines can wait hidden instead
 * of flashing in their final place first. Without JavaScript, or under reduced
 * motion, the attribute is never set and everything shows at once. A CSS
 * fail-safe in globals.css reveals them after 2.5s if the split never runs.
 */
export const motionInitScript = `(function(){try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.setAttribute("data-motion","")}catch(e){}})()`;
