import React, { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { GeographicRegion, SimilarityResult } from '../types';

interface AIAssistantViewProps {
  regions: GeographicRegion[];
  analyses: SimilarityResult[];
  initialTargetId?: string | null;
  initialEarthId?: string | null;
  initialAnalysisId?: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTED_QUESTIONS = [
  'Why does the selected Earth region resemble this Mars or Moon site?',
  'Which terrain characteristics align most closely and what are the major differences?',
  'What additional NASA PDS or orbital datasets would improve this analog comparison?',
  'Explain the mathematical similarity methodology and datum handling in plain language.',
];

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  regions,
  analyses,
  initialTargetId,
  initialEarthId,
  initialAnalysisId,
}) => {
  const [targetRegionId, setTargetRegionId] = useState<string>(
    initialTargetId || regions.find((r) => r.planet !== 'earth')?.id || ''
  );
  const [earthRegionId, setEarthRegionId] = useState<string>(
    initialEarthId || regions.find((r) => r.planet === 'earth')?.id || ''
  );
  const [analysisId, setAnalysisId] = useState<string>(
    initialAnalysisId || analyses[0]?.analysisId || ''
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;
    setError(null);
    const nextHistory = [...messages, { role: 'user' as const, text: q }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          targetRegionId,
          earthRegionId,
          analysisId: analysisId || undefined,
          history: messages,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Assistant request failed.');
      }
      setMessages([...nextHistory, { role: 'assistant', text: data.answer }]);
    } catch (err: any) {
      setError(err?.message || 'Unable to contact AI Scientific Assistant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Grounding Context Sidebar */}
      <div className="lg:col-span-4 bg-[#0B0E17] border border-slate-800 rounded-lg p-4 space-y-4 h-fit">
        <div>
          <h3 className="text-sm font-semibold text-white">Grounded Scientific Context</h3>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            The assistant receives real elevation, slope, TRI roughness, datum, and similarity breakdown values
            for the records selected below.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mars / Moon Region</label>
            <select
              value={targetRegionId}
              onChange={(e) => setTargetRegionId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            >
              {regions
                .filter((r) => r.planet !== 'earth')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.planet.toUpperCase()}] {r.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Earth Region</label>
            <select
              value={earthRegionId}
              onChange={(e) => setEarthRegionId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            >
              {regions
                .filter((r) => r.planet === 'earth')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Completed Similarity Analysis</label>
            <select
              value={analysisId}
              onChange={(e) => setAnalysisId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded text-slate-100"
            >
              <option value="">Latest available analysis</option>
              {analyses.map((a) => (
                <option key={a.analysisId} value={a.analysisId}>
                  {a.targetRegionName} vs {a.earthRegionName} ({a.similarityScore.toFixed(1)}/100)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="text-xs font-medium text-slate-300">Suggested Research Prompts</div>
          <div className="space-y-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendQuestion(q)}
                className="w-full text-left px-3 py-2 text-xs bg-[#07090E] hover:bg-slate-800/70 border border-slate-800 rounded text-slate-300 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Viewport */}
      <div className="lg:col-span-8 bg-[#0B0E17] border border-slate-800 rounded-lg flex flex-col h-[580px]">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Planetary Terrain Research Assistant</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Grounded in database telemetry
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-2">
              <Bot className="w-8 h-8 text-cyan-400/70" />
              <div className="text-sm font-medium text-slate-200">
                Ask about terrain similarities, dataset provenance, or geomorphology
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Responses cite only measurements and metadata present in your VISION ASTRAA workspace and explicitly flag
                missing observations.
              </p>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-slate-100 ml-8'
                    : 'bg-[#07090E] border border-slate-800 text-slate-200 mr-4'
                }`}
              >
                <div className="font-mono text-[10px] text-slate-400 mb-1 uppercase">
                  {m.role === 'user' ? 'Researcher' : 'VISION ASTRAA Assistant'}
                </div>
                {m.text}
              </div>
            ))
          )}
          {loading && (
            <div className="p-3 bg-[#07090E] border border-slate-800 rounded-lg text-xs font-mono text-cyan-400 mr-8">
              Synthesizing terrain comparison metrics...
            </div>
          )}
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="p-3 border-t border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask why Atacama resembles Jezero Crater, or what datasets are missing..."
            className="flex-1 px-3 py-2 text-xs bg-[#07090E] border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
