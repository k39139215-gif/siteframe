/** Inline payloads belong in asset.data, not in URL metadata. */
export function assetSourceLabel(url: string): string {
  if (/^data:/i.test(url)) return 'inline:data';
  if (/^blob:/i.test(url)) return 'inline:blob';
  return url;
}

export function inlineBackgroundLabel(value: string): string {
  return value.replace(
    /url\((["']?)(data:|blob:)[\s\S]*?\1\)/gi,
    (_url, _quote, scheme) => 'url("inline:' + String(scheme).slice(0, -1).toLowerCase() + '")',
  );
}
