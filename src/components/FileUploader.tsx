"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface FileUploaderProps {
  userId: string;
  onUploadComplete: (fileName: string, filePath: string) => void;
  onError: (message: string) => void;
}

type UploadState = "idle" | "dragging" | "uploading" | "success";

export function FileUploader({ userId, onUploadComplete, onError }: FileUploaderProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return "Only .docx files are supported";
    }
    if (file.size > 10 * 1024 * 1024) {
      return "File must be under 10MB";
    }
    return null;
  };

  const uploadFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        onError(error);
        return;
      }

      setState("uploading");
      setProgress(0);
      setFileName(file.name);

      const timestamp = Date.now();
      const filePath = `${userId}/${timestamp}-${file.name}`;

      try {
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("bid-uploads")
          .upload(filePath, file, { upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        setProgress(100);
        setState("success");
        onUploadComplete(file.name, filePath);
      } catch (err) {
        setState("idle");
        setFileName("");
        onError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [userId, onUploadComplete, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setState("idle");
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setState("dragging");
  };

  const handleDragLeave = () => {
    setState("idle");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleChange = () => {
    setState("idle");
    setFileName("");
    setProgress(0);
  };

  if (state === "success") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-3">
          <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <div className="flex-1">
            <p className="font-medium text-green-800 dark:text-green-200">{fileName}</p>
            <p className="text-sm text-green-600 dark:text-green-400">Uploaded successfully</p>
          </div>
          <button
            type="button"
            onClick={handleChange}
            className="text-sm font-medium text-green-700 underline hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
          >
            Change file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => state === "idle" && inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        state === "dragging"
          ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
          : state === "uploading"
            ? "cursor-wait border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleFileSelect}
      />

      {state === "uploading" ? (
        <div>
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Uploading {fileName}...
          </p>
          <div className="mx-auto mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div>
          <svg className="mx-auto mb-3 h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {state === "dragging" ? "Drop your file here" : "Drag & drop your .docx file here"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">or click to browse (max 10MB)</p>
        </div>
      )}
    </div>
  );
}
