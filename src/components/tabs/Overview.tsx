import { useState, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { FormField, inputStyle, textareaStyle } from '../FormField';

export default function Overview() {
  const { overview, setOverview } = useCampaign();
  const [form, setForm] = useState(overview);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(overview);
  }, [overview]);

  const handleSave = () => {
    setOverview(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
          Campaign Overview
        </h2>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded text-sm font-semibold transition-colors"
          style={{ backgroundColor: saved ? '#1a4a1a' : '#a07830', color: saved ? '#4caf7d' : '#e8d5b0' }}
        >
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="rounded-lg p-6 border" style={{ backgroundColor: '#1a1828', borderColor: '#3a3660' }}>
        <FormField label="Campaign Title">
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., Age of Wild Magic"
            style={inputStyle}
          />
        </FormField>

        <FormField label="Plot Summary">
          <textarea
            value={form.plotSummary}
            onChange={e => setForm(prev => ({ ...prev, plotSummary: e.target.value }))}
            placeholder="The overarching story, main conflicts, and campaign themes..."
            style={{ ...textareaStyle, minHeight: '160px' }}
          />
        </FormField>

        <FormField label="Major Characters">
          <textarea
            value={form.majorCharacters}
            onChange={e => setForm(prev => ({ ...prev, majorCharacters: e.target.value }))}
            placeholder="Key villains, allies, and important figures in the campaign..."
            style={{ ...textareaStyle, minHeight: '120px' }}
          />
        </FormField>

        <FormField label="World Info & Additional Notes">
          <textarea
            value={form.worldInfo}
            onChange={e => setForm(prev => ({ ...prev, worldInfo: e.target.value }))}
            placeholder="Setting details, house rules, tone, important context..."
            style={{ ...textareaStyle, minHeight: '120px' }}
          />
        </FormField>
      </div>
    </div>
  );
}
