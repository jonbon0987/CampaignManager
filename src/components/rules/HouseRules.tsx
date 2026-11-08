// House rules: the editor in Settings, and the read-only list Play shows.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useToast } from '../../context/ToastContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import {
  RULE_TEXT_MAX, RULE_TITLE_MAX, RULE_TOPICS, byTopic, commonNotAdded, rulesOf, writtenRules,
  type CommonRule, type HouseRule, type RuleTopic,
} from '../../lib/houseRules';
import type { Json } from '../../lib/database.types';

/** Lists, adds to and changes this campaign's rules. Mount with a `key` on the campaign. */
export function HouseRulesEditor() {
  const { selectedCampaign, updateCampaign } = useCampaign();
  const toast = useToast();
  const [rules, setRules] = useState<HouseRule[]>(() => rulesOf(selectedCampaign?.house_rules));
  const campaignId = selectedCampaign?.id;
  const { status, saveNow } = useAutoSave({
    data: rules,
    delay: 800,
    onSave: async next => { if (campaignId) await updateCampaign(campaignId, { house_rules: next as unknown as Json }); },
  });

  const add = (from: Partial<CommonRule> = {}) => setRules(r => [...r, { id: crypto.randomUUID(), topic: 'Table', title: '', text: '', ...from }]);
  const change = (id: string, patch: Partial<HouseRule>) => setRules(r => r.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (rule: HouseRule) => {
    const at = rules.findIndex(r => r.id === rule.id);
    setRules(r => r.filter(x => x.id !== rule.id));
    // A blank rule has nothing worth bringing back.
    if (writtenRules([rule]).length > 0) {
      toast('House rule removed', 'success', {
        label: 'Undo',
        onClick: () => setRules(r => [...r.slice(0, at), rule, ...r.slice(at)]),
      });
    }
  };

  const offers = byTopic(commonNotAdded(rules));

  return (
    <div className="set-field hrule" id="house-rules">
      <div className="set-field-head">
        <span className="set-label">House rules</span>
        <SaveStatusIndicator status={status} onRetry={saveNow} />
      </div>
      <span className="set-help">What this table plays differently from the book. You’ll see them in Play, the assistant follows them, and players can read them if you add them to the player page. They’re words to play by: they don’t change how the dice or initiative work.</span>

      {rules.length === 0
        ? <p className="as-empty-note">No house rules yet. Pick from the common ones below, or write your own.</p>
        : (
          <ul className="hrule-list">
            {rules.map(r => (
              <li key={r.id} className="hrule-item">
                <div className="hrule-top">
                  <input className="as-input hrule-title" value={r.title} maxLength={RULE_TITLE_MAX} placeholder="Name it: Flanking"
                    aria-label="Rule name" onChange={e => change(r.id, { title: e.target.value })} />
                  <select className="as-select hrule-topic" value={r.topic} aria-label={`Topic of ${r.title || 'this rule'}`}
                    onChange={e => change(r.id, { topic: e.target.value as RuleTopic })}>
                    {RULE_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <IconButton aria-label={`Remove ${r.title || 'this rule'}`} title="Remove" onClick={() => remove(r)} style={{ width: 28, height: 28 }}>
                    <X size={14} />
                  </IconButton>
                </div>
                <textarea className="as-input hrule-text" rows={2} value={r.text} maxLength={RULE_TEXT_MAX} placeholder="How your table plays it…"
                  aria-label={`What ${r.title || 'this rule'} says`} onChange={e => change(r.id, { text: e.target.value })} />
              </li>
            ))}
          </ul>
        )}

      <div className="hrule-add">
        <Button size="sm" variant="secondary" onClick={() => add()}>+ Write your own</Button>
      </div>

      {offers.length > 0 && (
        <div className="hrule-common">
          <span className="as-ll">Common rules</span>
          {offers.map(([topic, list]) => (
            <div key={topic} className="hrule-offer" role="group" aria-label={`Common rules: ${topic}`}>
              <span className="hrule-offer-topic">{topic}</span>
              {list.map(c => (
                <Button key={c.title} size="xs" variant="secondary" title={c.text} onClick={() => add(c)}>+ {c.title}</Button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The rules at the table: read, not edited. */
export function HouseRulesList({ rules }: { rules: HouseRule[] }) {
  return (
    <div className="pt-pane">
      {byTopic(rules).map(([topic, list]) => (
        <section key={topic} className="hrule-read" aria-label={topic}>
          <div className="pt-hint hrule-read-topic">{topic}</div>
          <dl>
            {list.map(r => (
              <div key={r.id} className="hrule-read-item">
                {r.title.trim() && <dt>{r.title}</dt>}
                {r.text.trim() && <dd>{r.text}</dd>}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
