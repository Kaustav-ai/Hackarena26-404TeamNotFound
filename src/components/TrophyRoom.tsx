import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

interface TrophyDef {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    iconBg: string;
}

interface TrophyRoomProps {
    totalStatementsAnalyzed: number;
    totalBillsSplit: number;
    currentStreak: number;
    unlockedTrophies: string[];
}

const TrophyRoom = ({
    totalStatementsAnalyzed,
    totalBillsSplit,
    currentStreak,
    unlockedTrophies,
}: TrophyRoomProps) => {
    const [confettiFired, setConfettiFired] = useState(false);

    const trophies: TrophyDef[] = [
        {
            id: "detective",
            name: "The Detective",
            description: "Analyzed 10 statements to uncover hidden spending patterns.",
            icon: "search",
            color: "#00E5FF",
            iconBg: "hsla(195, 100%, 50%, 0.15)",
        },
        {
            id: "splitter",
            name: "The Splitter",
            description: "Successfully split 50 bills seamlessly with friends and family.",
            icon: "emoji_events",
            color: "#2979FF",
            iconBg: "hsla(224, 100%, 57%, 0.15)",
        },
        {
            id: "consistent_king",
            name: "Consistent King",
            description: "Maintained and stayed within the daily budget for 30 consecutive days.",
            icon: "military_tech",
            color: "#AB47BC",
            iconBg: "hsla(291, 47%, 51%, 0.15)",
        },
    ];

    // Fire confetti when Consistent King is newly unlocked
    useEffect(() => {
        if (
            currentStreak >= 30 &&
            unlockedTrophies.includes("consistent_king") &&
            !confettiFired
        ) {
            setConfettiFired(true);
            confetti({
                particleCount: 150,
                spread: 80,
                origin: { y: 0.7 },
                colors: ["#AB47BC", "#CE93D8", "#00E5FF", "#2979FF"],
            });
        }
    }, [currentStreak, unlockedTrophies, confettiFired]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🏆</span>
                <h3 className="text-lg font-bold text-foreground">Trophy Room</h3>
            </div>

            {trophies.map((trophy) => {
                const isUnlocked = unlockedTrophies.includes(trophy.id);

                return (
                    <div key={trophy.id} className="relative" style={{ marginTop: "12px", marginBottom: "12px" }}>
                        {/* Background glow — large blurred aura */}
                        <div className="absolute pointer-events-none" style={{
                            inset: "-12px",
                            borderRadius: "24px",
                            background: `radial-gradient(ellipse at 50% 50%, ${trophy.color}30 0%, ${trophy.color}12 40%, transparent 70%)`,
                            filter: "blur(16px)",
                        }} />
                        <div
                            className="glass-card rounded-2xl p-5 flex items-center gap-4 transition-all duration-500 relative overflow-hidden"
                            style={{
                                border: `1.5px solid ${trophy.color}50`,
                                boxShadow: `0 0 15px ${trophy.color}35, 0 0 35px ${trophy.color}20, 0 0 60px ${trophy.color}10, inset 0 0 25px ${trophy.color}0d`,
                                opacity: isUnlocked ? 1 : 0.55,
                            }}
                        >
                            {/* Icon */}
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 relative"
                                style={{
                                    background: trophy.iconBg,
                                    border: `1px solid ${trophy.color}${isUnlocked ? "30" : "15"}`,
                                }}
                            >
                                <span
                                    className="material-icons text-2xl"
                                    style={{ color: trophy.color }}
                                >
                                    {trophy.icon}
                                </span>
                                {/* Small lock overlay */}
                                {!isUnlocked && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-background/90 flex items-center justify-center border border-border/50">
                                        <span className="material-icons" style={{ fontSize: "12px", color: "hsla(0, 0%, 100%, 0.5)" }}>lock</span>
                                    </div>
                                )}
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-foreground">{trophy.name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                    {trophy.description}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default TrophyRoom;
