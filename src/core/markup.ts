/** Strip GGG text markup: `[key|Display]` → Display, `[Word]` → Word, `<tag>{x}` → x. */
export const stripMarkup = (s: string): string =>
  s.replace(/<[\w-]+>\{([^}]*)\}/g, '$1').replace(/\[(?:[^\]|]*\|)?([^\]]*)\]/g, '$1');
