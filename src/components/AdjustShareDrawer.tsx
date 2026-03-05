import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

interface AdjustShareDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payee: string;
  totalAmount: number;
  currentAdjusted: number;
  onConfirm: (adjustedAmount: number) => void;
}

const AdjustShareDrawer = ({
  open,
  onOpenChange,
  payee,
  totalAmount,
  currentAdjusted,
  onConfirm,
}: AdjustShareDrawerProps) => {
  const [portion, setPortion] = useState(currentAdjusted);

  useEffect(() => {
    if (open) setPortion(currentAdjusted);
  }, [open, currentAdjusted]);

  const percentage = totalAmount > 0 ? Math.round((portion / totalAmount) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-deep-sea border-border/30 rounded-t-2xl">
        <SheetHeader className="flex flex-row items-center justify-between">
          <SheetTitle className="text-foreground text-xl">Adjust Share</SheetTitle>
        </SheetHeader>

        <div className="mt-5 border-t border-border/20 pt-5">
          {/* Transaction info */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
              <span className="material-icons text-primary">restaurant</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">{payee}</p>
              <p className="text-primary font-bold">₹{totalAmount.toLocaleString("en-IN")} <span className="text-muted-foreground font-normal text-sm">Total</span></p>
            </div>
          </div>

          {/* My Portion */}
          <p className="text-sm text-muted-foreground mb-2">My Portion</p>
          <div className="relative mb-6">
            <div className="flex items-center glass-card rounded-xl p-4">
              <span className="text-muted-foreground text-xl mr-2">₹</span>
              <Input
                type="number"
                value={portion}
                onChange={(e) => {
                  const v = Math.min(Math.max(0, Number(e.target.value)), totalAmount);
                  setPortion(v);
                }}
                className="border-0 bg-transparent text-3xl font-bold text-foreground p-0 h-auto focus-visible:ring-0"
              />
              <span className="ml-auto px-3 py-1 rounded-full bg-secondary text-primary text-sm font-semibold">
                {percentage}%
              </span>
            </div>
          </div>

          {/* Slider */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>₹0</span>
              <span className="uppercase tracking-wider font-semibold">My Share</span>
              <span>₹{totalAmount.toLocaleString("en-IN")}</span>
            </div>
            <Slider
              value={[portion]}
              onValueChange={([v]) => setPortion(Math.round(v))}
              min={0}
              max={totalAmount}
              step={1}
            />
            <p className="text-center text-xs text-muted-foreground mt-2">Drag to adjust amount</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-6 pb-4">
            <Button
              variant="outline"
              onClick={() => setPortion(totalAmount)}
              className="flex-1 h-12 rounded-xl border-border/50"
            >
              Reset
            </Button>
            <Button
              onClick={() => onConfirm(portion)}
              className="flex-1 h-12 rounded-xl shadow-neon font-bold"
            >
              <span className="material-icons text-sm mr-1">check</span>
              Confirm
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdjustShareDrawer;
