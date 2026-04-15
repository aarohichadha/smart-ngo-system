-- Create the chat session tracking table
CREATE TABLE public.rag_chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ngo_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the individual messages table
CREATE TABLE public.rag_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.rag_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) for security
ALTER TABLE public.rag_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_chat_messages ENABLE ROW LEVEL SECURITY;

-- Create Policies so NGOs can only see their own chat history
CREATE POLICY "Users can create their own chat sessions"
ON public.rag_chat_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = ngo_user_id);

CREATE POLICY "Users can view their own chat sessions"
ON public.rag_chat_sessions FOR SELECT
TO authenticated
USING (auth.uid() = ngo_user_id);

CREATE POLICY "Users can delete their own chat sessions"
ON public.rag_chat_sessions FOR DELETE
TO authenticated
USING (auth.uid() = ngo_user_id);

-- Policies for Messages (messages are implicitly protected by checking the session ownership)
CREATE POLICY "Users can insert messages into their sessions"
ON public.rag_chat_messages FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.rag_chat_sessions s
        WHERE s.id = session_id AND s.ngo_user_id = auth.uid()
    )
);

CREATE POLICY "Users can view messages from their sessions"
ON public.rag_chat_messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.rag_chat_sessions s
        WHERE s.id = session_id AND s.ngo_user_id = auth.uid()
    )
);
