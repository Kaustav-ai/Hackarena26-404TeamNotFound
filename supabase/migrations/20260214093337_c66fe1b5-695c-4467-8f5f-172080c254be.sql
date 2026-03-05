
-- Attach the trigger for auto-creating profiles on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed default expense categories (user_id NULL = available to all users)
INSERT INTO public.categories (name, type, icon, user_id) VALUES
  ('Food & Dining', 'expense', 'restaurant', NULL),
  ('Groceries', 'expense', 'shopping_cart', NULL),
  ('Transport', 'expense', 'directions_car', NULL),
  ('Shopping', 'expense', 'shopping_bag', NULL),
  ('Entertainment', 'expense', 'movie', NULL),
  ('Bills & Utilities', 'expense', 'receipt', NULL),
  ('Health', 'expense', 'local_hospital', NULL),
  ('Education', 'expense', 'school', NULL),
  ('Travel', 'expense', 'flight', NULL),
  ('Personal Care', 'expense', 'spa', NULL),
  ('Rent', 'expense', 'home', NULL),
  ('Subscriptions', 'expense', 'subscriptions', NULL),
  ('Gifts', 'expense', 'card_giftcard', NULL),
  ('Others', 'expense', 'category', NULL),
  ('Salary', 'income', 'account_balance', NULL),
  ('Freelance', 'income', 'work', NULL),
  ('Investment', 'income', 'trending_up', NULL),
  ('Other Income', 'income', 'payments', NULL);
