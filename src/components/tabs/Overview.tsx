import { useState, useEffect } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { FormField, inputStyle, textareaStyle } from '../FormField';
import { SectionHeader } from '../ui/SectionHeader';
import { Button } from '../ui/Button';

export default function Overview() {
  const { overview, setOverview } = useCampaign();
  const [form, setForm] = useState(overview);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(overview);
    setDirty(false);
  }, [overview]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = () => {
    setOverview(form);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl">
      <SectionHeader
        title="Campaign Overview"
        extra={
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs" style={{ color: '#c9a84c' }}>Unsaved changes</span>
            )}
            <Button
              variant={saved ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleSave}
              disabled={!dirty && !saved}
            >
              {saved ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      <div className="rounded-lg p-6 border" style={{ backgroundColor: '#1a1828', borderColor: '#2e2c4a' }}>
        <FormField label="Campaign Title">
          <input
            type="text"
            value={form.title}
            onChange={e => updateField('title', e.target.value)}
            placeholder="e.g., Age of Wild Magic"
            style={inputStyle}
          />
        </FormField>

        <FormField label="Plot Summary">
          <textarea
            value={form.plotSummary}
            onChange={e => updateField('plotSummary', e.target.value)}
            placeholder="The overarching story, main conflicts, and campaign themes..."
            style={{ ...textareaStyle, minHeight: '160px' }}
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Major Characters">
            <textarea
              value={form.majorCharacters}
              onChange={e => updateField('majorCharacters', e.target.value)}
              placeholder="Key villains, allies, and important figures..."
              style={{ ...textareaStyle, minHeight: '120px' }}
            />
          </FormField>

          <FormField label="World Info & Additional Notes">
            <textarea
              value={form.worldInfo}
              onChange={e => updateField('worldInfo', e.target.value)}
              placeholder="Setting details, house rules, tone, important context..."
              style={{ ...textareaStyle, minHeight: '120px' }}
            />
          </FormField>
        </div>
      </div>
    </div>
  );
}
