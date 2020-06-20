import { HTML_JS_REGEX } from "./util";

const {parse} = require('es-module-lexer');

function spliceString(source: string, withSlice: string, start: number, end: number) {
  return source.slice(0, start) + (withSlice || '') + source.slice(end);
}

export async function scanCodeImportsExports(code: string): Promise<any[]> {
  const [imports] = await parse(code);
  return imports.filter((imp: any) => {
    //imp.d = -2 = import.meta.url = we can skip this for now
    if (imp.d === -2) {
      return false;
    }
    // imp.d > -1 === dynamic import
    if (imp.d > -1) {
      const importStatement = code.substring(imp.s, imp.e);
      const importSpecifierMatch = importStatement.match(/^\s*['"](.*)['"]\s*$/m);
      return !!importSpecifierMatch;
    }
    return true;
  });
}

export async function transformEsmImports(
  _code: string,
  replaceImport: (specifier: string) => string,
) {
  const imports = await scanCodeImportsExports(_code);
  let rewrittenCode = _code;
  for (const imp of imports.reverse()) {
    let spec = rewrittenCode.substring(imp.s, imp.e);
    if (imp.d > -1) {
      const importSpecifierMatch = spec.match(/^\s*['"](.*)['"]\s*$/m);
      spec = importSpecifierMatch![1];
    }
    let rewrittenImport = replaceImport(spec);
    if (imp.d > -1) {
      rewrittenImport = JSON.stringify(rewrittenImport);
    }
    rewrittenCode = spliceString(rewrittenCode, rewrittenImport, imp.s, imp.e);
  }
  return rewrittenCode;
}

async function transformHtmlImports(code: string, replaceImport: (specifier: string) => string) {
  let rewrittenCode = code;
  let match;
  const importRegex = new RegExp(HTML_JS_REGEX);
  while ((match = importRegex.exec(rewrittenCode))) {
    const [, scriptTagMatch, jsCodeMatch] = match;
    rewrittenCode = spliceString(
      rewrittenCode,
      await transformEsmImports(jsCodeMatch, replaceImport),
      match.index + scriptTagMatch.length,
      match.index + scriptTagMatch.length + jsCodeMatch.length,
    );
  }
  return rewrittenCode;
}

export async function transformFileImports(
  code: string,
  fileName: string,
  replaceImport: (specifier: string) => string,
) {
  if (fileName.endsWith('.js')) {
    return transformEsmImports(code, replaceImport);
  }
  if (fileName.endsWith('.html')) {
    return transformHtmlImports(code, replaceImport);
  }
  throw new Error(
    `Incompatible file: Cannot ESM imports for file "${fileName}". This is most likely an error within Snowpack.`,
  );
}
