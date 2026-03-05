import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const MAX_FILES = 5;

const StatementUpload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [autoIgnoreLimit, setAutoIgnoreLimit] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setAutoIgnoreLimit(String(profile.auto_ignore_limit ?? 0));
    }
  }, [profile]);

  // Generate previews when files change
  useEffect(() => {
    const urls = selectedFiles.map((f) => URL.createObjectURL(f));
    setFilePreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [selectedFiles]);

  const handleSaveLimit = async () => {
    if (!user) return;
    setSavingLimit(true);
    const { error } = await supabase
      .from("profiles")
      .update({ auto_ignore_limit: parseFloat(autoIgnoreLimit) || 0 })
      .eq("user_id", user.id);
    if (error) toast.error("Failed to save");
    else toast.success("Auto-ignore limit saved!");
    setSavingLimit(false);
  };

  const { data: recentImports, refetch } = useQuery({
    queryKey: ["statement-imports", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("statement_imports")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!user,
  });

  const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];

  const addFiles = (newFiles: FileList | File[]) => {
    const filesArr = Array.from(newFiles);
    const valid: File[] = [];
    for (const file of filesArr) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: unsupported format`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: exceeds 10MB`);
        continue;
      }
      // PDFs go solo - process immediately
      if (file.type === "application/pdf") {
        handleFiles([file]);
        return;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;
    setSelectedFiles((prev) => {
      const combined = [...prev, ...valid].slice(0, MAX_FILES);
      if (prev.length + valid.length > MAX_FILES) {
        toast.error(`Max ${MAX_FILES} screenshots allowed`);
      }
      return combined;
    });
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFiles = async (files: File[]) => {
    if (!user || files.length === 0) return;

    setUploading(true);
    try {
      const filePaths: string[] = [];
      const fileNames: string[] = [];

      for (const file of files) {
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("statements")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        filePaths.push(filePath);
        fileNames.push(file.name);
      }

      const combinedName = fileNames.length === 1
        ? fileNames[0]
        : `${fileNames.length} screenshots`;

      const { data: importRecord, error: importError } = await supabase
        .from("statement_imports")
        .insert({
          user_id: user.id,
          file_name: combinedName,
          file_url: filePaths[0],
          status: "uploading",
        })
        .select()
        .single();

      if (importError) throw importError;

      setUploading(false);
      setProcessing(true);
      setSelectedFiles([]);

      setProgressStep(1);
      const step2Timer = setTimeout(() => setProgressStep(2), 2000);
      const step3Timer = setTimeout(() => setProgressStep(3), 4000);

      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-statement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            importId: importRecord.id,
            filePath: filePaths.length === 1 ? filePaths[0] : undefined,
            filePaths: filePaths.length > 1 ? filePaths : undefined,
          }),
        }
      );

      clearTimeout(step2Timer);
      clearTimeout(step3Timer);

      if (!response.ok) {
        const err = await response.json();
        if (response.status === 429) {
          toast.error("Rate limit exceeded. Please try again in a moment.");
        } else if (response.status === 402) {
          toast.error("AI credits exhausted. Please add credits to continue.");
        } else {
          toast.error(err.error || "Failed to parse statement");
        }
        setProcessing(false);
        refetch();
        return;
      }

      const result = await response.json();
      toast.success(`Found ${result.count} transactions!`);
      setProcessing(false);
      refetch();
      navigate(`/statement-interview/${importRecord.id}`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleProcessSelected = () => {
    if (selectedFiles.length > 0) handleFiles(selectedFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const statusIcon = (status: string) => {
    if (status === "ready" || status === "complete") return "check_circle";
    if (status === "processing") return "hourglass_top";
    if (status === "error") return "error";
    return "upload_file";
  };

  const statusColor = (status: string) => {
    if (status === "ready" || status === "complete") return "text-success";
    if (status === "error") return "text-destructive";
    return "text-muted-foreground";
  };

  const isImage = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

  return (
    <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col pb-24">
      {/* Header */}
      <header className="pt-12 px-6 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-2 rounded-full glass-card">
          <span className="material-icons text-foreground">arrow_back</span>
        </button>
        <h1 className="text-xl font-bold text-foreground">Smart Statement</h1>
      </header>

      <div className="px-6 mt-6">
        <h2 className="text-2xl font-bold text-foreground">Upload your Statement</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload a PDF or up to {MAX_FILES} screenshots. Our AI will analyze and categorize your expenses.
        </p>
      </div>

      {/* Upload Zone */}
      <div className="px-6 mt-6">
        <div
          onClick={() => !uploading && !processing && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
            dragOver ? "border-primary bg-primary/10" : "border-primary/30"
          } ${uploading || processing ? "opacity-50 pointer-events-none" : "hover:border-primary/60"}`}
        >
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
            <span className="material-icons text-3xl text-primary">cloud_upload</span>
          </div>
          <p className="text-primary font-semibold text-lg">Drop Files Here</p>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mt-1">or tap to browse files</p>
          <div className="flex gap-2 mt-4 flex-wrap justify-center">
            <span className="text-xs px-3 py-1 rounded-full bg-secondary text-muted-foreground">.PDF</span>
            <span className="text-xs px-3 py-1 rounded-full bg-secondary text-muted-foreground">.PNG / .JPG</span>
            <span className="text-xs px-3 py-1 rounded-full bg-secondary text-muted-foreground">Max {MAX_FILES} images</span>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && !uploading && !processing && (
        <div className="px-6 mt-4">
          <div className="glass-card rounded-2xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">
              {selectedFiles.length} screenshot{selectedFiles.length > 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {selectedFiles.map((file, i) => (
                <div key={i} className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-border">
                  <img
                    src={filePreviews[i]}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
                  >
                    <span className="material-icons text-destructive-foreground text-xs">close</span>
                  </button>
                </div>
              ))}
              {selectedFiles.length < MAX_FILES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-primary/30 flex items-center justify-center hover:border-primary/60 transition-colors"
                >
                  <span className="material-icons text-primary/50 text-2xl">add</span>
                </button>
              )}
            </div>
            <Button
              onClick={handleProcessSelected}
              className="w-full mt-3 shadow-neon"
            >
              <span className="material-icons text-sm mr-2">auto_awesome</span>
              Analyze {selectedFiles.length} Screenshot{selectedFiles.length > 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}

      {/* Processing Card */}
      {(uploading || processing) && (
        <div className="px-6 mt-4">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="material-icons text-primary animate-pulse">auto_awesome</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">AI Analysis in Progress</p>
                </div>
              </div>
              <span className="text-primary text-xs font-medium">Processing...</span>
            </div>
            <Progress value={progressStep * 33} className="h-1.5 mb-4" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${progressStep >= 1 ? "bg-success" : "bg-muted-foreground/30"}`} />
                <span className={`text-sm ${progressStep >= 1 ? "text-success" : "text-muted-foreground"}`}>
                  Reading statement format
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${progressStep >= 2 ? "bg-success" : "bg-muted-foreground/30"}`} />
                <span className={`text-sm font-medium ${progressStep >= 2 ? "text-primary" : "text-muted-foreground"}`}>
                  Identifying spending patterns
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${progressStep >= 3 ? "bg-success" : "bg-muted-foreground/30"}`} />
                <span className={`text-sm ${progressStep >= 3 ? "text-foreground" : "text-muted-foreground/50"}`}>
                  Generating personalized insights
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Ignore Limit */}
      <div className="px-6 mt-6">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="material-icons text-primary text-lg">filter_alt</span>
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">Auto-Ignore Limit</p>
              <p className="text-xs text-muted-foreground">Skip small transactions during parsing</p>
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-muted-foreground text-xs">Amount (₹)</Label>
              <Input
                type="number"
                value={autoIgnoreLimit}
                onChange={(e) => setAutoIgnoreLimit(e.target.value)}
                placeholder="0"
                className="mt-1 bg-secondary/50 border-border text-foreground"
              />
            </div>
            <Button size="sm" onClick={handleSaveLimit} disabled={savingLimit} className="shadow-neon h-10">
              {savingLimit ? "..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Imports */}
      {recentImports && recentImports.length > 0 && (
        <div className="px-6 mt-8">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Recent Imports</h3>
          <div className="space-y-2">
            {recentImports.map((imp) => (
              <button
                key={imp.id}
                onClick={() => {
                  if (imp.status === "ready") navigate(`/statement-interview/${imp.id}`);
                  else if (imp.status === "complete") navigate(`/review-complete/${imp.id}`);
                }}
                className="w-full glass-card rounded-xl p-4 flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                  <span className="material-icons text-destructive text-lg">
                    {isImage(imp.file_name) || imp.file_name.includes("screenshot") ? "image" : "picture_as_pdf"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{imp.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp.status === "ready" || imp.status === "complete" ? "Processed" : imp.status} •{" "}
                    {new Date(imp.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className={`material-icons ${statusColor(imp.status)}`}>{statusIcon(imp.status)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatementUpload;
