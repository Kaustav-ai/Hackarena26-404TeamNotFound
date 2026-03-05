
-- Statement imports table
CREATE TABLE public.statement_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading',
  total_transactions INT NOT NULL DEFAULT 0,
  reviewed_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own imports" ON public.statement_imports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imports" ON public.statement_imports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own imports" ON public.statement_imports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own imports" ON public.statement_imports FOR DELETE USING (auth.uid() = user_id);

-- Imported transactions table
CREATE TABLE public.imported_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  import_id UUID NOT NULL REFERENCES public.statement_imports(id) ON DELETE CASCADE,
  payee TEXT NOT NULL,
  original_amount NUMERIC NOT NULL,
  adjusted_amount NUMERIC NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  category_id UUID REFERENCES public.categories(id),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_ignored BOOLEAN NOT NULL DEFAULT false,
  is_reviewed BOOLEAN NOT NULL DEFAULT false,
  duplicate_of UUID REFERENCES public.imported_transactions(id),
  ai_suggestion TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.imported_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own imported txns" ON public.imported_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imported txns" ON public.imported_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own imported txns" ON public.imported_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own imported txns" ON public.imported_transactions FOR DELETE USING (auth.uid() = user_id);

-- Split items table
CREATE TABLE public.split_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_transaction_id UUID NOT NULL REFERENCES public.imported_transactions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id),
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL
);
ALTER TABLE public.split_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own split items" ON public.split_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own split items" ON public.split_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own split items" ON public.split_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own split items" ON public.split_items FOR DELETE USING (auth.uid() = user_id);

-- Mapping rules table
CREATE TABLE public.mapping_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  payee_pattern TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.mapping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own rules" ON public.mapping_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rules" ON public.mapping_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rules" ON public.mapping_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own rules" ON public.mapping_rules FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for PDF statements
INSERT INTO storage.buckets (id, name, public) VALUES ('statements', 'statements', false);

CREATE POLICY "Users can upload statements" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own statements" ON storage.objects FOR SELECT USING (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own statements" ON storage.objects FOR DELETE USING (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
