// The party's coin: what's in the stash, a line to add to it, and the ledger
// behind it. Coin is added here, or per session under its loot.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCampaign } from '../../context/CampaignContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useItems } from '../../context/items';
import { useOpenRecord } from '../../context/NavigationContext';
import { limitFor } from '../../lib/fieldLimits';
import { lastPlayed, liveSession, sessionName } from '../../lib/sessionLifecycle';
import { COINS, formatCoins, formatLine, gpWorth, hasCoins, negate, parseCoins, splitEvenly, sumCoins } from '../../lib/treasury';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import type { TreasuryEntry } from '../../lib/database.types';

/** A line to add: gained or spent, how much, and what for. */
function CoinEntry({ sessionId, defaultSessionId, idPrefix }: {
  /** Fixes the session it's for; otherwise the DM picks. */
  sessionId?: string;
  defaultSessionId?: string | null;
  idPrefix: string;
}) {
  const ctx = useItems();
  const { sessions } = useCampaign();
  const [spent, setSpent] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [session, setSession] = useState(defaultSessionId ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const coins = parseCoins(amount);
    if (!coins) { setError('Try an amount like “120 gp, 5 sp”.'); return; }
    setError('');
    setSaving(true);
    try {
      await ctx?.addTreasury([{ ...(spent ? negate(coins) : coins), note: note.trim() || null, session_id: sessionId ?? (session || null) }]);
      setAmount('');
      setNote('');
    } catch {
      // The failed save has shown its toast; what was typed stays to try again.
    } finally {
      setSaving(false);
    }
  };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } };

  return (
    <div className="tr-entry">
      <div className="as-pills" role="radiogroup" aria-label="Gained or spent">
        {[false, true].map(isSpent => (
          // eslint-disable-next-line no-restricted-syntax -- an option in its pill group
          <button key={String(isSpent)} type="button" role="radio" aria-checked={spent === isSpent} className={`as-pill-opt${spent === isSpent ? ' is-active' : ''}`} onClick={() => setSpent(isSpent)}>
            {isSpent ? 'Spent' : 'Gained'}
          </button>
        ))}
      </div>
      <input id={`${idPrefix}-amount`} className="as-input tr-amount" value={amount} placeholder="120 gp, 5 sp" aria-label="How much" aria-invalid={!!error}
        onChange={e => { setAmount(e.target.value); setError(''); }} onKeyDown={onEnter} />
      <input className="as-input tr-note" value={note} placeholder={spent ? 'What on: passage to Waterdeep' : 'From where: the harbormaster’s bribe'} aria-label="What for"
        maxLength={limitFor('treasury_entries', 'note')} onChange={e => setNote(e.target.value)} onKeyDown={onEnter} />
      {sessionId === undefined && (
        <select className="as-select tr-session" value={session} aria-label="Session" onChange={e => setSession(e.target.value)}>
          <option value="">No session</option>
          {[...sessions].sort((a, b) => b.session_number - a.session_number).map(s => <option key={s.id} value={s.id}>{sessionName(s)}</option>)}
        </select>
      )}
      <Button size="sm" variant="secondary" onClick={() => void add()} disabled={saving || !amount.trim()}>Add</Button>
      {error && <p className="tr-error" role="alert">{error}</p>}
    </div>
  );
}

/** One line of the ledger. */
function Line({ line, showSession }: { line: TreasuryEntry; showSession: boolean }) {
  const ctx = useItems();
  const { sessions, pcs } = useCampaign();
  const open = useOpenRecord();
  const session = showSession && line.session_id ? sessions.find(s => s.id === line.session_id) : undefined;
  const pc = line.pc_id ? pcs.find(p => p.id === line.pc_id) : undefined;
  return (
    <li className="tr-line-row">
      <span className={`tr-line-coins${gpWorth(line) < 0 ? ' is-out' : ''}`}>{formatLine(line)}</span>
      <span className="tr-line-text">
        {[line.note, pc && `to ${pc.character_name}`].filter(Boolean).join(' · ')}
        {session && <>{(line.note || pc) && ' · '}<Button variant="link" onClick={() => open('sessions', session.id)}>{sessionName(session)}</Button></>}
      </span>
      <IconButton onClick={() => void ctx?.removeTreasury(line)} aria-label={`Remove ${formatLine(line)}`} title="Remove this line" style={{ width: 22, height: 22 }}>
        <X size={12} />
      </IconButton>
    </li>
  );
}

/** The whole treasury, in the Items tab. */
export function TreasuryPanel() {
  const ctx = useItems();
  const { pcs, sessions } = useCampaign();
  const confirm = useConfirm();
  if (!ctx) return null;
  const balance = sumCoins(ctx.treasury);
  const party = pcs.filter(p => p.is_active && p.character_name);
  const { each, left } = splitEvenly(balance, party.length);
  const current = liveSession(sessions) ?? lastPlayed(sessions);

  const split = async () => {
    const stays = hasCoins(left) ? ` ${formatCoins(left)} stays in the treasury.` : '';
    const who = party.length === 1 ? party[0].character_name : `Each of the ${party.length} PCs`;
    const lines = party.length === 1 ? 'a line' : 'one line per PC';
    const ok = await confirm({
      title: 'Split the coin evenly?',
      message: `${who} gets ${formatCoins(each)}.${stays} This writes ${lines} in the ledger.`,
      confirmLabel: 'Split it',
      danger: false,
    });
    if (!ok) return;
    await ctx.addTreasury(party.map(pc => ({ ...negate(each), pc_id: pc.id, note: 'Split evenly', session_id: current?.id ?? null }))).catch(() => {});
  };

  return (
    <div className="cm-detail">
      <div className="cm-eyebrow">Items</div>
      <h1 className="tr-title">Party treasury</h1>

      <div className="tr-coins" role="list" aria-label="What’s in the treasury">
        {COINS.map(c => (
          <div key={c} className={`tr-coin${balance[c] === 0 ? ' is-none' : ''}`} role="listitem">
            <span className="tr-coin-value">{balance[c].toLocaleString('en-US').replace('-', '−')}</span>
            <span className="tr-coin-name">{c}</span>
          </div>
        ))}
      </div>
      {hasCoins(balance) && <p className="as-hint tr-worth">Worth {gpWorth(balance).toLocaleString('en-US')} gp in all.</p>}

      <div className="as-fl">
        <span className="as-ll">Add a line</span>
        <CoinEntry idPrefix="tr" defaultSessionId={current?.id} />
      </div>

      {party.length > 0 && (
        <div className="as-fl">
          <span className="as-ll">Share it out</span>
          <div className="tr-split">
            <Button size="sm" variant="secondary" onClick={() => void split()} disabled={!hasCoins(each)}>Split evenly</Button>
            <span className="as-hint">
              {hasCoins(each)
                ? `${formatCoins(each)} each to ${party.length === 1 ? party[0].character_name : `the ${party.length} PCs`}${hasCoins(left) ? `, with ${formatCoins(left)} left over` : ''}.`
                : 'Not enough to go round yet.'}
            </span>
          </div>
        </div>
      )}

      <div className="as-fl">
        <span className="as-ll">Ledger</span>
        {ctx.treasury.length === 0
          ? <p className="as-empty-note">No coin yet. Add what the party finds and spends, here or under a session’s loot.</p>
          : <ul className="tr-ledger">{ctx.treasury.map(l => <Line key={l.id} line={l} showSession />)}</ul>}
      </div>
    </div>
  );
}

/** The coin a session brought in or spent, under its loot. */
export function SessionCoin({ sessionId }: { sessionId: string }) {
  const ctx = useItems();
  if (!ctx) return null;
  const lines = ctx.treasury.filter(l => l.session_id === sessionId);
  return (
    <div className="tr-session-coin">
      <div className="inv-label">Coin this session</div>
      {lines.length > 0 && <ul className="tr-ledger">{lines.map(l => <Line key={l.id} line={l} showSession={false} />)}</ul>}
      <CoinEntry idPrefix={`tr-${sessionId}`} sessionId={sessionId} />
    </div>
  );
}
