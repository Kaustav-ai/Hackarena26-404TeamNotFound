import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type ProcessingStep = { label: string; status: "pending" | "active" | "done" | "error" };

const ReceiptScan = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [steps, setSteps] = useState<ProcessingStep[]>([]);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // When stream changes, attach to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    setCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      setStream(mediaStream);
    } catch {
      toast({ title: "Camera access denied", description: "Please allow camera permissions to scan receipts.", variant: "destructive" });
      setCameraOpen(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraOpen(false);
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const flipCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    const newMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newMode);

    // Re-open with new facing mode
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: newMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then((mediaStream) => {
      setStream(mediaStream);
    }).catch(() => {
      toast({ title: "Camera error", description: "Could not switch camera.", variant: "destructive" });
    });
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setCapturedImage(URL.createObjectURL(blob));
          stopCamera();
        }
      },
      "image/jpeg",
      0.9
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedBlob(file);
    setCapturedImage(URL.createObjectURL(file));
    stopCamera();
  };

  const retake = () => {
    setCapturedImage(null);
    setCapturedBlob(null);
    startCamera();
  };

  const updateStep = (idx: number, status: ProcessingStep["status"]) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, status } : s)));
  };

  const processReceipt = async () => {
    if (!capturedBlob || !user) return;
    setProcessing(true);

    const initialSteps: ProcessingStep[] = [
      { label: "Uploading receipt", status: "active" },
      { label: "AI scanning items", status: "pending" },
      { label: "Saving transactions", status: "pending" },
    ];
    setSteps(initialSteps);

    try {
      // Upload to storage
      const filePath = `${user.id}/receipt-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("statements").upload(filePath, capturedBlob);
      if (uploadError) throw new Error("Upload failed");
      updateStep(0, "done");
      updateStep(1, "active");

      // Create import record
      const { data: importRow, error: importError } = await supabase
        .from("statement_imports")
        .insert({ user_id: user.id, file_name: "Receipt Scan", file_url: filePath, status: "processing" })
        .select()
        .single();
      if (importError || !importRow) throw new Error("Failed to create import");

      // Call parse function
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ importId: importRow.id, filePath }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Parsing failed");
      }

      updateStep(1, "done");
      updateStep(2, "active");

      const result = await resp.json();
      updateStep(2, "done");

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["imported-transactions-home"] });

      toast({ title: "Receipt scanned!", description: `Found ${result.count} item(s)` });

      setTimeout(() => {
        navigate(`/statement-interview/${importRow.id}`);
      }, 800);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
      setSteps((prev) => prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col pb-24">
      <header className="pt-12 px-6 flex items-center gap-3">
        <button onClick={() => { stopCamera(); navigate(-1); }} className="p-2 rounded-full glass-card">
          <span className="material-icons text-foreground">arrow_back</span>
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Scan Receipt</h1>
          <p className="text-xs text-muted-foreground">Point camera at your receipt</p>
        </div>
      </header>

      <section className="mt-6 px-6 flex-1 flex flex-col">
        {/* Camera / Preview */}
        {!capturedImage && !processing && (
          <div className="relative rounded-2xl overflow-hidden glass-card aspect-[3/4] flex items-center justify-center">
            {cameraOpen ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onLoadedMetadata={(e) => (e.target as HTMLVideoElement).play()}
                />
                {/* Overlay guides */}
                <div className="absolute inset-4 border-2 border-primary/40 rounded-xl pointer-events-none" />
                <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur px-3 py-1 rounded-full">
                  <p className="text-xs text-muted-foreground">Align receipt within frame</p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <span className="material-icons text-6xl text-muted-foreground">receipt_long</span>
                <p className="text-muted-foreground text-sm">Tap below to start scanning</p>
              </div>
            )}
          </div>
        )}

        {capturedImage && !processing && (
          <div className="rounded-2xl overflow-hidden glass-card aspect-[3/4]">
            <img src={capturedImage} alt="Captured receipt" className="w-full h-full object-cover" />
          </div>
        )}

        {processing && (
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                <span className="material-icons text-primary">document_scanner</span>
              </div>
              <div>
                <p className="font-bold text-foreground">Processing Receipt</p>
                <p className="text-xs text-muted-foreground">AI is extracting line items...</p>
              </div>
            </div>
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`material-icons text-lg ${step.status === "done" ? "text-green-400" :
                    step.status === "active" ? "text-primary animate-spin" :
                      step.status === "error" ? "text-destructive" : "text-muted-foreground"
                  }`}>
                  {step.status === "done" ? "check_circle" : step.status === "active" ? "sync" : step.status === "error" ? "error" : "radio_button_unchecked"}
                </span>
                <span className={`text-sm ${step.status === "active" ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
              </div>
            ))}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

        {/* Controls */}
        {!processing && (
          <div className="mt-6 flex items-center justify-center gap-4">
            {!capturedImage ? (
              <>
                {!cameraOpen ? (
                  <div className="flex flex-col gap-3 w-full">
                    <button onClick={startCamera} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center gap-2">
                      <span className="material-icons">camera_alt</span>
                      Open Camera
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 rounded-2xl glass-card text-foreground font-semibold flex items-center justify-center gap-2">
                      <span className="material-icons">photo_library</span>
                      Choose from Gallery
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={flipCamera} className="w-12 h-12 rounded-full glass-card flex items-center justify-center">
                      <span className="material-icons text-foreground">flip_camera_ios</span>
                    </button>
                    <button onClick={capturePhoto} className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-neon border-4 border-background">
                      <span className="material-icons text-primary-foreground text-4xl">camera</span>
                    </button>
                    <button onClick={stopCamera} className="w-12 h-12 rounded-full glass-card flex items-center justify-center">
                      <span className="material-icons text-foreground">close</span>
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="flex gap-3 w-full">
                <button onClick={retake} className="flex-1 py-3 rounded-2xl glass-card text-foreground font-semibold">
                  Retake
                </button>
                <button onClick={processReceipt} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2">
                  <span className="material-icons">document_scanner</span>
                  Scan Items
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default ReceiptScan;
