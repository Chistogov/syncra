import React from 'react';
import {
  Folder,
  FileText,
  FileImage,
  FileAudio,
  FileVideo,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  File,
} from 'lucide-react';

export function getFileIcon(isPrefix: boolean, extension?: string, className: string = 'w-5 h-5') {
  if (isPrefix) {
    return <Folder className={`${className} text-amber-400 fill-amber-400/20`} />;
  }

  const ext = extension?.toLowerCase();

  switch (ext) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'bmp':
    case 'ico':
      return <FileImage className={`${className} text-emerald-400`} />;

    case 'pdf':
      return <FileText className={`${className} text-rose-500`} />;

    case 'doc':
    case 'docx':
    case 'rtf':
    case 'odt':
      return <FileText className={`${className} text-blue-500`} />;

    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className={`${className} text-emerald-500`} />;

    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'flac':
    case 'aac':
      return <FileAudio className={`${className} text-purple-400`} />;

    case 'mp4':
    case 'webm':
    case 'mkv':
    case 'mov':
    case 'avi':
      return <FileVideo className={`${className} text-rose-400`} />;

    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return <FileArchive className={`${className} text-yellow-500`} />;

    case 'json':
    case 'xml':
    case 'yaml':
    case 'yml':
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'py':
    case 'html':
    case 'css':
    case 'sql':
    case 'sh':
      return <FileCode className={`${className} text-cyan-400`} />;

    default:
      return <File className={`${className} text-slate-400`} />;
  }
}
