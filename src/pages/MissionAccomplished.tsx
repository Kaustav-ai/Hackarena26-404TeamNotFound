import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const MissionAccomplished = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const { data: profile } = useQuery({
        queryKey: ["profile", user?.id],
        queryFn: async () => {
            const { data } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
            return data;
        },
        enabled: !!user,
    });

    const streak = profile?.current_streak ?? 0;

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Lumina Finance",
                    text: `🔥 ${streak}-Day Streak! I just earned +50 XP on Lumina Finance!`,
                });
            } catch { }
        }
    };

    return (
        <div className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col items-center justify-center px-6">
            {/* Radial glow background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-96 h-96 rounded-full" style={{
                    background: "radial-gradient(circle, hsla(195, 100%, 50%, 0.15) 0%, transparent 70%)",
                }} />
            </div>

            {/* Flame icon */}
            <div className="relative mb-8">
                <div className="absolute inset-0 w-40 h-40 rounded-full animate-flame-pulse" style={{
                    margin: "-20px",
                    background: "radial-gradient(circle, hsla(195, 100%, 50%, 0.2) 0%, transparent 70%)",
                }} />
                <div className="w-28 h-28 flex items-center justify-center relative">
                    <span
                        className="material-icons animate-flame-pulse"
                        style={{
                            fontSize: "96px",
                            background: "linear-gradient(180deg, #00E5FF 0%, #2979FF 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            filter: "drop-shadow(0 0 20px hsla(195, 100%, 50%, 0.6))",
                        }}
                    >
                        local_fire_department
                    </span>
                </div>
            </div>

            {/* Title */}
            <h1 className="text-3xl font-extrabold text-foreground text-center">
                Mission Accomplished!
            </h1>
            <p className="text-lg font-semibold mt-2" style={{ color: "#00E5FF" }}>
                {streak}-Day Streak Maintained!
            </p>

            {/* XP Badge Card */}
            <div className="glass-card rounded-2xl p-5 mt-8 w-full max-w-xs text-center" style={{
                border: "1px solid hsla(195, 100%, 50%, 0.2)",
                boxShadow: "0 0 20px hsla(195, 100%, 50%, 0.1)",
            }}>
                <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="material-icons text-yellow-400 text-xl">star</span>
                    <p className="text-foreground font-bold text-lg">Daily Mission Complete</p>
                </div>
                <span
                    className="inline-block px-4 py-1.5 rounded-full text-sm font-bold animate-xp-pop"
                    style={{
                        color: "#00E5FF",
                        border: "1px solid hsla(195, 100%, 50%, 0.3)",
                        background: "hsla(195, 100%, 50%, 0.1)",
                    }}
                >
                    +50 XP
                </span>
            </div>

            {/* Buttons */}
            <div className="w-full max-w-xs mt-auto mb-12 space-y-3 pt-12">
                <Button
                    onClick={handleShare}
                    className="w-full h-14 text-lg font-bold rounded-2xl"
                    style={{
                        background: "linear-gradient(135deg, #00E5FF 0%, #00BCD4 100%)",
                        color: "#0a0f1e",
                    }}
                >
                    <span className="material-icons mr-2 text-lg">share</span>
                    Share
                </Button>
                <Button
                    onClick={() => navigate("/")}
                    variant="outline"
                    className="w-full h-14 text-lg font-bold rounded-2xl border-border/50 text-foreground"
                >
                    Back to Home
                </Button>
            </div>
        </div>
    );
};

export default MissionAccomplished;
