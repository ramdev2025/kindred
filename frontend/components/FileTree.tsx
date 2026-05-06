"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";

interface FileNode {
  name: string;
  type: "file" | "dir" | "folder";
  path?: string;
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  onFileSelect?: (path: string) => void;
}

function FileTreeItem({ node, depth = 0, onFileSelect }: { node: FileNode; depth?: number; onFileSelect?: (path: string) => void }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isDir = node.type === "dir" || node.type === "folder";

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) {
            setIsOpen(!isOpen);
          } else if (onFileSelect && node.path) {
            onFileSelect(node.path);
          }
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-[13px] hover:bg-white/5 rounded transition-colors ${
          !isDir ? "text-zinc-300" : "text-zinc-400"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          <>
            {isOpen ? (
              <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileTreeItem key={`${child.name}-${i}`} node={child} depth={depth + 1} onFileSelect={onFileSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ files, onFileSelect }: FileTreeProps) {
  if (!files || files.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-zinc-500">No files yet. Start a sandbox to see files.</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {files.map((node, i) => (
        <FileTreeItem key={`${node.name}-${i}`} node={node} onFileSelect={onFileSelect} />
      ))}
    </div>
  );
}
