// Centralized file type utilities for S3 Desktop Explorer

export const CODE_OR_TEXT_EXTENSIONS = new Set([
  // Plain text & Docs
  'txt',
  'text',
  'log',
  'md',
  'markdown',
  'rst',
  'adoc',

  // Config & Data formats
  'json',
  'jsonc',
  'json5',
  'yaml',
  'yml',
  'toml',
  'xml',
  'csv',
  'tsv',
  'ini',
  'conf',
  'config',
  'env',
  'properties',
  'cfg',

  // Web & Styles
  'html',
  'htm',
  'xhtml',
  'css',
  'scss',
  'sass',
  'less',
  'svg',

  // JavaScript & TypeScript
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'mts',
  'cts',

  // Python
  'py',
  'pyw',
  'pyx',

  // Shell & Scripts
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'psm1',
  'bat',
  'cmd',

  // Database
  'sql',
  'pgsql',
  'plsql',
  'prisma',

  // Systems & Languages
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'hxx',
  'cs',
  'rs',
  'go',
  'java',
  'kt',
  'kts',
  'scala',
  'swift',
  'dart',
  'rb',
  'php',
  'lua',
  'pl',
  'pm',
  'r',

  // DevOps & Schemas
  'dockerfile',
  'containerfile',
  'makefile',
  'tf',
  'terraform',
  'hcl',
  'graphql',
  'gql',
  'proto',
]);

export const KNOWN_CODE_OR_TEXT_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'jenkinsfile',
  'vagrantfile',
  'procfile',
  'gemfile',
  '.env',
  '.gitignore',
  '.npmignore',
  '.npmrc',
  '.dockerignore',
  '.editorconfig',
  '.babelrc',
  '.eslintrc',
  '.prettierrc',
]);

/**
 * Returns true if the file format is supported for code/text editing in Monaco Editor
 */
export const isCodeOrText = (ext?: string, filename?: string): boolean => {
  if (filename) {
    const lowerName = filename.toLowerCase();
    if (KNOWN_CODE_OR_TEXT_FILENAMES.has(lowerName)) return true;
    if (lowerName.startsWith('.env')) return true;
  }
  if (!ext) return false;
  const cleanExt = ext.toLowerCase().replace('.', '');
  return CODE_OR_TEXT_EXTENSIONS.has(cleanExt);
};

export const isPdfFile = (ext?: string): boolean => {
  return ext?.toLowerCase().replace('.', '') === 'pdf';
};

export const isImageFile = (ext?: string): boolean => {
  if (!ext) return false;
  const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico', 'tiff'];
  return imageExts.includes(ext.toLowerCase().replace('.', ''));
};
