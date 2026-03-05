import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface CategoryPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (categoryId: string, categoryName?: string) => void;
}

const CategoryPickerDrawer = ({ open, onOpenChange, onSelect }: CategoryPickerDrawerProps) => {
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, icon, type");
      return data ?? [];
    },
  });

  const expenseCategories = categories?.filter((c) => c.type === "expense") ?? [];
  const incomeCategories = categories?.filter((c) => c.type === "income") ?? [];

  const renderGrid = (cats: typeof categories) => (
    <div className="grid grid-cols-3 gap-3">
      {(cats ?? []).map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id, cat.name)}
          className="glass-card rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-primary/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
            <span className="material-icons text-primary">{cat.icon}</span>
          </div>
          <span className="text-xs text-foreground font-medium text-center">{cat.name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-deep-sea border-border/30 rounded-t-2xl max-h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground text-xl">Select Category</SheetTitle>
        </SheetHeader>
        <div className="mt-4 pb-6 space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Expenses</h4>
          {renderGrid(expenseCategories)}
          {incomeCategories.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-4">Income</h4>
              {renderGrid(incomeCategories)}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CategoryPickerDrawer;
