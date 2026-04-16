-- Seed Sample Volunteers for Testing
-- Run this in Supabase SQL Editor to add test volunteers

-- Get current user ID (replace with your actual user ID from auth.users)
-- First, insert volunteers with the current authenticated user
-- Note: You need to replace 'YOUR_USER_ID' with your actual Supabase user ID

-- For Sample 1: Water Crisis
INSERT INTO public.volunteers (ngo_user_id, name, skills, zone, availability_hours_per_week, is_active)
VALUES
  (auth.uid(), 'Rajesh Kumar', ARRAY['water'], 'North Zone', 15, true),
  (auth.uid(), 'Priya Singh', ARRAY['healthcare'], 'North Zone', 10, true),
  (auth.uid(), 'Amit Patel', ARRAY['sanitation'], 'North Zone', 12, true),
  (auth.uid(), 'Deepak Kumar', ARRAY['water'], 'North Zone', 8, true)
ON CONFLICT DO NOTHING;

-- For Sample 2: Healthcare & Education  
INSERT INTO public.volunteers (ngo_user_id, name, skills, zone, availability_hours_per_week, is_active)
VALUES
  (auth.uid(), 'Dr. Anil Sharma', ARRAY['healthcare'], 'Central Zone', 20, true),
  (auth.uid(), 'Neha Gupta', ARRAY['healthcare'], 'Central Zone', 15, true),
  (auth.uid(), 'Vikram Singh', ARRAY['education'], 'Central Zone', 12, true),
  (auth.uid(), 'Sneha Dey', ARRAY['education'], 'Central Zone', 10, true),
  (auth.uid(), 'Dr. Meera Iyer', ARRAY['healthcare'], 'Central Zone', 8, true)
ON CONFLICT DO NOTHING;

-- For Sample 3: Disaster Relief
INSERT INTO public.volunteers (ngo_user_id, name, skills, zone, availability_hours_per_week, is_active)
VALUES
  (auth.uid(), 'Rohan Kumar', ARRAY['shelter'], 'South Zone', 25, true),
  (auth.uid(), 'Ananya Mishra', ARRAY['logistics'], 'South Zone', 20, true),
  (auth.uid(), 'Sanjay Verma', ARRAY['healthcare'], 'South Zone', 15, true),
  (auth.uid(), 'Hari Singh', ARRAY['water'], 'South Zone', 12, true),
  (auth.uid(), 'Priya Nair', ARRAY['logistics'], 'South Zone', 10, true)
ON CONFLICT DO NOTHING;

-- Verify the volunteers were added
SELECT name, skills, availability_hours_per_week, is_active 
FROM public.volunteers 
WHERE ngo_user_id = auth.uid()
ORDER BY name;
