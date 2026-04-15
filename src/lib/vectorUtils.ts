/**
 * Vector Math and Utilities for Smart NGO System
 * Handles Cosine Similarity, text chunking, and scoring for Volunteer Matching
 */

/**
 * Calculates the Cosine Similarity between two vectors.
 * Returns a score between -1 and 1 (1 being exactly the same).
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Chunks a large text document into smaller pieces for RAG.
 */
export function chunkText(text: string, maxTokens: number = 500): string[] {
  // A simple chunking strategy: split by paragraphs then group.
  // In a real app we would use a proper token counter (e.g. tiktoken).
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // approx 4 chars per token roughly
    if (currentChunk.length + paragraph.length > maxTokens * 4 && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    currentChunk += paragraph + "\n\n";
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Simple calculation of location match score (0 to 1).
 * In a real-world scenario, this would use lat/lng haversine distance.
 * Since we are doing city/region matching: it returns 1 for exact match, 
 * 0.5 for partial/region match, 0 for no match.
 */
export function calculateLocationScore(requiredLoc: string, volunteerLoc: string): number {
  if (!requiredLoc || !volunteerLoc) return 0.5; // Neutral if missing
  
  const reqL = requiredLoc.toLowerCase();
  const volL = volunteerLoc.toLowerCase();
  
  if (reqL === volL) return 1.0;
  if (reqL.includes(volL) || volL.includes(reqL)) return 0.5;
  
  return 0.1;
}

/**
 * Calculates the final Match Score for a volunteer.
 * Combines Cosine Similarity, Success Rate, and Location.
 */
export function calculateFinalMatchScore(
  cosineSimilarity: number, 
  pastSuccessRate: number = 1.0, 
  locationScore: number = 1.0
): number {
  // Normalize cosine from [-1, 1] to [0, 1]
  const normalizedCosine = Math.max(0, cosineSimilarity);
  
  // Weights (configurable based on importance)
  const W_SKILL = 0.6;
  const W_SUCCESS = 0.2;
  const W_LOCATION = 0.2;
  
  const finalScore = 
    (normalizedCosine * W_SKILL) + 
    (pastSuccessRate * W_SUCCESS) + 
    (locationScore * W_LOCATION);
    
  return Number((finalScore * 100).toFixed(1)); // Convert to percentage 0-100
}
