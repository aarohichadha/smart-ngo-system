-- Add ngo_user_id column to issues table
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS ngo_user_id uuid;

-- Set default to current user for new records
ALTER TABLE public.issues ALTER COLUMN ngo_user_id SET DEFAULT auth.uid();

-- Add foreign key constraint to auth.users
ALTER TABLE public.issues 
ADD CONSTRAINT issues_ngo_user_id_fkey 
FOREIGN KEY (ngo_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_issues_ngo_user_id ON public.issues(ngo_user_id);

-- Update RLS policies to scope by owner
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own issues" ON public.issues;
DROP POLICY IF EXISTS "Users can insert their own issues" ON public.issues;
DROP POLICY IF EXISTS "Users can update their own issues" ON public.issues;
DROP POLICY IF EXISTS "Users can delete their own issues" ON public.issues;

-- Create new owner-scoped policies
CREATE POLICY "Users can view their own issues"
  ON public.issues
  FOR SELECT
  USING (auth.uid() = ngo_user_id);

CREATE POLICY "Users can insert their own issues"
  ON public.issues
  FOR INSERT
  WITH CHECK (auth.uid() = ngo_user_id);

CREATE POLICY "Users can update their own issues"
  ON public.issues
  FOR UPDATE
  USING (auth.uid() = ngo_user_id)
  WITH CHECK (auth.uid() = ngo_user_id);

CREATE POLICY "Users can delete their own issues"
  ON public.issues
  FOR DELETE
  USING (auth.uid() = ngo_user_id);
