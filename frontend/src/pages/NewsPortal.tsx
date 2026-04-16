import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader } from 'lucide-react';

interface NewsIssue {
  issue_title: string;
  issue_type: string;
  affected_population: number;
  location: string;
  severity: 'low' | 'medium' | 'high';
  source_url: string;
}

export default function NewsPortal() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NewsIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('en');

  const searchNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    try {
      const serpBackendUrl = import.meta.env.VITE_SERP_BACKEND_URL || import.meta.env.VITE_NODE_BACKEND_URL || 'http://localhost:3000';
      const serpNewsUrl = serpBackendUrl.endsWith('/api/serp-news')
        ? serpBackendUrl
        : `${serpBackendUrl.replace(/\/api\/?$/, '')}/api/serp-news`;

      const response = await fetch(serpNewsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          filters: { country, language }
        })
      });

      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      const nextResults = Array.isArray(data)
        ? data
        : Array.isArray(data.structuredIssues)
          ? data.structuredIssues
          : [];

      setResults(nextResults);
      if (!nextResults.length) {
        setError('The backend returned no structured news items for this search.');
      }
    } catch (error) {
      console.error('News search error:', error);
      setError('Could not load news results. Check the backend console and SERP_API_KEY configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">News Portal</h1>
      
      <form onSubmit={searchNews} className="mb-8 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Search news..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <Input
            placeholder="Country (optional)"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={loading}
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={loading}
            className="px-3 py-2 border rounded-md"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="hi">Hindi</option>
          </select>
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Loader className="animate-spin mr-2" size={20} /> : null}
          Search News
        </Button>
      </form>

      {error ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((issue, idx) => (
            <Card key={idx} className="p-4 hover:shadow-lg transition-shadow">
              <h3 className="font-bold text-lg mb-2">{issue.issue_title}</h3>
              <p className="text-sm text-gray-600 mb-2">{issue.location}</p>
              <div className="space-y-1 text-sm mb-3">
                <p><strong>Type:</strong> {issue.issue_type}</p>
                <p><strong>Severity:</strong> <span className={`font-semibold ${issue.severity === 'high' ? 'text-red-600' : issue.severity === 'medium' ? 'text-orange-600' : 'text-green-600'}`}>{issue.severity}</span></p>
                <p><strong>Affected:</strong> {issue.affected_population.toLocaleString()}</p>
              </div>
              <a
                href={issue.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View Article →
              </a>
            </Card>
          ))}
        </div>
      ) : !loading && query ? (
        <p className="text-center text-gray-500">No results found</p>
      ) : null}
    </div>
  );
}