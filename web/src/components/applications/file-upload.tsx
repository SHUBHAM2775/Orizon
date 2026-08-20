"use client";

import { useState, useRef } from "react";
import { IndexCard, IndexCardHeader } from "@/components/ui/index-card";
import { cn } from "@/lib/utils";
import { validateApplicantData, type UploadData } from "@/lib/upload-utils";
import { submitApplicantAction } from "@/app/actions/upload";
import { PdfReviewForm } from "./pdf-review-form";

export function FileUploadSection({ onUploaded }: { onUploaded?: () => void } = {}) {
  const [mode, setMode] = useState<"data" | "pdf">("data");
  
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [errors, setErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [extractedProfile, setExtractedProfile] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptString = mode === "data" ? ".csv,.json" : ".pdf";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelection(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelection(Array.from(e.target.files));
    }
  };

  const handleFilesSelection = (selectedFiles: File[]) => {
    setErrors([]);
    setSuccessMsg(null);
    setExtractedProfile(null);
    
    const validFiles: File[] = [];
    for (const file of selectedFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (mode === "data" && ext !== "csv" && ext !== "json") {
        setErrors(prev => [...prev, `Invalid file: ${file.name}. Only CSV or JSON allowed.`]);
        continue;
      }
      
      if (mode === "pdf" && ext !== "pdf") {
        setErrors(prev => [...prev, `Invalid file: ${file.name}. Only PDF allowed.`]);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const resetState = () => {
    setFiles([]);
    setErrors([]);
    setSuccessMsg(null);
    setExtractedProfile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProcessDataFile = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setErrors([]);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));

      // Using the new Python AI backend action
      const { processStructuredFileAction } = await import("@/app/actions/upload");
      const result = await processStructuredFileAction(formData);

      if (result?.error) {
        setErrors([result.error]);
      } else if (result?.success) {
        setSuccessMsg(result.message || `Successfully processed and imported applicant data.`);
        setFiles([]);
        onUploaded?.();
      }
    } catch (err: any) {
      setErrors([err.message || "An error occurred during processing"]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessPdfFile = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setErrors([]);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));

      // Using the new Python AI backend action
      const { processPdfFileAction } = await import("@/app/actions/upload");
      const result = await processPdfFileAction(formData);
      
      if (result?.error) {
        setErrors([result.error]);
      } else if (result?.profiles && result.profiles.length > 0) {
        // The UI review form currently only supports reviewing one profile at a time
        if (result.profiles.length > 1) {
          setErrors(["Warning: Multiple PDFs uploaded, but the review form only supports one at a time. Showing the first one."]);
        }
        setExtractedProfile(result.profiles[0]);
      }
    } catch (err: any) {
      setErrors([err.message || "An error occurred extracting PDF text"]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModeSwitch = (newMode: "data" | "pdf") => {
    if (newMode !== mode) {
      setMode(newMode);
      resetState();
    }
  };

  return (
    <IndexCard tabTone="default" as="div" className="mb-6">
      <div className="flex items-center justify-between border-b border-[color-mix(in_oklch,var(--ink),transparent_88%)] px-6 py-4">
        <div>
          <h2 className="text-base font-medium text-[var(--ink)]">Submit Applicant Data</h2>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">Upload structured data or raw documents</p>
        </div>
        <div className="flex bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)] border border-[color-mix(in_oklch,var(--ink),transparent_85%)] rounded-[var(--radius-sm)] overflow-hidden p-0.5">
          <button
            onClick={() => handleModeSwitch("data")}
            className={cn(
              "px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors rounded-[var(--radius-sm)-2px]",
              mode === "data" ? "bg-[var(--brass)] text-[var(--paper)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            )}
          >
            Data (CSV/JSON)
          </button>
          <button
            onClick={() => handleModeSwitch("pdf")}
            className={cn(
              "px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors rounded-[var(--radius-sm)-2px]",
              mode === "pdf" ? "bg-[var(--brass)] text-[var(--paper)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            )}
          >
            Document (PDF)
          </button>
        </div>
      </div>

      <div className="p-6">
        {successMsg && (
          <div className="bg-[color-mix(in_oklch,var(--approve),transparent_90%)] border border-[color-mix(in_oklch,var(--approve),transparent_70%)] text-[var(--approve)] p-4 rounded-[var(--radius-sm)] mb-4 flex items-center justify-between">
            <span className="text-sm">{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-xs font-mono uppercase tracking-wider hover:underline">Dismiss</button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="bg-[color-mix(in_oklch,var(--reject),transparent_90%)] border border-[color-mix(in_oklch,var(--reject),transparent_70%)] text-[var(--reject)] p-4 rounded-[var(--radius-sm)] mb-4 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-wider font-bold mb-1">Validation Errors</p>
            {errors.map((err, i) => (
              <div key={i} className="text-sm">• {err}</div>
            ))}
          </div>
        )}

        {extractedProfile ? (
          <PdfReviewForm 
            extractedProfile={extractedProfile} 
            onCancel={resetState}
            onSuccess={() => {
              setSuccessMsg("PDF data successfully validated and inserted.");
              setExtractedProfile(null);
              setFiles([]);
              onUploaded?.();
            }} 
          />
        ) : (
          <div className="flex flex-col items-center">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "w-full max-w-2xl border-2 border-dashed rounded-[var(--radius-sm)] p-12 text-center cursor-pointer transition-colors duration-200",
                isDragging
                  ? "border-[var(--brass)] bg-[color-mix(in_oklch,var(--brass),transparent_95%)]"
                  : "border-[color-mix(in_oklch,var(--ink),transparent_80%)] hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)]",
                files.length > 0 ? "bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)] border-solid border-[color-mix(in_oklch,var(--ink),transparent_60%)]" : ""
              )}
            >
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={acceptString}
                className="hidden"
              />
              
              {files.length === 0 ? (
                <>
                  <p className="text-[var(--ink)] font-medium mb-1">
                    Click to browse or drag and drop
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {mode === "data" ? "Supports .csv or .json files" : "Supports .pdf files"}
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {files.map((f, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 p-3 border border-[color-mix(in_oklch,var(--ink),transparent_80%)] rounded-[var(--radius-sm)] bg-[var(--paper)]">
                      <div className="w-10 h-10 rounded-full bg-[color-mix(in_oklch,var(--brass),transparent_85%)] text-[var(--brass)] flex items-center justify-center font-mono text-xs uppercase">
                        {f.name.split('.').pop()}
                      </div>
                      <p className="text-[var(--ink)] font-medium text-xs max-w-[120px] truncate" title={f.name}>{f.name}</p>
                      <p className="text-[10px] text-[var(--ink-muted)] font-mono">{(f.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {files.length > 0 && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={resetState}
                  disabled={isProcessing}
                  className="px-6 py-2 text-sm font-mono uppercase tracking-wider border border-[color-mix(in_oklch,var(--ink),transparent_70%)] rounded-[var(--radius-sm)] hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={mode === "data" ? handleProcessDataFile : handleProcessPdfFile}
                  disabled={isProcessing}
                  className="bg-[var(--brass)] text-[var(--paper)] border border-[var(--brass)] rounded-[var(--radius-sm)] px-6 py-2 text-sm font-medium tracking-wide hover:bg-[color-mix(in_oklch,var(--brass),var(--ink)_18%)] transition-colors disabled:opacity-50"
                >
                  {isProcessing ? "Processing..." : mode === "data" ? "Parse & Submit" : "Extract Text"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </IndexCard>
  );
}
